/* ═══════════════════════════════════════════════════════════════
   shell.js — the desktop shell
   Menu bar, control centre, dock, desktop icons, launcher,
   global shortcuts, and the file-type router.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;
  var shell = {};

  /* ───────────────────── FILE TYPE ROUTER ───────────────────── */
  DS.openPath = function (path) {
    var node = fs.node(path);
    if (!node) {
      DS.ui.toast({ icon: "info", title: "Not found", body: path });
      return;
    }
    if (node.type === "dir") { DS.wm.open("finder", { path: path }); return; }
    if (node.kind === "audio") { DS.wm.open("audiolab", { path: path }); return; }
    if (node.kind === "video") { DS.wm.open("videolab", { path: path }); return; }
    if (node.kind === "image") { DS.wm.open("photos", { path: path }); return; }
    DS.wm.open("notes", { path: path });
  };

  /* ───────────────────── CLOCK ───────────────────── */
  function startClock() {
    var day = DS.qs("#clock-day");
    var time = DS.qs("#clock-time");
    function tick() {
      var d = new Date();
      day.textContent = d.toLocaleDateString([], {
        weekday: "short", day: "numeric", month: "short"
      });
      time.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    tick();
    setInterval(tick, 10000);
  }

  /* ───────────────────── MENU BAR MENUS ───────────────────── */
  function themeItems() {
    return ["aurora", "sunset", "abyss", "verdant", "obsidian", "lumen"].map(function (t) {
      return {
        label: t.charAt(0).toUpperCase() + t.slice(1),
        icon: DS.store.get("theme") === t ? "check" : "palette",
        action: function () {
          DS.store.set("theme", t);
          DS.glass.applyTheme();
        }
      };
    });
  }

  /* Languages, as menu rows. The same list is offered from the system
     menu and from the globe in the menu bar. */
  function langItems() {
    var cur = DS.i18n.id();
    return DS.LANGS.map(function (l) {
      return {
        label: l.native + (l.id === cur ? "" : "  ·  " + l.name),
        icon: l.id === cur ? "check" : "globe",
        action: function () {
          DS.i18n.set(l.id);
          DS.ui.toast({
            icon: "globe", title: l.native,
            body: l.id === "en"
              ? "Back to the original English."
              : "Interface phrases swapped where the phrase book has them. " +
                "Settings › Language shows what is missing.",
            timeout: 5000,
            action: {
              label: "Language settings",
              run: function () { DS.wm.open("settings", { pane: "language" }); }
            }
          });
        }
      };
    });
  }

  /* Labels are kept free of numbers so the phrase book can still match
     them; the current factor rides on the section title instead, and
     only when it is worth saying. */
  function zoomTitle(label, pct) {
    return { title: pct === 100 ? label : label + "  ·  " + Math.round(pct) + "%" };
  }

  function zoomItems() {
    var pct = DS.zoom.pct();
    return [
      { label: "Zoom in", icon: "zoomIn", kbd: "Ctrl Alt +",
        action: function () { DS.zoom.step(1); } },
      { label: "Zoom out", icon: "zoomOut", kbd: "Ctrl Alt -",
        action: function () { DS.zoom.step(-1); } },
      { label: "Actual size", icon: pct === 100 ? "check" : "refresh",
        kbd: "Ctrl Alt 0", dim: pct === 100,
        action: function () { DS.zoom.reset(); } }
    ];
  }

  var MENUS = {
    system: function () {
      return [
        { title: DS.store.get("user", "you") },
        { label: "About This System", icon: "about", action: function () { DS.wm.open("about"); } },
        { label: "System Settings…", icon: "settings", kbd: "Ctrl ,", action: function () { DS.wm.open("settings"); } },
        { sep: true },
        { label: "Tune the Glass…", icon: "layers", action: function () { DS.wm.open("settings", { pane: "glass" }); } },
        { label: "Open Terminal", icon: "terminal", action: function () { DS.wm.open("terminal"); } },
        { label: "Report a bug", icon: "bug", action: function () { DS.bugs.open(); } },
        { sep: true },
        { title: "Language" }
      ].concat(langItems(), [
        { sep: true },
        { label: "Close All Windows", icon: "x", action: function () {
            DS.wm.list().forEach(function (w) { DS.wm.close(w); });
          } },
        { label: "Restart", icon: "refresh", action: function () { location.reload(); } }
      ]);
    },
    app: function () {
      var win = DS.wm.focused();
      if (!win) return [{ label: "No window open", dim: true }];
      var wz = DS.zoom.winPct(win);
      return [
        { title: win._app.name },
        { label: "Minimise", icon: "minimize", kbd: "Ctrl M", action: function () { DS.wm.minimize(win); } },
        { label: win.classList.contains("maximized") ? "Restore" : "Maximise",
          icon: "maximize", action: function () { DS.wm.toggleMax(win); } },
        { sep: true },
        zoomTitle("Window zoom", wz),
        { label: "Zoom in", icon: "zoomIn", kbd: "Ctrl Shift +",
          action: function () { DS.zoom.stepWin(win, 1); } },
        { label: "Zoom out", icon: "zoomOut", kbd: "Ctrl Shift -",
          action: function () { DS.zoom.stepWin(win, -1); } },
        { label: "Actual size", icon: wz === 100 ? "check" : "refresh",
          kbd: "Ctrl Shift 0", dim: wz === 100,
          action: function () { DS.zoom.setWin(win, 100); } },
        { sep: true },
        { label: "Close Window", icon: "x", kbd: "Ctrl W", action: function () { DS.wm.close(win); } }
      ];
    },
    view: function () {
      return [
        { title: "Theme" }
      ].concat(themeItems(), [
        { sep: true },
        zoomTitle("Zoom", DS.zoom.pct())
      ], zoomItems(), [
        { sep: true },
        { label: (DS.store.get("refraction") ? "Disable" : "Enable") + " true refraction",
          icon: "eye",
          action: function () {
            DS.store.set("refraction", !DS.store.get("refraction"));
            DS.glass.redress();
          } },
        { label: (DS.store.get("wallpaperMotion") ? "Freeze" : "Resume") + " wallpaper",
          icon: "refresh",
          action: function () {
            DS.store.set("wallpaperMotion", !DS.store.get("wallpaperMotion"));
            DS.glass.applyMotion();
          } }
      ]);
    },
    /* Phone only. Four menu-bar buttons do not fit beside a clock on a
       390px screen, so App, View and Help fold into one — the same
       item lists, concatenated, in a menu that scrolls. */
    more: function () {
      var win = DS.wm.focused();
      var out = [];
      if (win) out = out.concat(MENUS.app(), [{ sep: true }]);
      return out.concat(
        [{ title: "View" }], themeItems(),
        [zoomTitle("Zoom", DS.zoom.pct())], zoomItems(),
        [{ sep: true }, { title: "Help" }],
        [
          { label: "Take the guided tour", icon: "star",
            action: function () { DS.tour.start(); } },
          { label: "Report a bug", icon: "bug",
            action: function () { DS.bugs.open(); } },
          { label: "About This System", icon: "about",
            action: function () { DS.wm.open("about"); } }
        ]
      );
    },
    help: function () {
      return [
        { label: "Take the guided tour", icon: "star",
          action: function () { DS.tour.start(); } },
        { label: "Show me the glass", icon: "layers",
          action: function () { DS.demo.dispersion(); } },
        { label: "Report a bug", icon: "bug",
          action: function () { DS.bugs.open(); } },
        { sep: true },
        { title: "Keyboard" },
        { label: "Launcher", kbd: "Ctrl K", dim: true },
        { label: "Cycle windows", kbd: "Alt Tab", dim: true },
        { label: "Close window", kbd: "Ctrl W", dim: true },
        { label: "Minimise window", kbd: "Ctrl M", dim: true },
        { label: "Settings", kbd: "Ctrl ,", dim: true },
        { label: "Zoom the desktop", kbd: "Ctrl Alt ±", dim: true },
        { label: "Zoom this window", kbd: "Ctrl Shift ±", dim: true },
        { sep: true },
        { label: "Read the welcome file", icon: "doc", action: function () {
            DS.openPath("/Users/you/Documents/Welcome.txt");
          } },
        { label: "Glass build notes", icon: "notes", action: function () {
            DS.openPath("/Users/you/Documents/Glass Notes.md");
          } }
      ];
    }
  };

  /* The avatar bead in the menu bar. Repainted automatically whenever
     the profile changes, from the wizard or from Settings. */
  shell.paintAvatar = function () {
    var host = DS.qs("#mb-avatar");
    if (!host) return;
    var a = DS.store.get("avatar", { glyph: "✦", grad: 0 });
    DS.clear(host);
    host.appendChild(h("div.av.av-sm", {
      text: a.glyph,
      style: { background: DS.avatarGrad(a.grad) }
    }));
    host.title = DS.store.get("user", "you");
  };

  function profileMenu(btn) {
    DS.ui.pop(btn, [
      { title: DS.landing.greetWord() + ", " + DS.store.get("user", "you") },
      { label: "Appearance & bead…", icon: "palette", action: function () {
          DS.wm.open("settings", { pane: "appearance" });
        } },
      { label: "Tune the glass…", icon: "layers", action: function () {
          DS.wm.open("settings", { pane: "glass" });
        } },
      { sep: true },
      { label: "Accounts…", icon: "home", action: function () {
          DS.wm.open("settings", { pane: "users" });
        } },
      { label: "Replay first-run setup", icon: "refresh", action: function () {
          DS.store.set("setupDone", false);
          location.reload();
        } },
      { label: "Lock the screen", icon: "lock", kbd: "Ctrl L",
        action: function () { shell.lockScreen(); } }
    ]);
  }

  /* The globe carries the current language as two letters, because a
     globe alone does not tell you which language you are already in. */
  shell.paintLangPill = function () {
    var btn = DS.qs("#mb-lang");
    if (!btn) return;
    var l = DS.i18n.def();
    var tag = DS.qs(".mb-tag", btn);
    if (tag) tag.textContent = l.id.toUpperCase();
    btn.title = l.native + " — click to change language";
  };

  /* The zoom readout only exists while the desktop is not at 100%, so
     it is a state you can see rather than one you have to remember. */
  shell.paintZoomPill = function () {
    var pill = DS.qs("#mb-zoom");
    if (!pill) return;
    var pct = Math.round(DS.zoom.pct());
    pill.hidden = pct === 100;
    var num = DS.qs(".mb-tag", pill);
    if (num) num.textContent = pct + "%";
    pill.title = "Desktop at " + pct + "% — click for actual size";
  };

  function wireMenuBar() {
    DS.qsa("[data-menu]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        DS.ui.pop(btn, MENUS[btn.dataset.menu]());
      });
    });
    DS.qs("#mb-search").addEventListener("click", function () { shell.launcher(true); });
    DS.qs("#mb-glass").addEventListener("click", controlCentre);

    var lang = DS.qs("#mb-lang");
    lang.addEventListener("click", function () {
      DS.ui.pop(lang, [{ title: "Interface language" }].concat(langItems(), [
        { sep: true },
        { label: "Language settings…", icon: "settings",
          action: function () { DS.wm.open("settings", { pane: "language" }); } }
      ]));
    });

    var zpill = DS.qs("#mb-zoom");
    zpill.addEventListener("click", function () { DS.zoom.reset(); });
    zpill.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      DS.ui.ctx(e.clientX, e.clientY,
        [zoomTitle("Zoom", DS.zoom.pct())].concat(zoomItems(), [
        { sep: true },
        { label: "All zoom settings…", icon: "settings",
          action: function () { DS.wm.open("settings", { pane: "zoom" }); } }
      ]));
    });
    DS.qs("#mb-avatar").addEventListener("click", function () {
      profileMenu(DS.qs("#mb-avatar"));
    });
    DS.qs("#mb-clock").addEventListener("click", function () {
      var d = new Date();
      DS.ui.toast({
        icon: "clock",
        title: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }),
        body: d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      });
    });
  }

  /* ───────────────────── CONTROL CENTRE ─────────────────────
     A quick optical panel in the menu bar, so the glass can be
     tuned without opening Settings. */
  var ccOpen = null;
  function controlCentre() {
    if (ccOpen) { closeCC(); return; }
    var anchor = DS.qs("#mb-glass");
    var r = DS.zoom.rect(anchor);      // the desktop's own coordinates

    var quick = [
      { key: "blur", label: "Blur", min: 4, max: 60, step: 1, unit: "px" },
      { key: "alpha", label: "Tint", min: 0, max: 40, step: .5, unit: "%" },
      { key: "disperse", label: "Dispersion", min: 0, max: 160, step: 5, unit: "%" }
    ];

    var panel = h("div.cc.g");
    panel.appendChild(h("div.cc-title", { text: "Glass" }));
    quick.forEach(function (o) {
      panel.appendChild(DS.ui.sliderRow({
        label: o.label, min: o.min, max: o.max, step: o.step,
        value: DS.store.get("glass." + o.key),
        format: function (v) { return v + o.unit; },
        onInput: function (v) {
          DS.store.set("glass." + o.key, v);
          DS.glass.apply();
        }
      }));
    });
    panel.appendChild(h("div.g-sep"));
    panel.appendChild(DS.ui.row("True refraction", null,
      DS.ui.toggle(DS.store.get("refraction"), function (v) {
        DS.store.set("refraction", v);
        DS.glass.redress();
      })));
    panel.appendChild(h("div.g-sep"));
    panel.appendChild(h("div.cc-themes", {}, ["aurora", "sunset", "abyss", "verdant", "obsidian", "lumen"].map(function (t) {
      var sw = {
        aurora: "linear-gradient(135deg,#22d3ee,#a855f7)",
        sunset: "linear-gradient(135deg,#fbbf24,#f43f5e)",
        abyss: "linear-gradient(135deg,#22d3ee,#0f172a)",
        verdant: "linear-gradient(135deg,#a3e635,#14b8a6)",
        obsidian: "linear-gradient(135deg,#4c1d95,#0a0a0f)",
        lumen: "linear-gradient(135deg,#eef4ff,#93c5fd)"
      }[t];
      return h("button.cc-sw" + (DS.store.get("theme") === t ? ".on" : ""), {
        style: { background: sw }, title: t,
        onclick: function () {
          DS.store.set("theme", t);
          DS.glass.applyTheme();
          DS.qsa(".cc-sw", panel).forEach(function (b) { b.classList.remove("on"); });
          this.classList.add("on");
        }
      });
    })));
    panel.appendChild(h("button.g-btn", {
      html: DS.icon("sliders", 14) + "<span>All settings</span>",
      style: { width: "100%", "margin-top": "12px" },
      onclick: function () { closeCC(); DS.wm.open("settings", { pane: "glass" }); }
    }));

    panel.style.right = Math.max(8, DS.zoom.vw() - r.right - 20) + "px";
    panel.style.top = (r.bottom + 6) + "px";
    DS.qs("#desktop").appendChild(panel);
    DS.glass.dress(panel);
    anchor.classList.add("on");
    ccOpen = panel;

    setTimeout(function () {
      document.addEventListener("pointerdown", ccOutside, true);
    }, 0);
  }
  function ccOutside(e) {
    if (ccOpen && !ccOpen.contains(e.target) && !DS.qs("#mb-glass").contains(e.target)) closeCC();
  }
  function closeCC() {
    if (!ccOpen) return;
    document.removeEventListener("pointerdown", ccOutside, true);
    if (ccOpen.parentNode) ccOpen.parentNode.removeChild(ccOpen);
    ccOpen = null;
    DS.qs("#mb-glass").classList.remove("on");
  }

  /* ───────────────────── LOCKING ─────────────────────
     Locking drops every per-session passcode grant, so a guarded app
     asks again after the screen comes back. */
  var locked = false;

  shell.lockScreen = function () {
    if (locked) return;
    locked = true;
    DS.ui.closeMenus();
    DS.lock.revokeAll();
    DS.qs("#desktop").hidden = true;
    DS.landing.lock(function () {
      DS.qs("#desktop").hidden = false;
      locked = false;
      idleSince = Date.now();
    });
  };

  /* auto-lock on idle, when the user has asked for it */
  var idleSince = Date.now();
  function wireIdle() {
    ["pointerdown", "keydown", "wheel"].forEach(function (ev) {
      window.addEventListener(ev, function () { idleSince = Date.now(); },
        { passive: true, capture: true });
    });
    setInterval(function () {
      var mins = DS.store.get("lock.autoLockMin", 0);
      if (!mins || locked || !DS.lock.isSet()) return;
      if (Date.now() - idleSince >= mins * 60000) shell.lockScreen();
    }, 15000);
  }

  /* ───────────────────── DOCK ───────────────────── */
  shell.buildDock = function () {
    var dock = DS.qs("#dock");
    DS.clear(dock);
    var ids = DS.store.get("dockApps", []);

    var slot = 0;
    ids.forEach(function (id) {
      var app = DS.apps.get(id);
      if (!app) return;
      dock.appendChild(h("button.dk", {
        style: { "--i": slot++ },
        data: { app: app.id },
        html: DS.icon(app.icon, 24),
        onclick: function () {
          var open = DS.wm.list().filter(function (w) { return w._app.id === app.id; })[0];
          if (open && open._minimized) DS.wm.unminimize(open);
          else DS.wm.open(app.id);
        },
        oncontextmenu: function (e) {
          e.preventDefault();
          var open = DS.wm.list().filter(function (w) { return w._app.id === app.id; })[0];
          DS.ui.ctx(e.clientX, e.clientY, [
            { title: app.name },
            { label: open ? "Bring to front" : "Open", icon: "eye",
              action: function () { DS.wm.open(app.id); } },
            open ? { label: "Close", icon: "x", action: function () { DS.wm.close(open); } } : null,
            { sep: true },
            { label: "Remove from dock", icon: "trash", action: function () {
                var list = DS.store.get("dockApps", []).filter(function (x) { return x !== app.id; });
                DS.store.set("dockApps", list);
                shell.buildDock();
              } },
            { sep: true },
            { label: "Customise the dock…", icon: "sliders",
              action: function () { dockMenu(e.clientX, e.clientY); } }
          ].filter(Boolean));
        }
      }, [
        h("span.dk-tip", { text: app.name }),
        h("span.dk-dot")
      ]));
    });

    dock.appendChild(h("div.dock-sep"));
    dock.appendChild(h("button.dk", {
      style: { "--i": slot++ },
      html: DS.icon("grid", 24),
      onclick: function () { shell.launcher(true); },
      oncontextmenu: function (e) { e.preventDefault(); dockMenu(e.clientX, e.clientY); }
    }, [h("span.dk-tip", { text: "Launcher  ·  Ctrl K" })]));

    /* right-click the dock itself, not an icon */
    dock.addEventListener("contextmenu", function (e) {
      if (e.target.closest(".dk")) return;
      e.preventDefault();
      e.stopPropagation();
      dockMenu(e.clientX, e.clientY);
    });

    DS.wm.syncDock();
    DS.glass.dress(dock);
  };

  /* ── auto-hide, by proximity ───────────────────────────────────
     A binary show/hide at a fixed threshold read as a switch being
     flipped. This measures how far the pointer is from the dock's edge
     and gives it three states, so the dock leans up to meet you before
     committing.

     It also holds itself open while hovered and waits a beat after you
     leave, so the dock can never slide out from under a click that was
     already on its way. */
  var peekHold = null;

  function wireDockPeek() {
    var wrap = DS.qs(".dock-wrap");
    var NEAR = 26;      // fully out
    var FAR = 96;       // start leaning

    /* Distances in the desktop's own pixels, so the thresholds mean the
       same thing whether or not the desktop is zoomed. */
    function distance(e, pos) {
      if (pos === "left") return DS.zoom.x(e.clientX);
      if (pos === "right") return DS.zoom.vw() - DS.zoom.x(e.clientX);
      return DS.zoom.vh() - DS.zoom.y(e.clientY);
    }

    document.addEventListener("pointermove", function (e) {
      if (DS.form.touch()) return;        // no cursor, no proximity
      var d = DS.store.get("dock", {});
      var hidden = DS.form.dockAutohide() ||
        (d.hideOnMax !== false && document.body.classList.contains("has-max"));

      if (!hidden) {
        wrap.classList.remove("peek");
        wrap.classList.remove("hint");
        return;
      }
      if (peekHold) return;            // hovering, or in the grace period

      var dist = distance(e, d.position || "bottom");
      wrap.classList.toggle("peek", dist < NEAR);
      wrap.classList.toggle("hint", dist >= NEAR && dist < FAR);
    }, { passive: true });

    wrap.addEventListener("pointerenter", function () {
      if (peekHold && peekHold !== true) clearTimeout(peekHold);
      wrap.classList.add("peek");
      wrap.classList.remove("hint");
      peekHold = true;
    });
    wrap.addEventListener("pointerleave", function () {
      peekHold = setTimeout(function () {
        peekHold = null;
        wrap.classList.remove("peek");
      }, 420);
    });
  }

  /* ── right-click the dock ──────────────────────────────────────
     Everything from Settings > Desktop > Dock, offered where the dock
     actually is. It doubles as the way to put an app there: any app
     not currently in the dock is listed, and picking one adds it and
     opens it. */
  function dockMenu(x, y) {
    var d = DS.store.get("dock", {});
    function set(k, v) {
      DS.store.set("dock." + k, v);
      shell.applyDockLayout();
      shell.buildDock();
    }
    function tick(on) { return on ? "check" : "chevR"; }

    var missing = DS.apps.all().filter(function (a) {
      return DS.store.get("dockApps", []).indexOf(a.id) < 0;
    });

    var items = [
      { title: "Position" },
      { label: "Bottom", icon: tick(d.position === "bottom"),
        action: function () { set("position", "bottom"); } },
      { label: "Left", icon: tick(d.position === "left"),
        action: function () { set("position", "left"); } },
      { label: "Right", icon: tick(d.position === "right"),
        action: function () { set("position", "right"); } },

      { title: "Size" },
      { label: "Small", icon: tick(d.size <= 38),
        action: function () { set("size", 36); } },
      { label: "Medium", icon: tick(d.size > 38 && d.size < 56),
        action: function () { set("size", 46); } },
      { label: "Large", icon: tick(d.size >= 56),
        action: function () { set("size", 60); } },

      { title: "Behaviour" },
      { label: (d.magnify ? "Turn off" : "Turn on") + " magnification",
        icon: "sliders", action: function () { set("magnify", !d.magnify); } },
      { label: d.autohide ? "Always show it" : "Hide until I reach the edge",
        icon: "eye", action: function () { set("autohide", !d.autohide); } },
      { label: d.hideOnMax === false ? "Step aside when maximised"
                                     : "Stay put when maximised",
        icon: "maximize", action: function () { set("hideOnMax", d.hideOnMax === false); } }
    ];

    if (missing.length) {
      items.push({ title: "Add to the dock" });
      missing.slice(0, 8).forEach(function (a) {
        items.push({
          label: a.name, icon: a.icon,
          action: function () {
            var list = DS.store.get("dockApps", []).slice();
            list.push(a.id);
            DS.store.set("dockApps", list);
            shell.buildDock();
            DS.wm.open(a.id);
          }
        });
      });
    }

    items.push({ sep: true });
    items.push({
      label: "All dock settings…", icon: "settings",
      action: function () { DS.wm.open("settings", { pane: "desktop" }); }
    });

    DS.ui.ctx(x, y, items);
  }
  shell.dockMenu = dockMenu;

  /** Dock geometry plus the body attribute the layers key off. */
  shell.applyDockLayout = function () {
    DS.glass.applyDock();
    var d = DS.store.get("dock", {});
    document.body.dataset.dock =
      DS.form.dockAutohide() ? "hidden" : (d.position || "bottom");
  };

  /* ───────────────────── DESKTOP ICONS ───────────────────── */
  shell.buildDesktopIcons = function () {
    var host = DS.qs("#desk-icons");
    DS.clear(host);
    fs.list("/Users/you/Desktop").forEach(function (item) {
      var glyph;
      if (item.kind === "image" && item.media) {
        glyph = h("div.di-glyph");
        DS.media.url(item.media).then(function (u) {
          if (u) {
            glyph.style.backgroundImage = "url(" + u + ")";
            glyph.style.backgroundSize = "cover";
            glyph.style.backgroundPosition = "center";
          }
        });
      } else if (item.kind === "image") {
        glyph = h("div.di-glyph", { style: { background: item.node.content } });
      } else {
        var ic = item.type === "dir" ? "folder"
               : item.kind === "audio" ? "music"
               : item.kind === "video" ? "photos" : "doc";
        glyph = h("div.di-glyph", { html: DS.icon(ic, 22) });
      }
      var node = h("div.di", {}, [glyph, h("div.di-label", { text: item.name })]);
      node.addEventListener("click", function () {
        DS.qsa(".di.sel", host).forEach(function (n) { n.classList.remove("sel"); });
        node.classList.add("sel");
      });
      node.addEventListener("dblclick", function () { DS.openPath(item.path); });
      node.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        DS.ui.ctx(e.clientX, e.clientY, [
          { label: "Open", icon: "eye", action: function () { DS.openPath(item.path); } },
          { label: "Show in Finder", icon: "finder", action: function () {
              DS.wm.open("finder", { path: "/Users/you/Desktop" });
            } },
          { sep: true },
          { label: "Delete", icon: "trash", action: function () {
              DS.ui.confirm("Delete?", item.name, { ok: "Delete", danger: true })
                .then(function (yes) {
                  if (!yes) return;
                  fs.remove(item.path);
                  shell.buildDesktopIcons();
                });
            } }
        ]);
      });
      host.appendChild(node);
    });
  };

  function wireDesktopMenu() {
    var desk = DS.qs("#desktop");
    desk.addEventListener("contextmenu", function (e) {
      if (e.target.closest(".win") || e.target.closest(".dock") ||
          e.target.closest(".menubar") || e.target.closest(".di") ||
          e.target.closest(".ctx") || e.target.closest(".menu-pop") ||
          e.target.closest(".cc")) return;
      e.preventDefault();
      DS.ui.ctx(e.clientX, e.clientY, [
        { label: "New Folder", icon: "folder", action: function () {
            DS.ui.prompt("New Folder", "Create on the desktop", "untitled folder")
              .then(function (n) {
                if (!n) return;
                fs.mkdir(fs.join("/Users/you/Desktop", n));
                shell.buildDesktopIcons();
              });
          } },
        { label: "New Note", icon: "notes", action: function () { DS.wm.open("notes"); } },
        { label: "Import files…", icon: "plus", action: function () { DS.media.pick(); } },
        { sep: true },
        { title: "Add widget" }
      ].concat(
        DS.widgets.addMenu(),
        [{ sep: true }, { title: "Theme" }],
        themeItems(),
        [
          { sep: true },
          { label: "Tune the Glass…", icon: "layers", action: function () {
              DS.wm.open("settings", { pane: "glass" });
            } },
          { label: "Wallpaper studio…", icon: "palette", action: function () {
              DS.wm.open("settings", { pane: "wallpaper" });
            } },
          { label: "About This System", icon: "about", action: function () {
              DS.wm.open("about");
            } }
        ]
      ));
    });

    /* Clicking empty desktop clears the icon selection and, if the user
       has asked for it, tucks the focused window away. Anything that is
       a real surface — a window, the dock, a widget, a menu, a dialog —
       is excluded, so only a click on nothing counts as clicking away. */
    var KEEP = ".win, .dock-wrap, .menubar, .ctx, .menu-pop, .cc, .di, " +
               ".widget, .toast, .dlg-veil, .launcher";

    desk.addEventListener("pointerdown", function (e) {
      if (!e.target.closest(".di")) {
        DS.qsa(".di.sel").forEach(function (n) { n.classList.remove("sel"); });
      }
      if (e.button !== 0) return;
      if (e.target.closest(KEEP)) return;
      if (DS.store.get("autoMinimise") === "desktop") DS.wm.minimiseFocused();
    });
  }

  /* ───────────────────── DROP TO IMPORT ─────────────────────
     Dropping real files anywhere on the desktop files them by kind.
     Individual apps intercept the drop first when it lands on their
     own stage, so dropping a video on Video Lab opens it there. */
  function wireDrop() {
    var veil = DS.qs("#drop-veil");
    var depth = 0;

    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt) return false;
      return Array.prototype.indexOf.call(dt.types || [], "Files") >= 0;
    }

    window.addEventListener("dragenter", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      veil.hidden = false;
    });
    window.addEventListener("dragover", function (e) {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener("dragleave", function () {
      depth -= 1;
      if (depth <= 0) { depth = 0; veil.hidden = true; }
    });
    window.addEventListener("drop", function (e) {
      depth = 0;
      veil.hidden = true;
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      DS.media.importFiles(e.dataTransfer.files).then(function (made) {
        if (made.length === 1) DS.openPath(made[0].path);
      });
    });
  }

  /* ───────────────────── LAUNCHER ───────────────────── */
  var lch = { open: false, rows: [], idx: 0 };

  shell.launcher = function (open) {
    var host = DS.qs("#launcher");
    var input = DS.qs("#lch-input");
    if (open) {
      lch.open = true;
      host.hidden = false;
      host.classList.remove("closing");
      input.value = "";
      renderLauncher("");
      DS.glass.dress(host);
      setTimeout(function () { input.focus(); }, 40);
    } else {
      lch.open = false;
      host.classList.add("closing");
      setTimeout(function () { host.hidden = true; }, 150);
    }
  };

  function launcherActions(q) {
    /* Everything invocable comes from one registry now, so the
       launcher, the shortcut binder and `do` cannot drift apart. */
    var acts = DS.actions.search(q).map(function (a) {
      var bound = DS.store.get("shortcuts", []).filter(function (s) {
        return s.action === a.id;
      })[0];
      return {
        kind: bound ? bound.combo : "action",
        icon: a.icon || "star",
        title: a.label,
        sub: a.group,
        run: function () { DS.actions.run(a.id); }
      };
    });
    return acts;
  }


  function renderLauncher(query) {
    var host = DS.qs("#lch-results");
    var q = query.trim().toLowerCase();
    DS.clear(host);
    lch.rows = [];

    var apps = DS.apps.all().filter(function (a) {
      return !q || a.name.toLowerCase().indexOf(q) >= 0 || a.id.indexOf(q) >= 0;
    }).map(function (a) {
      return {
        kind: "app", icon: a.icon, title: a.name, sub: "Application",
        run: function () { DS.wm.open(a.id); }
      };
    });

    var files = [];
    if (q.length >= 2) {
      fs.walk("/", function (node, path) {
        if (files.length >= 12) return;
        if (node.name.toLowerCase().indexOf(q) < 0) return;
        files.push({
          kind: "file",
          icon: node.type === "dir" ? "folder" : node.kind === "image" ? "image" : "doc",
          title: node.name,
          sub: fs.dirname(path),
          run: function () { DS.openPath(path); }
        });
      });
    }

    var actions = launcherActions(q);

    var groups = [
      ["Applications", apps],
      ["Files", files],
      ["Actions", actions]
    ];

    var any = false;
    groups.forEach(function (grp) {
      if (!grp[1].length) return;
      any = true;
      host.appendChild(h("div.lch-group", { text: grp[0] }));
      grp[1].forEach(function (item) {
        var row = h("div.lch-row", {}, [
          h("div.li", { html: DS.icon(item.icon, 16) }),
          h("div.lt2", {}, [h("b", { text: item.title }), h("i", { text: item.sub })]),
          h("div.lk", { text: item.kind })
        ]);
        row.addEventListener("click", function () {
          shell.launcher(false);
          item.run();
        });
        row.addEventListener("pointerenter", function () {
          setActive(lch.rows.indexOf(row));
        });
        host.appendChild(row);
        lch.rows.push(row);
        row._run = item.run;
      });
    });

    if (!any) {
      host.appendChild(h("div.empty-state", { style: { "min-height": "120px" } }, [
        h("div", { html: DS.icon("search", 28) }),
        h("div", { text: "Nothing matches “" + query + "”" })
      ]));
    }
    setActive(0);
  }

  function setActive(i) {
    if (!lch.rows.length) return;
    lch.idx = DS.clamp(i, 0, lch.rows.length - 1);
    lch.rows.forEach(function (r, n) { r.classList.toggle("on", n === lch.idx); });
    var el = lch.rows[lch.idx];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }

  function wireLauncher() {
    var input = DS.qs("#lch-input");
    var host = DS.qs("#launcher");

    input.addEventListener("input", function () { renderLauncher(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { setActive(lch.idx + 1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { setActive(lch.idx - 1); e.preventDefault(); }
      else if (e.key === "Enter") {
        var row = lch.rows[lch.idx];
        if (row) { shell.launcher(false); row._run(); }
        e.preventDefault();
      } else if (e.key === "Escape") { shell.launcher(false); }
    });
    host.addEventListener("pointerdown", function (e) {
      if (e.target === host) shell.launcher(false);
    });
  }

  /* ───────────────────── GLOBAL SHORTCUTS ───────────────────── */
  function wireKeys() {
    document.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);

      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        shell.launcher(!lch.open);
        return;
      }
      if (e.key === "Escape" && lch.open) { shell.launcher(false); return; }
      if (mod && e.key === ",") {
        e.preventDefault();
        DS.wm.open("settings");
        return;
      }
      if (mod && (e.key === "w" || e.key === "W")) {
        var f = DS.wm.focused();
        if (f) { e.preventDefault(); DS.wm.close(f); }
        return;
      }
      if (mod && (e.key === "m" || e.key === "M") && !typing) {
        var fm = DS.wm.focused();
        if (fm) { e.preventDefault(); DS.wm.minimize(fm); }
        return;
      }
      if (mod && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        shell.lockScreen();
        return;
      }

      /* Zoom. Ctrl+Alt scales the desktop, Ctrl+Shift scales the window
         in front. Ctrl+plus on its own is the browser's, and browsers do
         not let that one go — so neither pair fights it.

         The key can arrive as "+", "=", "Add" or, on some layouts,
         nothing recognisable at all, which is why e.code is the
         fallback. */
      if (mod && (e.altKey || e.shiftKey) && !(e.altKey && e.shiftKey)) {
        var win = DS.wm.focused();
        var perWin = e.shiftKey;
        var plus = e.key === "+" || e.key === "=" || e.code === "Equal" ||
                   e.key === "Add" || e.code === "NumpadAdd";
        var minus = e.key === "-" || e.key === "_" || e.code === "Minus" ||
                    e.key === "Subtract" || e.code === "NumpadSubtract";
        var zero = e.key === "0" || e.code === "Digit0" || e.code === "Numpad0";
        if (plus || minus || zero) {
          e.preventDefault();
          if (perWin) {
            if (!win) {
              DS.ui.toast({ icon: "info", title: "No window in front",
                            body: "Window zoom needs a window.", timeout: 2600 });
            } else if (zero) DS.zoom.setWin(win, 100);
            else DS.zoom.stepWin(win, plus ? 1 : -1);
          } else {
            if (zero) DS.zoom.reset();
            else DS.zoom.step(plus ? 1 : -1);
          }
          return;
        }
      }
      if (e.key === "Tab" && e.altKey) {
        e.preventDefault();
        DS.wm.cycle();
      }
    });

    /* Escape is bound on `window`, not `document`, and that is
       deliberate. Apps register their Escape handlers on document, and
       bubble-phase document listeners fire before bubble-phase window
       listeners — so the Photos viewer gets to close itself and call
       preventDefault() before we would otherwise minimise the window
       out from under it. */
    window.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (lch.open) return;                       // the launcher owns it
      if (DS.qs(".dlg-veil")) return;             // so does a dialog

      // an open menu is the nearest thing to dismiss
      if (DS.qs("#menu-pop:not([hidden])") || DS.qs("#ctxmenu:not([hidden])") ||
          DS.qs(".cc")) {
        DS.ui.closeMenus();
        return;
      }

      if (!DS.store.get("escMinimise", true)) return;
      var f = DS.wm.focused();
      if (f && !f._minimized) {
        e.preventDefault();
        DS.wm.minimize(f);
      }
    });
  }

  /* ───────────────────── INIT ───────────────────── */
  shell.init = function () {
    DS.glass.applyTheme();
    DS.glass.apply();
    DS.glass.initSheen();

    startClock();
    wireMenuBar();
    wireDesktopMenu();
    wireLauncher();
    wireKeys();
    wireDrop();
    wireIdle();
    shell.buildDock();
    shell.buildDesktopIcons();
    shell.paintAvatar();
    shell.paintLangPill();
    shell.applyDockLayout();
    wireDockPeek();
    DS.form.init();
    DS.zoom.init();
    DS.bugs.init();

    DS.glass.applyWallpaper();
    DS.glass.applyLight();
    DS.glass.applyFinish();
    document.documentElement.setAttribute(
      "data-depth", DS.store.get("depth", true) ? "on" : "off");
    DS.widgets.init();
    DS.alarms.start();
    DS.actions.init();

    DS.store.on(function (path) {
      if (path.indexOf("avatar") === 0 || path === "user") {
        shell.paintAvatar();
        DS.users.syncActive();
      }
    });
    DS.users.ensureFirst();
    DS.glass.applyMotion();
    DS.glass.dress(DS.qs("#desktop"));

    // keep the refraction bands correct as the layout changes
    var rt = null;
    window.addEventListener("resize", function () {
      DS.glass.relight();
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () { DS.glass.redress(); }, 250);
    });

    /* the light drifts slowly when asked to, which makes every rim in
       the system breathe together */
    setInterval(function () {
      if (!DS.store.get("light.drift", false)) return;
      var t = Date.now() / 42000;
      DS.store.set("light.x", Math.round(50 + Math.sin(t) * 38));
      DS.store.set("light.y", Math.round(22 + Math.cos(t * 0.7) * 20));
      DS.glass.applyLight();
    }, 1800);
  };

  DS.shell = shell;
})(window.DS);
