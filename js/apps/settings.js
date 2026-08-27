/* ═══════════════════════════════════════════════════════════════
   settings.js — System Settings

   The Glass pane is the point of the whole project: every optical
   property is exposed as a live slider. Drag Dispersion to 0 and
   the glass visibly becomes frosted plastic — which is the clearest
   way to show what that layer is actually doing.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var THEMES = [
    { id: "aurora",  name: "Aurora",  swatch: "linear-gradient(135deg,#22d3ee,#2563eb 45%,#a855f7)" },
    { id: "sunset",  name: "Sunset",  swatch: "linear-gradient(135deg,#fbbf24,#f43f5e 50%,#a855f7)" },
    { id: "abyss",   name: "Abyss",   swatch: "linear-gradient(135deg,#22d3ee,#0e7490 50%,#0f172a)" },
    { id: "verdant", name: "Verdant", swatch: "linear-gradient(135deg,#a3e635,#14b8a6 50%,#065f46)" },
    { id: "lumen",   name: "Lumen",   swatch: "linear-gradient(135deg,#eef4ff,#93c5fd 55%,#c084fc)" }
  ];

  var OPTICS = [
    { key: "blur",     label: "Blur",         min: 4,   max: 60,  step: 1,   unit: "px",
      hint: "How much the backdrop diffuses through the pane." },
    { key: "alpha",    label: "Tint",         min: 0,   max: 40,  step: .5,  unit: "%",
      hint: "The pane's own colour. Past ~15% glass reads as plastic." },
    { key: "sat",      label: "Saturation",   min: 100, max: 320, step: 5,   unit: "%",
      hint: "Real glass concentrates the colour passing through it." },
    { key: "bright",   label: "Brightness",   min: 80,  max: 140, step: 1,   unit: "%",
      hint: "Light gathered by the pane. Also keeps text legible." },
    { key: "thick",    label: "Edge thickness", min: 0, max: 4,   step: .1,  unit: "px",
      hint: "Width of the lit rim. This is what reads as depth." },
    { key: "disperse", label: "Dispersion",   min: 0,   max: 160, step: 5,   unit: "%",
      hint: "Prismatic split — cool at the top edge, warm at the base." },
    { key: "sheen",    label: "Sheen",        min: 0,   max: 150, step: 5,   unit: "%",
      hint: "Specular highlight that tracks your cursor." },
    { key: "radius",   label: "Corner radius", min: 0,  max: 40,  step: 1,   unit: "px",
      hint: "Applies to every surface in the system." }
  ];

  DS.apps.register({
    id: "settings",
    name: "Settings",
    icon: "settings",
    w: 760, h: 560, minW: 560, minH: 380,
    flush: true,

    mount: function (body, api) {
      var PANES = [
        { id: "appearance", label: "Appearance", icon: "palette", build: paneAppearance },
        { id: "glass",      label: "Glass",      icon: "layers",  build: paneGlass },
        { id: "desktop",    label: "Desktop",    icon: "desktop", build: paneDesktop },
        { id: "storage",    label: "Storage",    icon: "cpu",     build: paneStorage }
      ];
      var current = (api.arg && api.arg.pane) || "appearance";
      var side = h("aside.app-side");
      var main = h("div.app-main.st-main");
      body.appendChild(side);
      body.appendChild(main);

      var sliderRows = {};

      function renderSide() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Settings" }));
        PANES.forEach(function (p) {
          side.appendChild(h("div.side-item" + (p.id === current ? ".on" : ""), {
            onclick: function () { current = p.id; render(); }
          }, [
            h("span", { html: DS.icon(p.icon, 15), style: { display: "contents" } }),
            h("span", { text: p.label })
          ]));
        });
      }

      function render() {
        renderSide();
        DS.clear(main);
        sliderRows = {};
        var pane = PANES.filter(function (p) { return p.id === current; })[0];
        api.setTitle("Settings — " + pane.label);
        pane.build(main);
        DS.glass.dress(main);
      }

      /* ───────────── APPEARANCE ───────────── */
      function paneAppearance(host) {
        host.appendChild(h("h2.st-h", { text: "Appearance" }));
        host.appendChild(h("p.st-sub", {
          text: "The wallpaper is what the glass refracts, so the theme changes " +
                "far more than the background colour."
        }));

        host.appendChild(DS.ui.section("Theme"));
        var grid = h("div.st-themes");
        THEMES.forEach(function (t) {
          var on = DS.store.get("theme") === t.id;
          var card = h("button.st-theme" + (on ? ".on" : ""), {
            onclick: function () {
              DS.store.set("theme", t.id);
              DS.glass.applyTheme();
              render();
              DS.ui.toast({ icon: "palette", title: t.name, body: "Theme applied." });
            }
          }, [
            h("span.st-sw", { style: { background: t.swatch } }),
            h("span.st-tn", { text: t.name }),
            on ? h("span.st-tick", { html: DS.icon("check", 13) }) : null
          ]);
          grid.appendChild(card);
        });
        host.appendChild(grid);

        host.appendChild(DS.ui.section("Wallpaper"));
        host.appendChild(DS.ui.row(
          "Drifting colour",
          "Slowly moving orbs behind every pane. Turning this off makes " +
          "refraction much harder to see, but saves GPU time.",
          DS.ui.toggle(DS.store.get("wallpaperMotion"), function (v) {
            DS.store.set("wallpaperMotion", v);
            DS.glass.applyMotion();
          })
        ));
      }

      /* ───────────── GLASS ───────────── */
      function paneGlass(host) {
        host.appendChild(h("h2.st-h", { text: "Glass" }));
        host.appendChild(h("p.st-sub", {
          text: "Every surface in the system reads these values. Changes are live."
        }));

        /* live preview: glass over a deliberately harsh gradient */
        host.appendChild(h("div.st-preview", {}, [
          h("div.st-preview-bg"),
          h("div.st-preview-glass.g", {}, [
            h("div.st-preview-in", {}, [
              h("b", { text: "Preview" }),
              h("span", { text: "Rim, dispersion and sheen at current values." }),
              h("div", { style: { display: "flex", gap: "8px", "margin-top": "10px" } }, [
                h("button.g-btn", { text: "Button" }),
                h("button.g-btn.g-btn-accent", { text: "Accent" }),
                DS.ui.toggle(true, function () {})
              ])
            ])
          ])
        ]));

        host.appendChild(DS.ui.section("Optics"));
        OPTICS.forEach(function (o) {
          var row = DS.ui.sliderRow({
            label: o.label,
            min: o.min, max: o.max, step: o.step,
            value: DS.store.get("glass." + o.key),
            format: function (v) {
              return (o.unit === "%" ? v + "%" : o.unit === "px" ? v + "px" : String(v));
            },
            onInput: function (v) {
              DS.store.set("glass." + o.key, v);
              DS.glass.apply();
            }
          });
          sliderRows[o.key] = row;
          host.appendChild(row);
          host.appendChild(h("div.st-hint", { text: o.hint }));
        });

        host.appendChild(DS.ui.section("Refraction"));
        host.appendChild(DS.ui.row(
          "True edge refraction",
          "Displaces the pixels behind each rim with an SVG filter instead of " +
          "faking the effect with shadows. Expensive — the single heaviest " +
          "effect in the OS.",
          DS.ui.toggle(DS.store.get("refraction"), function (v) {
            DS.store.set("refraction", v);
            DS.glass.redress();
          })
        ));

        host.appendChild(h("div", {
          style: { display: "flex", gap: "8px", "margin-top": "18px" }
        }, [
          h("button.g-btn", {
            html: DS.icon("refresh", 14) + "<span>Reset optics</span>",
            onclick: function () {
              var d = DS.store.defaults.glass;
              Object.keys(d).forEach(function (k) { DS.store.set("glass." + k, d[k]); });
              DS.glass.apply();
              render();
              DS.ui.toast({ icon: "refresh", title: "Optics reset", body: "Back to factory glass." });
            }
          }),
          h("button.g-btn", {
            html: DS.icon("layers", 14) + "<span>Make it plastic</span>",
            title: "Kill the layers that make glass believable",
            onclick: function () {
              DS.store.set("glass.disperse", 0);
              DS.store.set("glass.thick", 0);
              DS.store.set("glass.sheen", 0);
              DS.store.set("glass.alpha", 22);
              DS.glass.apply();
              render();
              DS.ui.toast({
                icon: "info", title: "Now it is plastic",
                body: "No dispersion, no rim, no sheen, heavy tint. Same blur.",
                timeout: 7000
              });
            }
          })
        ]));

        /* hidden hook so `glass blur 40` in Terminal resyncs these sliders */
        host.appendChild(h("button", {
          id: "settings-sync",
          hidden: true,
          onclick: function () {
            Object.keys(sliderRows).forEach(function (k) {
              sliderRows[k].dsSet(DS.store.get("glass." + k));
            });
          }
        }));
      }

      /* ───────────── DESKTOP ───────────── */
      function paneDesktop(host) {
        host.appendChild(h("h2.st-h", { text: "Desktop" }));
        host.appendChild(h("p.st-sub", { text: "Account and desktop behaviour." }));

        host.appendChild(DS.ui.section("Account"));
        var nameField = h("input.g-field", {
          type: "text",
          value: DS.store.get("user", "you"),
          style: { "max-width": "260px" },
          oninput: function () {
            DS.store.set("user", nameField.value.trim() || "you");
          }
        });
        host.appendChild(DS.ui.row("User name", "Shown in the shell prompt and About.", nameField));

        host.appendChild(DS.ui.section("Dock"));
        host.appendChild(h("p.st-hint", {
          text: "Apps shown in the dock. Unchecking one hides it — you can still " +
                "launch it from the launcher with Ctrl+K."
        }));
        var dockApps = DS.store.get("dockApps", []).slice();
        DS.apps.all().forEach(function (app) {
          var on = dockApps.indexOf(app.id) >= 0;
          var check = h("div.g-check" + (on ? ".on" : ""), {
            html: DS.icon("check", 12),
            onclick: function () {
              check.classList.toggle("on");
              var list = DS.store.get("dockApps", []).slice();
              var i = list.indexOf(app.id);
              if (check.classList.contains("on")) { if (i < 0) list.push(app.id); }
              else if (i >= 0) list.splice(i, 1);
              DS.store.set("dockApps", list);
              DS.shell.buildDock();
            }
          });
          host.appendChild(h("div.st-dock-row", {}, [
            h("span", { html: DS.icon(app.icon, 15), style: { display: "contents" } }),
            h("span", { text: app.name, style: { flex: "1", "font-size": "12.5px" } }),
            check
          ]));
        });
      }

      /* ───────────── STORAGE ───────────── */
      function paneStorage(host) {
        host.appendChild(h("h2.st-h", { text: "Storage" }));
        host.appendChild(h("p.st-sub", {
          text: "The whole system state — files, notes, window layout and optics — " +
                "lives in one localStorage key."
        }));

        var raw = "";
        try { raw = localStorage.getItem("dancestar.os.v1") || ""; } catch (e) {}
        var used = raw.length;
        var quota = 5 * 1024 * 1024;
        var pct = Math.min(100, (used / quota) * 100);

        var files = 0, dirs = 0, bytes = 0;
        DS.fs.walk("/", function (node) {
          if (node.type === "dir") dirs += 1;
          else { files += 1; bytes += (node.content || "").length; }
        });

        host.appendChild(h("div.g-card", { style: { "margin-top": "6px" } }, [
          h("div", {
            style: { display: "flex", "justify-content": "space-between", "margin-bottom": "9px" }
          }, [
            h("b", { text: DS.bytes(used), style: { "font-size": "18px", "font-weight": "600" } }),
            h("span", { text: "of " + DS.bytes(quota), style: { color: "var(--text-3)", "font-size": "12px" } })
          ]),
          h("div.g-progress", {}, [h("i", { style: { width: pct.toFixed(1) + "%" } })]),
          h("div", {
            text: pct < 1 ? "Under 1% used." : pct.toFixed(1) + "% used.",
            style: { "margin-top": "8px", "font-size": "11.5px", color: "var(--text-3)" }
          })
        ]));

        host.appendChild(DS.ui.section("Contents"));
        [
          ["Files", files],
          ["Folders", dirs],
          ["File contents", DS.bytes(bytes)],
          ["Open windows", DS.wm.list().length]
        ].forEach(function (r) {
          host.appendChild(h("div.st-kv", {}, [
            h("span", { text: r[0] }),
            h("b", { text: String(r[1]) })
          ]));
        });

        host.appendChild(DS.ui.section("Danger zone"));
        host.appendChild(h("button.g-btn.g-btn-danger", {
          html: DS.icon("trash", 14) + "<span>Erase all data and restart</span>",
          onclick: function () {
            DS.ui.confirm("Erase everything?",
              "All files, notes and settings are deleted and the system restarts " +
              "with factory defaults. This cannot be undone.",
              { ok: "Erase", danger: true }).then(function (yes) {
                if (!yes) return;
                DS.store.reset();
                location.reload();
              });
          }
        }));
      }

      render();
      api.openPane = function (id) { current = id; render(); };
    },

    onArg: function (api, arg) {
      if (arg && arg.pane && api.openPane) api.openPane(arg.pane);
    }
  });
})(window.DS);
