// Accès aux données : Firebase (Auth anonyme + Firestore + Storage)
import { FirebaseOptions, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, User } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { Backend, ClassifyResult, InboxFile, Recording, Song } from './models';

export interface FirebaseBackendOptions {
  /** Émulateurs locaux (firebase emulators:start), pour le développement */
  emulators?: boolean;
}

const ALREADY = 'already';

function millis(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  return undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('délai dépassé')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function toSong(id: string, d: DocumentData): Song {
  return {
    id,
    title: String(d['title'] ?? ''),
    voices: d['voices'] ?? {},
    createdAt: millis(d['createdAt']),
    updatedAt: millis(d['updatedAt']),
  };
}

export async function createFirebaseBackend(
  config: FirebaseOptions,
  opts: FirebaseBackendOptions = {},
): Promise<Backend> {
  const app = initializeApp(config);
  const auth = getAuth(app);
  // Cache local : la liste s'affiche tout de suite, même sans réseau
  const db = initializeFirestore(app, {
    localCache: opts.emulators
      ? memoryLocalCache()
      : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const storage = getStorage(app);
  if (opts.emulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
  const urls = new Map<string, Promise<string>>();

  async function currentUser(): Promise<User> {
    await auth.authStateReady();
    return auth.currentUser ?? (await signInAnonymously(auth)).user;
  }

  const audioRef = (hash: string) => ref(storage, `audio/${hash}`);
  const fileDoc = (hash: string) => doc(db, 'files', hash);

  return {
    demo: false,

    async join(key) {
      try {
        const user = await withTimeout(currentUser(), 20_000);
        const member = doc(db, 'members', user.uid);
        const snap = await getDoc(member);
        if (snap.exists() && snap.data()['key'] === key) {
          // La clé a pu être supprimée depuis : lecture test
          await getDocs(query(collection(db, 'songs'), limit(1)));
          return true;
        }
        await withTimeout(setDoc(member, { key, at: serverTimestamp() }), 20_000);
        return true;
      } catch (e) {
        console.warn('join', e);
        return false;
      }
    },

    onSongs(cb, onError) {
      return onSnapshot(
        collection(db, 'songs'),
        (qs) => cb(qs.docs.map((d) => toSong(d.id, d.data()))),
        onError,
      );
    },

    onInbox(cb, onError) {
      const q = query(collection(db, 'files'), where('status', '==', 'inbox'));
      return onSnapshot(
        q,
        (qs) =>
          cb(
            qs.docs.map((d): InboxFile => {
              const x = d.data({ serverTimestamps: 'estimate' });
              return {
                hash: d.id,
                name: x['name'],
                size: x['size'],
                type: x['type'],
                source: x['source'],
                createdAt: millis(x['createdAt']) ?? Date.now(),
              };
            }),
          ),
        onError,
      );
    },

    async exists(hash) {
      return (await getDoc(fileDoc(hash))).exists();
    },

    async upload(file, name, hash, type, onProgress) {
      const task = uploadBytesResumable(audioRef(hash), file, { contentType: type });
      await new Promise<void>((resolve, reject) =>
        task.on(
          'state_changed',
          (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
          reject,
          () => resolve(),
        ),
      );
      const fileRef = fileDoc(hash);
      await runTransaction(db, async (tx) => {
        if (!(await tx.get(fileRef)).exists()) {
          tx.set(fileRef, { status: 'inbox', name, size: file.size, type, createdAt: serverTimestamp() });
        }
      });
    },

    async classify({ hash, voice, songId, newTitle }): Promise<ClassifyResult> {
      let oldHash: string | null = null;
      let id = songId ?? '';
      try {
        await runTransaction(db, async (tx) => {
          oldHash = null;
          const fileRef = fileDoc(hash);
          const fileSnap = await tx.get(fileRef);
          if (!fileSnap.exists() || fileSnap.data()['status'] !== 'inbox') throw new Error(ALREADY);
          let songRef: DocumentReference;
          let song: DocumentData;
          if (songId) {
            songRef = doc(db, 'songs', songId);
            const s = await tx.get(songRef);
            if (!s.exists()) throw new Error('morceau introuvable');
            song = s.data();
          } else {
            songRef = doc(collection(db, 'songs'));
            song = { title: (newTitle ?? '').trim(), voices: {}, createdAt: Date.now() };
          }
          id = songRef.id;
          const prev = song['voices']?.[voice] as Recording | undefined;
          oldHash = prev && prev.hash !== hash ? prev.hash : null;
          if (oldHash) tx.delete(fileDoc(oldHash));
          const voices = { ...(song['voices'] ?? {}), [voice]: { hash, at: Date.now() } };
          tx.set(songRef, { ...song, voices, updatedAt: Date.now() });
          tx.update(fileRef, { status: 'classified', song: songRef.id, voice });
        });
      } catch (e) {
        const already = e instanceof Error && e.message === ALREADY;
        if (!already) console.warn('classify', e);
        return { ok: false, reason: already ? 'already' : 'error' };
      }
      // Pas d'historique : l'ancien enregistrement de cette voix est supprimé
      const old: string | null = oldHash;
      if (old) deleteObject(audioRef(old)).catch(() => undefined);
      return { ok: true, songId: id };
    },

    async unclassify(songId, voice, hash) {
      await runTransaction(db, async (tx) => {
        const songRef = doc(db, 'songs', songId);
        const s = await tx.get(songRef);
        if (!s.exists()) return;
        const song = s.data();
        const v = song['voices']?.[voice] as Recording | undefined;
        if (!v || v.hash !== hash) return; // remplacé entre-temps
        const voices = { ...song['voices'] };
        delete voices[voice];
        tx.set(songRef, { ...song, voices });
        tx.set(
          fileDoc(v.hash),
          { status: 'inbox', createdAt: serverTimestamp(), song: deleteField(), voice: deleteField() },
          { merge: true },
        );
      });
    },

    async removeInbox(hash) {
      await deleteDoc(fileDoc(hash));
      deleteObject(audioRef(hash)).catch(() => undefined);
    },

    async renameSong(songId, title) {
      await updateDoc(doc(db, 'songs', songId), { title: title.trim() });
    },

    async deleteSong(songId) {
      await deleteDoc(doc(db, 'songs', songId));
    },

    url(hash) {
      let u = urls.get(hash);
      if (!u) {
        u = getDownloadURL(audioRef(hash));
        u.catch(() => urls.delete(hash));
        urls.set(hash, u);
      }
      return u;
    },
  };
}
