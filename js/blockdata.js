/* Shared read/write access to the "On the Block" board — one place for the
   Firebase config + connection so any page can use it. Reuses the existing
   pandy-open-2026 Realtime DB (anonymous auth) in its own trips/ room. */
window.SundayBlock = (function () {
  const CONFIG = {
    apiKey: "AIzaSyBG2oR-YOOfi_IiHBErv-rKoqJ8zfhg3Xo",
    authDomain: "pandy-open-2026.firebaseapp.com",
    databaseURL: "https://pandy-open-2026-default-rtdb.firebaseio.com",
    projectId: "pandy-open-2026",
    appId: "1:658330035817:web:1ec09298fecf05222ee4f8",
  };
  const ROOM = "sunday-funday-block-2026";
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
  let ready, mod, db, entriesRef, uid = "anon";

  function connect() {
    if (ready) return ready;
    ready = (async () => {
      const [{ initializeApp }, _db, _auth] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-database.js`),
        import(`${SDK}/firebase-auth.js`),
      ]);
      mod = _db;
      const app = initializeApp(CONFIG);
      try {
        const cred = await _auth.signInAnonymously(_auth.getAuth(app));
        uid = cred.user.uid;
      } catch (e) { /* open rules work without it */ }
      db = mod.getDatabase(app);
      entriesRef = mod.ref(db, `trips/${ROOM}/entries`);
      return true;
    })();
    return ready;
  }

  const toList = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));

  return {
    // live subscription: cb(entriesArray) on every change
    subscribe(cb) {
      return connect().then(() => mod.onValue(entriesRef, (s) => cb(toList(s.val()))));
    },
    post(entry) { return connect().then(() => mod.push(entriesRef, entry)); },
    remove(id) { return connect().then(() => mod.remove(mod.ref(db, `trips/${ROOM}/entries/${id}`))); },
    uid() { return uid; },
  };
})();
