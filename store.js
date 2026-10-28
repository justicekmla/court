// 저장소: Firebase(실제) 또는 이 브라우저 안(시험 모드)
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDJccGprA-fLom2GPxrtNKRUXsu86pf9kg',
  authDomain: 'courtlist-8fa6c.firebaseapp.com',
  projectId: 'courtlist-8fa6c',
  storageBucket: 'courtlist-8fa6c.firebasestorage.app',
  messagingSenderId: '955730692758',
  appId: '1:955730692758:web:4fc3349f170bf2eaa350b7'
};
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

// Firestore는 "배열 안의 배열"을 못 담으므로 바꿔 담는다
function enc(v) {
  if (Array.isArray(v)) return v.map(x => Array.isArray(x) ? { _a: enc(x) } : enc(x));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = enc(v[k]); return o; }
  return v;
}
function dec(v) {
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' && !Array.isArray(x) && '_a' in x && Object.keys(x).length === 1) ? dec(x._a) : dec(x));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = dec(v[k]); return o; }
  return v;
}

export async function firebaseStore() {
  const [A, F, U] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js'), import(FB + 'firebase-auth.js')]);
  const app = A.initializeApp(FIREBASE_CONFIG);
  const db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  const auth = U.getAuth(app);
  const ref = path => F.doc(db, ...path.split('/'));
  return {
    kind: 'firebase',
    onAuth(cb) { return U.onAuthStateChanged(auth, u => cb(u ? { email: u.email } : null)); },
    async signIn(email, pw) { await U.signInWithEmailAndPassword(auth, email, pw); },
    async signOut() { await U.signOut(auth); },
    watch(path, cb, onErr) { return F.onSnapshot(ref(path), s => cb(s.exists() ? dec(s.data()) : null), e => onErr && onErr(e)); },
    async get(path) { const s = await F.getDoc(ref(path)); return s.exists() ? dec(s.data()) : null; },
    async set(path, data) { await F.setDoc(ref(path), enc(data)); },
    async merge(path, data) { await F.setDoc(ref(path), enc(data), { merge: true }); },
    async del(path) { await F.deleteDoc(ref(path)); },
    async batch(ops) { // [[path, data|null, merge?]]
      const b = F.writeBatch(db);
      for (const [p, d, m] of ops) { if (d === null) b.delete(ref(p)); else b.set(ref(p), enc(d), m ? { merge: true } : {}); }
      await b.commit();
    },
    errorText(e) {
      const c = (e && e.code) || '';
      if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-email')) return '이메일 또는 비밀번호가 맞지 않습니다.';
      if (c.includes('too-many-requests')) return '잠시 후 다시 시도하세요 (시도 횟수 초과).';
      if (c.includes('permission-denied')) return '권한이 없습니다. 로그인 상태와 Firestore 보안 규칙을 확인하세요.';
      if (c.includes('unavailable') || c.includes('network')) return '인터넷 연결을 확인하세요.';
      return (e && e.message) || String(e);
    }
  };
}

// 시험 모드: 이 브라우저(같은 컴퓨터의 여러 탭)에서만 공유
export function localStore() {
  const P = 'courtlist-test:';
  const subs = new Map();
  const read = path => { try { const s = localStorage.getItem(P + path); return s ? dec(JSON.parse(s)) : null; } catch (e) { return null; } };
  const fire = path => { const v = read(path); for (const cb of subs.get(path) || []) setTimeout(() => cb(v), 0); };
  window.addEventListener('storage', e => { if (e.key && e.key.startsWith(P)) fire(e.key.slice(P.length)); });
  const write = (path, data) => {
    if (data === null) localStorage.removeItem(P + path); else localStorage.setItem(P + path, JSON.stringify(enc(data)));
    fire(path);
  };
  const deepMerge = (a, b) => { const o = { ...(a || {}) }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? deepMerge(o[k], b[k]) : b[k]; return o; };
  return {
    kind: 'local',
    onAuth(cb) { setTimeout(() => cb({ email: '시험 모드' }), 0); return () => {}; },
    async signIn() {}, async signOut() {},
    watch(path, cb) { if (!subs.has(path)) subs.set(path, new Set()); subs.get(path).add(cb); setTimeout(() => cb(read(path)), 0); return () => subs.get(path).delete(cb); },
    async get(path) { return read(path); },
    async set(path, data) { write(path, data); },
    async merge(path, data) { write(path, deepMerge(read(path), data)); },
    async del(path) { write(path, null); },
    async batch(ops) { for (const [p, d, m] of ops) write(p, d === null ? null : (m ? deepMerge(read(p), d) : d)); },
    errorText(e) { return (e && e.message) || String(e); }
  };
}
