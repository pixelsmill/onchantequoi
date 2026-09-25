// Accès aux données : Firebase (Auth anonyme + Firestore + Storage)
const V = '10.12.2';
const base = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebaseBackend(config) {
  const [{ initializeApp }, auth, fs, st] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-storage.js`),
  ]);

  const app = initializeApp(config);
  const a = auth.getAuth(app);
  const db = fs.getFirestore(app);
  const storage = st.getStorage(app);
  const urlCache = new Map();

  function waitUser() {
    return new Promise((resolve, reject) => {
      const off = auth.onAuthStateChanged(a, (u) => {
        if (u) { off(); resolve(u); }
      }, reject);
      auth.signInAnonymously(a).catch(reject);
    });
  }

  return {
    demo: false,

    // Rejoint la chorale avec la clé. Renvoie true si l'accès est accordé.
    async join(key) {
      const user = a.currentUser || await waitUser();
      const ref = fs.doc(db, 'members', user.uid);
      try {
        const snap = await fs.getDoc(ref);
        if (snap.exists() && snap.data().key === key) {
          // Vérifie que la clé est toujours valide (lecture test)
          await fs.getDocs(fs.query(fs.collection(db, 'songs'), fs.limit(1)));
          return true;
        }
        await fs.setDoc(ref, { key, at: fs.serverTimestamp() });
        return true;
      } catch (e) {
        console.warn('join', e);
        return false;
      }
    },

    onSongs(cb) {
      return fs.onSnapshot(fs.collection(db, 'songs'), (qs) => {
        cb(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => console.warn('songs', e));
    },

    onInbox(cb) {
      const q = fs.query(fs.collection(db, 'files'), fs.where('status', '==', 'inbox'));
      return fs.onSnapshot(q, (qs) => {
        cb(qs.docs.map((d) => ({ hash: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || Date.now() })));
      }, (e) => console.warn('inbox', e));
    },

    async exists(hash) {
      return (await fs.getDoc(fs.doc(db, 'files', hash))).exists();
    },

    async upload(file, hash, type) {
      await st.uploadBytes(st.ref(storage, `audio/${hash}`), file, { contentType: type });
      await fs.runTransaction(db, async (tx) => {
        const ref = fs.doc(db, 'files', hash);
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, { status: 'inbox', name: file.name || '', size: file.size, type, createdAt: fs.serverTimestamp() });
        }
      });
    },

    // Classe un audio. Renvoie { ok, reason }. Remplace l'ancien enregistrement de la même voix.
    async classify({ hash, voice, songId, newTitle }) {
      let oldHash = null;
      try {
        await fs.runTransaction(db, async (tx) => {
          const fileRef = fs.doc(db, 'files', hash);
          const fileSnap = await tx.get(fileRef);
          if (!fileSnap.exists() || fileSnap.data().status !== 'inbox') throw new Error('already');
          let songRef, song;
          if (songId) {
            songRef = fs.doc(db, 'songs', songId);
            const s = await tx.get(songRef);
            if (!s.exists()) throw new Error('nosong');
            song = s.data();
          } else {
            songRef = fs.doc(fs.collection(db, 'songs'));
            song = { title: newTitle.trim(), voices: {}, createdAt: Date.now() };
          }
          const prev = song.voices?.[voice];
          oldHash = prev && prev.hash !== hash ? prev.hash : null;
          if (oldHash) tx.delete(fs.doc(db, 'files', oldHash));
          const voices = { ...(song.voices || {}), [voice]: { hash, at: Date.now() } };
          tx.set(songRef, { ...song, voices, updatedAt: Date.now() });
          tx.update(fileRef, { status: 'classified', song: songRef.id, voice });
        });
      } catch (e) {
        return { ok: false, reason: e.message === 'already' ? 'already' : 'error' };
      }
      if (oldHash) st.deleteObject(st.ref(storage, `audio/${oldHash}`)).catch(() => {});
      return { ok: true };
    },

    // "Mal classé ?" : remet l'audio dans À classer
    async unclassify(songId, voice) {
      await fs.runTransaction(db, async (tx) => {
        const songRef = fs.doc(db, 'songs', songId);
        const s = await tx.get(songRef);
        if (!s.exists()) return;
        const song = s.data();
        const v = song.voices?.[voice];
        if (!v) return;
        const voices = { ...song.voices };
        delete voices[voice];
        tx.set(songRef, { ...song, voices });
        tx.set(fs.doc(db, 'files', v.hash), { status: 'inbox', createdAt: fs.serverTimestamp() }, { merge: true });
      });
    },

    async removeInbox(hash) {
      await fs.deleteDoc(fs.doc(db, 'files', hash));
      st.deleteObject(st.ref(storage, `audio/${hash}`)).catch(() => {});
    },

    async renameSong(songId, title) {
      await fs.updateDoc(fs.doc(db, 'songs', songId), { title: title.trim() });
    },

    async deleteSong(songId) {
      await fs.deleteDoc(fs.doc(db, 'songs', songId));
    },

    async url(hash) {
      if (!urlCache.has(hash)) urlCache.set(hash, await st.getDownloadURL(st.ref(storage, `audio/${hash}`)));
      return urlCache.get(hash);
    },
  };
}
