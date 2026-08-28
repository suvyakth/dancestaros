/* ═══════════════════════════════════════════════════════════════
   store.js — persisted system state
   Everything the user changes (theme, glass optics, files, notes,
   window layout) survives a reload via localStorage.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var KEY = "dancestar.os.v1";

  var DEFAULTS = {
    theme: "aurora",
    glass: {
      blur: 20,
      alpha: 8.5,      // stored x100 for slider friendliness
      sat: 185,
      bright: 106,
      thick: 1.3,
      disperse: 60,
      sheen: 50,
      radius: 22
    },
    refraction: true,
    wallpaperMotion: true,

    /* personalisation */
    setupDone: false,
    accentHue: null,        // null = follow the theme's own accent
    avatar: { glyph: "✦", grad: 0 },
    greeting: true,

    /* user-defined shell commands: { name: "body" } */
    customCmds: {},

    /* window behaviour */
    autoMinimise: "desktop",   // "off" | "desktop" | "focus"
    motion: "full",            // "full" | "reduced" | "off"

    /* dock */
    dock: { size: 46, position: "bottom", magnify: true, autohide: false },

    /* wallpaper studio — when custom is true these override the theme */
    wallpaper: {
      custom: false,
      base: "#0a1424",
      orbs: ["#22d3ee", "#a855f7", "#2563eb", "#14b8a6", "#ec4899"],
      size: 100,     // % of the default orb diameter
      blur: 72,
      opacity: 62,
      speed: 100,    // % of the default drift duration
      grid: 16       // grid opacity, 0 = off
    },

    /* saved looks: { name: {theme, accentHue, glass, wallpaper} } */
    looks: {},

    /* desktop widgets: [{ id, type, x, y, data }] */
    widgets: [],

    /* clock app */
    clock: {
      alarms: [],              // { id, h, m, label, on, days:[0-6] | null, lastFired }
      zones: ["local", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"]
    },

    /* focus timer */
    focus: {
      mode: "flow",            // "flow" | "pomodoro"
      ratio: 5,                // flowmodoro: break = focus / ratio
      minBreak: 3,             // minutes, floor for a flow break
      maxBreak: 30,
      pomo: { work: 25, short: 5, long: 15, cycles: 4 },
      chime: true,
      sessions: []             // { start, ms, mode }
    },
    dockApps: ["finder", "notes", "terminal", "focus", "clock", "calc",
               "music", "photos", "imagelab", "audiolab", "videolab",
               "settings", "about"],
    user: "you",
    fs: null,
    volume: 65,
    lastOpened: []
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function deepMerge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) {
      var b = base[k], o = over ? over[k] : undefined;
      if (b && typeof b === "object" && !Array.isArray(b) && b !== null) {
        out[k] = deepMerge(b, o && typeof o === "object" ? o : {});
      } else {
        out[k] = o === undefined ? b : o;
      }
    });
    // keep unknown keys the user's build may have added
    if (over) {
      Object.keys(over).forEach(function (k) {
        if (!(k in out)) out[k] = over[k];
      });
    }
    return out;
  }

  var listeners = [];
  var saveTimer = null;

  var store = {
    data: DEFAULTS,

    load: function () {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
      var parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      store.data = deepMerge(clone(DEFAULTS), parsed || {});
      return store.data;
    },

    save: function () {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        try { localStorage.setItem(KEY, JSON.stringify(store.data)); }
        catch (e) { /* storage full or blocked — the OS keeps running */ }
      }, 180);
    },

    get: function (path, fallback) {
      var cur = store.data;
      var segs = path.split(".");
      for (var i = 0; i < segs.length; i++) {
        if (cur === null || typeof cur !== "object" || !(segs[i] in cur)) return fallback;
        cur = cur[segs[i]];
      }
      return cur === undefined ? fallback : cur;
    },

    set: function (path, value) {
      var segs = path.split(".");
      var cur = store.data;
      for (var i = 0; i < segs.length - 1; i++) {
        if (typeof cur[segs[i]] !== "object" || cur[segs[i]] === null) cur[segs[i]] = {};
        cur = cur[segs[i]];
      }
      cur[segs[segs.length - 1]] = value;
      store.save();
      listeners.forEach(function (fn) {
        try { fn(path, value); } catch (e) { console.error(e); }
      });
      return value;
    },

    on: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    reset: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      store.data = deepMerge(clone(DEFAULTS), {});
    },

    defaults: DEFAULTS
  };

  DS.store = store;
})(window.DS);
