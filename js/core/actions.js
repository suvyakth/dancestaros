/* ═══════════════════════════════════════════════════════════════
   actions.js — one registry of things the OS can be told to do,
                and the keyboard that fires them

   Before this, "open Settings" existed three times: once in a menu
   handler, once in a launcher row, once in a shell command. Binding
   a key to it would have made four. So every invocable thing is now
   a named action with an id, and the launcher, the shortcut engine
   and the `do` command are three front ends onto the same list.

   Adding an action makes it searchable, bindable and scriptable at
   the same time, for free.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var registry = {};
  var order = [];

  /* ───────────────────── COMBOS ─────────────────────
     Normalised to "Ctrl+Shift+K": modifiers in a fixed order, then
     the key, uppercased for letters. Meta folds into Ctrl so a
     shortcut recorded on a Mac still fires on Windows. */
  function comboOf(e) {
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    var k = e.key;
    if (["Control", "Meta", "Alt", "Shift"].indexOf(k) >= 0) return null;
    if (k === " ") k = "Space";
    else if (k.length === 1) k = k.toUpperCase();
    parts.push(k);
    return parts.join("+");
  }

  /* Shortcuts the shell already owns. Listed so the recorder can warn
     rather than let someone shadow Ctrl+K and wonder why. */
  var RESERVED = {
    "Ctrl+K": "Launcher",
    "Ctrl+W": "Close window",
    "Ctrl+M": "Minimise window",
    "Ctrl+L": "Lock the screen",
    "Ctrl+,": "Settings",
    "Alt+Tab": "Cycle windows",
    "Escape": "Minimise / dismiss"
  };

  var actions = {
    RESERVED: RESERVED,
    comboOf: comboOf,

    register: function (def) {
      if (!registry[def.id]) order.push(def.id);
      registry[def.id] = def;
      return def;
    },

    get: function (id) { return registry[id]; },
    all: function () { return order.map(function (id) { return registry[id]; }); },

    run: function (id) {
      seed();
      var a = registry[id];
      if (!a) {
        DS.ui.toast({ icon: "info", title: "Unknown action", body: id });
        return false;
      }
      try { a.run(); }
      catch (e) { DS.ui.toast({ icon: "info", title: a.label + " failed", body: e.message }); }
      return true;
    },

    /** Everything matching a query, for the launcher and the picker. */
    search: function (q) {
      var s = String(q || "").toLowerCase();
      return actions.all().filter(function (a) {
        return !s || a.label.toLowerCase().indexOf(s) >= 0 ||
               (a.group || "").toLowerCase().indexOf(s) >= 0;
      });
    },

    /* ───────────── the shortcut engine ───────────── */
    bindingFor: function (combo) {
      return DS.store.get("shortcuts", []).filter(function (s) {
        return s.combo === combo;
      })[0] || null;
    },

    add: function (combo, actionId) {
      var list = DS.store.get("shortcuts", []).filter(function (s) {
        return s.combo !== combo;
      });
      list.push({ id: DS.uid("sc"), combo: combo, action: actionId });
      DS.store.set("shortcuts", list);
    },

    remove: function (id) {
      DS.store.set("shortcuts", DS.store.get("shortcuts", []).filter(function (s) {
        return s.id !== id;
      }));
    },

    init: function () {
      if (actions._live) return;
      actions._live = true;
      seed();   // apps and widgets have all registered by now

      document.addEventListener("keydown", function (e) {
        // never steal a key from someone typing
        var t = document.activeElement;
        if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          return;
        }
        if (DS.qs(".dlg-veil")) return;

        var combo = comboOf(e);
        if (!combo) return;
        var hit = actions.bindingFor(combo);
        if (!hit) return;

        e.preventDefault();
        e.stopPropagation();
        actions.run(hit.action);
      }, true);
    }
  };

  /* ───────────────────── BUILT-IN ACTIONS ─────────────────────
     Registered lazily on first read, because apps and widgets have
     not finished registering themselves when this file runs. */
  var seeded = false;
  function seed() {
    if (seeded) return;
    seeded = true;

    DS.apps.all().forEach(function (app) {
      actions.register({
        id: "app:" + app.id,
        label: "Open " + app.name,
        icon: app.icon,
        group: "Apps",
        run: function () { DS.wm.open(app.id); }
      });
    });

    ["aurora", "sunset", "abyss", "verdant", "obsidian", "lumen"].forEach(function (t) {
      actions.register({
        id: "theme:" + t,
        label: "Theme: " + t.charAt(0).toUpperCase() + t.slice(1),
        icon: "palette",
        group: "Appearance",
        run: function () { DS.store.set("theme", t); DS.glass.applyTheme(); }
      });
    });

    Object.keys(DS.glass.PRESETS).forEach(function (p) {
      actions.register({
        id: "preset:" + p,
        label: "Glass: " + DS.glass.PRESETS[p].label,
        icon: "layers",
        group: "Appearance",
        run: function () { DS.glass.usePreset(p); }
      });
    });

    Object.keys(DS.glass.FINISHES).forEach(function (f) {
      actions.register({
        id: "finish:" + f,
        label: "Finish: " + DS.glass.FINISHES[f].label,
        icon: "layers",
        group: "Appearance",
        run: function () { DS.store.set("finish", f); DS.glass.applyFinish(); }
      });
    });

    Object.keys(DS.widgets.TYPES).forEach(function (w) {
      actions.register({
        id: "widget:" + w,
        label: "Add widget: " + DS.widgets.TYPES[w].label,
        icon: DS.widgets.TYPES[w].icon,
        group: "Widgets",
        run: function () { DS.widgets.add(w); }
      });
    });

    [
      ["sys:launcher", "Open the launcher", "search", function () { DS.shell.launcher(true); }],
      ["sys:lock", "Lock the screen", "lock", function () { DS.shell.lockScreen(); }],
      ["sys:import", "Import files", "plus", function () { DS.media.pick(); }],
      ["sys:closeall", "Close all windows", "x", function () {
        DS.wm.list().forEach(function (w) { DS.wm.close(w); });
      }],
      ["sys:minimise", "Minimise the focused window", "minimize", function () {
        DS.wm.minimiseFocused();
      }],
      ["sys:cycle", "Cycle windows", "layers", function () { DS.wm.cycle(); }],
      ["sys:refraction", "Toggle true refraction", "eye", function () {
        DS.store.set("refraction", !DS.store.get("refraction"));
        DS.glass.redress();
      }],
      ["sys:shatter", "Toggle shatter on close", "layers", function () {
        var v = !DS.store.get("shatter", true);
        DS.store.set("shatter", v);
        DS.ui.toast({ icon: "layers", title: "Shatter " + (v ? "on" : "off") });
      }],
      ["sys:drift", "Toggle the drifting light", "sun", function () {
        var v = !DS.store.get("light.drift", false);
        DS.store.set("light.drift", v);
        DS.ui.toast({ icon: "sun", title: "Light drift " + (v ? "on" : "off") });
      }],
      ["sys:wallpaper", "Randomise the wallpaper", "image", function () {
        var r = function () {
          return "#" + [0, 0, 0].map(function () {
            return ("0" + Math.floor(40 + Math.random() * 200).toString(16)).slice(-2);
          }).join("");
        };
        DS.store.set("wallpaper.custom", true);
        DS.store.set("wallpaper.orbs", [r(), r(), r(), r(), r()]);
        DS.glass.applyWallpaper();
      }],
      ["widget:clearall", "Remove all widgets", "trash", function () {
        DS.widgets.clear();
        DS.ui.toast({ icon: "trash", title: "Desktop cleared" });
      }],
      ["focus:toggle", "Focus: start / pause", "star", function () { DS.focus.toggle(); }],
      ["focus:break", "Focus: take the earned break", "clock", function () { DS.focus.skip(); }],
      ["cal:today", "Calendar: jump to today", "grid", function () {
        DS.wm.open("calendar", { today: true });
      }],
      ["cal:new", "Calendar: new event", "plus", function () {
        DS.wm.open("calendar", { compose: true });
      }],
      ["note:new", "New note", "notes", function () { DS.wm.open("notes"); }],
      ["term:new", "Open the shell", "terminal", function () { DS.wm.open("terminal"); }]
    ].forEach(function (a) {
      actions.register({ id: a[0], label: a[1], icon: a[2], group: "System", run: a[3] });
    });
  }

  var _all = actions.all;
  actions.all = function () { seed(); return _all(); };
  var _get = actions.get;
  actions.get = function (id) { seed(); return _get(id); };

  DS.actions = actions;
})(window.DS);
