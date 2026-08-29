/* ═══════════════════════════════════════════════════════════════
   users.js — accounts

   The whole OS state is one localStorage key, which made accounts
   simple: each user owns a complete snapshot of that key, and
   switching is save-mine, load-theirs, reload.

     dancestar.users.v1     the roster, and who is signed in
     dancestar.os.v1        the ACTIVE user's state (what everything
                            else in the OS reads and writes)
     dancestar.user.<id>    every other user's parked snapshot

   Nothing else in the codebase had to learn about accounts. Apps,
   settings, files and widgets all still talk to one store.

   Same honesty as the passcode: separate accounts, not secure ones.
   Another user of this browser can read every snapshot.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var ROSTER = "dancestar.users.v1";
  var LIVE = "dancestar.os.v1";
  var SNAP = "dancestar.user.";

  function readJSON(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  function roster() {
    var r = readJSON(ROSTER, null);
    if (!r || !r.list) r = { list: [], active: null };
    return r;
  }

  var users = {
    list: function () { return roster().list; },

    activeId: function () { return roster().active; },

    active: function () {
      var r = roster();
      return r.list.filter(function (u) { return u.id === r.active; })[0] || null;
    },

    count: function () { return roster().list.length; },

    /** Called once the first user finishes setup. */
    ensureFirst: function () {
      var r = roster();
      if (r.list.length) return users.active();
      var me = {
        id: DS.uid("u"),
        name: DS.store.get("user", "you"),
        grad: DS.store.get("avatar.grad", 0),
        glyph: DS.store.get("avatar.glyph", "✦"),
        created: Date.now()
      };
      r.list.push(me);
      r.active = me.id;
      writeJSON(ROSTER, r);
      return me;
    },

    /** Keep the roster card in step with the live profile. */
    syncActive: function () {
      var r = roster();
      var me = r.list.filter(function (u) { return u.id === r.active; })[0];
      if (!me) return;
      me.name = DS.store.get("user", "you");
      me.grad = DS.store.get("avatar.grad", 0);
      me.glyph = DS.store.get("avatar.glyph", "✦");
      me.hasLock = DS.lock.isSet();
      writeJSON(ROSTER, r);
    },

    /** A fresh account starts from factory defaults, not a copy. */
    add: function (name) {
      var r = roster();
      var u = {
        id: DS.uid("u"),
        name: (name || "").trim() || "New user",
        grad: r.list.length % 10,
        glyph: "✦",
        created: Date.now(),
        fresh: true
      };
      r.list.push(u);
      writeJSON(ROSTER, r);
      return u;
    },

    remove: function (id) {
      var r = roster();
      if (r.list.length < 2) return false;
      r.list = r.list.filter(function (u) { return u.id !== id; });
      try { localStorage.removeItem(SNAP + id); } catch (e) {}
      if (r.active === id) r.active = r.list[0].id;
      writeJSON(ROSTER, r);
      return true;
    },

    /** Park the live state, wake the target's, restart. */
    switchTo: function (id) {
      var r = roster();
      var target = r.list.filter(function (u) { return u.id === id; })[0];
      if (!target || id === r.active) return false;

      users.syncActive();
      try {
        if (r.active) localStorage.setItem(SNAP + r.active, localStorage.getItem(LIVE) || "");
      } catch (e) {}

      var snap = null;
      try { snap = localStorage.getItem(SNAP + id); } catch (e) {}

      if (snap) {
        try { localStorage.setItem(LIVE, snap); } catch (e) {}
      } else {
        // never used before: factory defaults, carrying only their name
        try { localStorage.removeItem(LIVE); } catch (e) {}
        DS.store.reset();
        DS.store.data.user = target.name;
        DS.store.data.avatar = { glyph: target.glyph, grad: target.grad };
        DS.store.data.setupDone = !target.fresh;
        try { localStorage.setItem(LIVE, JSON.stringify(DS.store.data)); } catch (e) {}
        delete target.fresh;
      }

      r.active = id;
      writeJSON(ROSTER, r);
      location.reload();
      return true;
    },

    /** Bytes each account is holding. */
    sizes: function () {
      var r = roster();
      return r.list.map(function (u) {
        var raw = "";
        try {
          raw = u.id === r.active
            ? (localStorage.getItem(LIVE) || "")
            : (localStorage.getItem(SNAP + u.id) || "");
        } catch (e) {}
        return { user: u, bytes: raw.length, active: u.id === r.active };
      });
    }
  };

  DS.users = users;
})(window.DS);
