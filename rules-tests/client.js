// Les opérations du client web, reprises telles quelles de specs/public/backend-firebase.js
// (le client Angular fait les mêmes). Différences : les erreurs ne sont pas avalées, pour que
// les tests voient les refus des règles, et les suppressions Storage sont attendues.
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, onSnapshot, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// Premier instantané confirmé par le serveur d'un onSnapshot (rejeté si les règles refusent l'écoute).
// Un instantané venu du cache local peut arriver avant le refus : on l'ignore.
const firstSnapshot = (q) => new Promise((resolve, reject) => {
  const off = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    if (snap.metadata.fromCache) return;
    off();
    resolve(snap);
  }, reject);
});

// choir = null : anciens emplacements (songs, files, audio/{sha256}) ;
// choir = '1', '2'… : choirs/{chorale}/songs, choirs/{chorale}/files, audio/{chorale}/{sha256}
export function client(db, storage, choir = null) {
  const S = choir ? `choirs/${choir}/songs` : 'songs';
  const F = choir ? `choirs/${choir}/files` : 'files';
  const A = choir ? `audio/${choir}` : 'audio';
  const inboxQuery = () => query(collection(db, F), where('status', '==', 'inbox'));

  return {
    // Rejoindre : fiche members/{uid}, puis lecture test des morceaux
    // (nouvelle version : une clé par chorale, fusionnée dans la fiche)
    async join(uid, key) {
      const member = doc(db, 'members', uid);
      if (choir) await setDoc(member, { keys: { [choir]: key }, last: choir, at: serverTimestamp() }, { merge: true });
      else await setDoc(member, { key, at: serverTimestamp() });
      await getDocs(query(collection(db, S), limit(1)));
    },
    myMember: (uid) => getDoc(doc(db, 'members', uid)),

    songs: () => getDocs(collection(db, S)),
    onSongs: () => firstSnapshot(collection(db, S)),
    inbox: () => getDocs(inboxQuery()),
    onInbox: () => firstSnapshot(inboxQuery()),

    exists: async (hash) => (await getDoc(doc(db, F, hash))).exists(),

    // Dépôt, partie Firestore : crée files/{hash} s'il n'existe pas encore
    addToInbox(hash, { name = 'WhatsApp Audio 2026-09-23 at 22.34.43.mp4', size = 1234, type = 'audio/mp4', duration } = {}) {
      return runTransaction(db, async (tx) => {
        const r = doc(db, F, hash);
        const snap = await tx.get(r);
        if (!snap.exists()) {
          tx.set(r, { status: 'inbox', name, size, type, ...(duration != null ? { duration } : {}), createdAt: serverTimestamp() });
        }
      });
    },

    // Dépôt complet : Storage puis Firestore
    async upload(hash, bytes, type = 'audio/mp4', name = 'audio.m4a') {
      await uploadBytes(ref(storage, `${A}/${hash}`), bytes, { contentType: type });
      await this.addToInbox(hash, { name, size: bytes.length, type });
    },

    // Classe un audio. Renvoie { ok, reason, songId, oldHash }. Remplace l'ancien enregistrement de la même voix.
    async classify({ hash, voice, songId, newTitle }) {
      let oldHash = null;
      let id = null;
      try {
        await runTransaction(db, async (tx) => {
          const fileRef = doc(db, F, hash);
          const fileSnap = await tx.get(fileRef);
          if (!fileSnap.exists() || fileSnap.data().status !== 'inbox') throw new Error('already');
          let songRef, song;
          if (songId) {
            songRef = doc(db, S, songId);
            const s = await tx.get(songRef);
            if (!s.exists()) throw new Error('nosong');
            song = s.data();
          } else {
            songRef = doc(collection(db, S));
            song = { title: newTitle.trim(), voices: {}, createdAt: Date.now() };
          }
          const prev = song.voices?.[voice];
          oldHash = prev && prev.hash !== hash ? prev.hash : null;
          if (oldHash) tx.delete(doc(db, F, oldHash));
          const voices = { ...(song.voices || {}), [voice]: { hash, at: Date.now() } };
          tx.set(songRef, { ...song, voices, updatedAt: Date.now() });
          tx.update(fileRef, { status: 'classified', song: songRef.id, voice });
          id = songRef.id;
        });
      } catch (e) {
        if (e.message === 'already') return { ok: false, reason: 'already' };
        throw e;
      }
      if (oldHash && storage) await deleteObject(ref(storage, `${A}/${oldHash}`));
      return { ok: true, songId: id, oldHash };
    },

    // « Mal classé ? » : remet l'audio dans « À classer »
    unclassify(songId, voice) {
      return runTransaction(db, async (tx) => {
        const songRef = doc(db, S, songId);
        const s = await tx.get(songRef);
        if (!s.exists()) return;
        const song = s.data();
        const v = song.voices?.[voice];
        if (!v) return;
        const voices = { ...song.voices };
        delete voices[voice];
        tx.set(songRef, { ...song, voices });
        tx.set(doc(db, F, v.hash), { status: 'inbox', createdAt: serverTimestamp() }, { merge: true });
      });
    },

    async removeInbox(hash) {
      await deleteDoc(doc(db, F, hash));
      if (storage) await deleteObject(ref(storage, `${A}/${hash}`));
    },

    renameSong: (songId, title) => updateDoc(doc(db, S, songId), { title: title.trim() }),
    setLyrics: (songId, lyrics) =>
      updateDoc(doc(db, S, songId), { lyrics: lyrics.trim() || deleteField() }),
    deleteSong: (songId) => deleteDoc(doc(db, S, songId)),
    url: (hash) => getDownloadURL(ref(storage, `${A}/${hash}`)),
  };
}
