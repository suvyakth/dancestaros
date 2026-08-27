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
    return ["aurora", "sunset", "abyss", "verdant", "lumen"].map(function (t) {
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

  var MENUS = {
    system: function () {
      return [
        { title: DS.store.get("user", "you") },
        { label: "About This System", icon: "about", action: function () { DS.wm.open("about"); } },
        { label: "System Settings…", icon: "settings", kbd: "Ctrl ,", action: function () { DS.wm.open("settings"); } },
        { sep: true },
        { label: "Tune the Glass…", icon: "layers", action: function () { DS.wm.open("settings", { pane: "glass" }); } },
        { label: "Open Terminal", icon: "terminal", action: function () { DS.wm.open("terminal"); } },
        { sep: true },
        { label: "Close All Windows", icon: "x", action: function () {
            DS.wm.list().forEach(function (w) { DS.wm.close(w); });
          } },
        { label: "Restart", icon: "refresh", action: function () { location.reload(); } }
      ];
    },
    app: function () {
      var win = DS.wm.focused();
      if (!win) return [{ label: "No window open", dim: true }];
      return [
        { title: win._app.name },
        { label: "Minimise", icon: "minimize", kbd: "Ctrl M", action: function () { DS.wm.minimize(win); } },
        { label: win.classList.contains("maximized") ? "Restore" : "Maximise",
          icon: "maximize", action: function () { DS.wm.toggleMax(win); } },
        { sep: true },
        { label: "Close Window", icon: "x", kbd: "Ctrl W", action: function () { DS.wm.close(win); } }
      ];
    },
    view: function () {
      return [
        { title: "Theme" }
      ].concat(themeItems(), [
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
    help: function () {
      return [
        { title: "Keyboard" },
        { label: "Launcher", kbd: "Ctrl K", dim: true },
        { label: "Cycle windows", kbd: "Alt Tab", dim: true },
        { label: "Close window", kbd: "Ctrl W", dim: true },
        { label: "Minimise window", kbd: "Ctrl M", dim: true },
        { label: "Settings", kbd: "Ctrl ,", dim: true },
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
      { label: "Replay first-run setup", icon: "refresh", action: function () {
          DS.store.set("setupDone", false);
          location.reload();
        } },
      { label: "Lock the screen", icon: "lock", action: function () {
          DS.qs("#desktop").hidden = true;
          DS.landing.lock(function () { DS.qs("#desktop").hidden = false; });
        } }
    ]);
  }

  function wireMenuBar() {
    DS.qsa("[data-menu]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        DS.ui.pop(btn, MENUS[btn.dataset.menu]());
      });
    });
    DS.qs("#mb-search").addEventListener("click", function () { shell.launcher(true); });
    DS.qs("#mb-glass").addEventListener("click", controlCentre);
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
    var r = anchor.getBoundingClientRect();

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
    panel.appendChild(h("div.cc-themes", {}, ["aurora", "sunset", "abyss", "verdant", "lumen"].map(function (t) {
      var sw = {
        aurora: "linear-gradient(135deg,#22d3ee,#a855f7)",
        sunset: "linear-gradient(135deg,#fbbf24,#f43f5e)",
        abyss: "linear-gradient(135deg,#22d3ee,#0f172a)",
        verdant: "linear-gradient(135deg,#a3e635,#14b8a6)",
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

    panel.style.right = Math.max(8, window.innerWidth - r.right - 20) + "px";
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

  /* ───────────────────── DOCK ───────────────────── */
  shell.buildDock = function () {
    var dock = DS.qs("#dock");
    DS.clear(dock);
    var ids = DS.store.get("dockApps", []);

    ids.forEach(function (id) {
      var app = DS.apps.get(id);
      if (!app) return;
      dock.appendChild(h("button.dk", {
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
              } }
          ].filter(Boolean));
        }
      }, [
        h("span.dk-tip", { text: app.name }),
        h("span.dk-dot")
      ]));
    });

    dock.appendChild(h("div.dock-sep"));
    dock.appendChild(h("button.dk", {
      html: DS.icon("grid", 24),
      onclick: function () { shell.launcher(true); }
    }, [h("span.dk-tip", { text: "Launcher  ·  Ctrl K" })]));

    DS.wm.syncDock();
    DS.glass.dress(dock);
  };

  /* ───────────────────── DESKTOP ICONS ───────────────────── */
  shell.buildDesktopIcons = function () {
    var host = DS.qs("#desk-icons");
    DS.clear(host);
    fs.list("/Users/you/Desktop").forEach(function (item) {
      var glyph = item.kind === "image"
        ? h("div.di-glyph", { style: { background: item.node.content } })
        : h("div.di-glyph", { html: DS.icon(item.type === "dir" ? "folder" : "doc", 22) });
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
        { sep: true },
        { title: "Theme" }
      ].concat(themeItems(), [
        { sep: true },
        { label: "Tune the Glass…", icon: "layers", action: function () {
            DS.wm.open("settings", { pane: "glass" });
          } },
        { label: "About This System", icon: "about", action: function () { DS.wm.open("about"); } }
      ]));
    });

    desk.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".di")) return;
      DS.qsa(".di.sel").forEach(function (n) { n.classList.remove("sel"); });
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
    var acts = [];
    ["aurora", "sunset", "abyss", "verdant", "lumen"].forEach(function (t) {
      acts.push({
        kind: "action", icon: "palette",
        title: "Theme: " + t.charAt(0).toUpperCase() + t.slice(1),
        sub: "Switch the desktop theme",
        run: function () { DS.store.set("theme", t); DS.glass.applyTheme(); }
      });
    });
    acts.push({
      kind: "action", icon: "layers", title: "Tune the glass",
      sub: "Open the optical settings",
      run: function () { DS.wm.open("settings", { pane: "glass" }); }
    });
    acts.push({
      kind: "action", icon: "eye",
      title: (DS.store.get("refraction") ? "Disable" : "Enable") + " true refraction",
      sub: "Toggle the SVG displacement pass",
      run: function () {
        DS.store.set("refraction", !DS.store.get("refraction"));
        DS.glass.redress();
      }
    });
    acts.push({
      kind: "action", icon: "x", title: "Close all windows",
      sub: DS.wm.list().length + " open",
      run: function () { DS.wm.list().forEach(function (w) { DS.wm.close(w); }); }
    });
    return acts.filter(function (a) {
      return !q || a.title.toLowerCase().indexOf(q) >= 0;
    });
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
      if (e.key === "Tab" && e.altKey) {
        e.preventDefault();
        DS.wm.cycle();
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
    shell.buildDock();
    shell.buildDesktopIcons();
    shell.paintAvatar();

    DS.store.on(function (path) {
      if (path.indexOf("avatar") === 0 || path === "user") shell.paintAvatar();
    });
    DS.glass.applyMotion();
    DS.glass.dress(DS.qs("#desktop"));

    // keep the refraction bands correct as the layout changes
    var rt = null;
    window.addEventListener("resize", function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () { DS.glass.redress(); }, 250);
    });
  };

  DS.shell = shell;
})(window.DS);
