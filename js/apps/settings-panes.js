/* ═══════════════════════════════════════════════════════════════
   settings-panes.js — the deep customisation panes

   Registered onto DS.settingsPanes rather than hard-coded into the
   Settings app, so adding a pane never means editing that file.

     Wallpaper  build your own background from scratch
     Looks      save the whole appearance as a named set, and move
                looks between machines as JSON
     Widgets    what is on the desktop
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  DS.settingsPanes = DS.settingsPanes || [];

  /* A colour well that looks like the rest of the system. */
  function colorWell(value, onChange) {
    var input = h("input.st-color", {
      type: "color", value: value,
      oninput: function () { onChange(input.value); }
    });
    return input;
  }

  function labelled(text, node) {
    return h("div.st-colrow", {}, [h("span", { text: text }), node]);
  }

  function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
  function randHex() {
    return "#" + [rand(40, 255), rand(40, 255), rand(40, 255)].map(function (v) {
      return ("0" + v.toString(16)).slice(-2);
    }).join("");
  }

  /* ═══════════════════ WALLPAPER STUDIO ═══════════════════ */
  DS.settingsPanes.push({
    id: "wallpaper",
    label: "Wallpaper",
    icon: "image",
    after: "appearance",
    build: function (host, ctx) {
      var w = DS.store.get("wallpaper", {});

      host.appendChild(h("h2.st-h", { text: "Wallpaper studio" }));
      host.appendChild(h("p.st-sub", {
        text: "The background is five drifting orbs of colour over a base and a " +
              "faint grid. It is also the only thing the glass has to refract, " +
              "so building your own changes how the whole system reads."
      }));

      function set(k, v) {
        DS.store.set("wallpaper." + k, v);
        DS.glass.applyWallpaper();
      }

      host.appendChild(DS.ui.row(
        "Use a custom wallpaper",
        "Off hands the background back to the theme.",
        DS.ui.toggle(w.custom, function (v) {
          set("custom", v);
          ctx.render();
        })
      ));

      if (!w.custom) {
        host.appendChild(h("div.empty-state", { style: { "min-height": "150px" } }, [
          h("div", { html: DS.icon("image", 30) }),
          h("div", { text: "The theme is drawing the background." }),
          h("button.g-btn.g-btn-accent", {
            text: "Start from the current theme",
            style: { "margin-top": "6px" },
            onclick: function () {
              // seed the studio from whatever the theme is showing now
              var cs = getComputedStyle(document.documentElement);
              var orbs = [];
              for (var i = 1; i <= 5; i++) {
                orbs.push((cs.getPropertyValue("--o" + i) || "#22d3ee").trim());
              }
              DS.store.set("wallpaper.orbs", orbs);
              set("custom", true);
              ctx.render();
            }
          })
        ]));
        return;
      }

      host.appendChild(DS.ui.section("Colours"));
      host.appendChild(labelled("Base", colorWell(w.base, function (v) { set("base", v); })));

      var orbs = (w.orbs || []).slice();
      var wells = h("div.st-orbs");
      orbs.forEach(function (c, i) {
        wells.appendChild(colorWell(c, function (v) {
          orbs[i] = v;
          set("orbs", orbs);
        }));
      });
      host.appendChild(labelled("Orbs", wells));

      host.appendChild(h("div", {
        style: { display: "flex", gap: "8px", "margin-top": "12px", "flex-wrap": "wrap" }
      }, [
        h("button.g-btn", {
          html: DS.icon("refresh", 14) + "<span>Randomise</span>",
          onclick: function () {
            DS.store.set("wallpaper.orbs", [randHex(), randHex(), randHex(), randHex(), randHex()]);
            DS.store.set("wallpaper.base", "#" + [rand(4, 40), rand(4, 40), rand(10, 60)]
              .map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join(""));
            DS.glass.applyWallpaper();
            ctx.render();
          }
        }),
        h("button.g-btn", {
          html: DS.icon("star", 14) + "<span>Monochrome</span>",
          onclick: function () {
            var base = randHex();
            DS.store.set("wallpaper.orbs", [
              base, DS.glass.shade(base, 30), DS.glass.shade(base, -25),
              DS.glass.shade(base, 55), DS.glass.shade(base, -45)
            ]);
            DS.glass.applyWallpaper();
            ctx.render();
          }
        })
      ]));

      host.appendChild(DS.ui.section("Form"));
      [
        ["size", "Orb size", 30, 220, 5, "%"],
        ["blur", "Softness", 20, 160, 4, "px"],
        ["opacity", "Intensity", 10, 100, 5, "%"],
        ["speed", "Drift speed", 20, 300, 10, "%"],
        ["grid", "Grid", 0, 60, 2, "%"]
      ].forEach(function (r) {
        host.appendChild(DS.ui.sliderRow({
          label: r[1], min: r[2], max: r[3], step: r[4],
          value: DS.store.get("wallpaper." + r[0]),
          format: function (v) { return v + r[5]; },
          onInput: function (v) { set(r[0], v); }
        }));
      });
      host.appendChild(h("div.st-hint", {
        text: "Grid at 0 removes it. The grid gives refraction straight lines to " +
              "bend, which is what makes the edge distortion legible at all."
      }));
    }
  });

  /* ═══════════════════ LOOKS ═══════════════════ */
  function currentLook() {
    return {
      theme: DS.store.get("theme"),
      accentHue: DS.store.get("accentHue"),
      glass: JSON.parse(JSON.stringify(DS.store.get("glass"))),
      wallpaper: JSON.parse(JSON.stringify(DS.store.get("wallpaper"))),
      refraction: DS.store.get("refraction")
    };
  }

  function applyLook(look) {
    if (!look) return;
    if (look.theme) DS.store.set("theme", look.theme);
    DS.store.set("accentHue", look.accentHue === undefined ? null : look.accentHue);
    if (look.glass) DS.store.set("glass", look.glass);
    if (look.wallpaper) DS.store.set("wallpaper", look.wallpaper);
    if (look.refraction !== undefined) DS.store.set("refraction", look.refraction);
    DS.glass.applyAll();
  }

  DS.settingsPanes.push({
    id: "looks",
    label: "Looks",
    icon: "layers",
    after: "glass",
    build: function (host, ctx) {
      host.appendChild(h("h2.st-h", { text: "Looks" }));
      host.appendChild(h("p.st-sub", {
        text: "A look is everything visual at once — theme, accent, all eight " +
              "optical properties, and the wallpaper. Save the one you are " +
              "wearing, then switch between them in a click."
      }));

      var nameIn = h("input.g-field", {
        type: "text", placeholder: "Name this look…",
        onkeydown: function (e) { if (e.key === "Enter") save(); }
      });

      function save() {
        var name = nameIn.value.trim();
        if (!name) return DS.ui.toast({ icon: "info", title: "Give it a name first" });
        var looks = DS.store.get("looks", {});
        looks[name] = currentLook();
        DS.store.set("looks", looks);
        DS.ui.toast({ icon: "save", title: "Saved", body: name });
        ctx.render();
      }

      host.appendChild(DS.ui.section("Save what you are wearing"));
      host.appendChild(h("div.ck-form", {}, [
        nameIn,
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("save", 14) + "<span>Save look</span>",
          onclick: save
        })
      ]));

      var looks = DS.store.get("looks", {});
      var names = Object.keys(looks).sort();

      host.appendChild(DS.ui.section(names.length ? "Saved" : "Nothing saved yet"));
      if (!names.length) {
        host.appendChild(h("p.st-hint", {
          text: "Tune the glass and the wallpaper how you like them, then come " +
                "back and save the result."
        }));
      }

      var grid = h("div.land-grid");
      names.forEach(function (n) {
        var L = looks[n];
        var sw = L.wallpaper && L.wallpaper.custom
          ? "linear-gradient(135deg," + (L.wallpaper.orbs || []).slice(0, 3).join(",") + ")"
          : ({
              aurora:  "linear-gradient(135deg,#22d3ee,#2563eb 45%,#a855f7)",
              sunset:  "linear-gradient(135deg,#fbbf24,#f43f5e 50%,#a855f7)",
              abyss:   "linear-gradient(135deg,#22d3ee,#0e7490 50%,#0f172a)",
              verdant: "linear-gradient(135deg,#a3e635,#14b8a6 50%,#065f46)",
              lumen:   "linear-gradient(135deg,#eef4ff,#93c5fd 55%,#c084fc)"
            }[L.theme] || "linear-gradient(135deg,#64748b,#0f172a)");

        grid.appendChild(h("button.land-tile", {
          onclick: function () {
            applyLook(L);
            DS.ui.toast({ icon: "palette", title: n, body: "Look applied." });
            ctx.render();
          },
          oncontextmenu: function (e) {
            e.preventDefault();
            DS.ui.ctx(e.clientX, e.clientY, [
              { title: n },
              { label: "Apply", icon: "check", action: function () { applyLook(L); ctx.render(); } },
              { label: "Overwrite with current", icon: "save", action: function () {
                  var all = DS.store.get("looks", {});
                  all[n] = currentLook();
                  DS.store.set("looks", all);
                  ctx.render();
                } },
              { sep: true },
              { label: "Delete", icon: "trash", action: function () {
                  var all = DS.store.get("looks", {});
                  delete all[n];
                  DS.store.set("looks", all);
                  ctx.render();
                } }
            ]);
          }
        }, [
          h("span.sw", { style: { background: sw } }),
          h("b", { text: n }),
          h("i", {
            text: (L.theme || "?") + " · " + (L.glass ? L.glass.blur + "px blur" : "")
          })
        ]));
      });
      if (names.length) {
        host.appendChild(grid);
        host.appendChild(h("p.st-hint", { text: "Right-click a look to overwrite or delete it." }));
      }

      /* ── transfer ── */
      host.appendChild(DS.ui.section("Move looks between machines"));
      host.appendChild(h("p.st-hint", {
        text: "Export writes a JSON file into Documents, where Notes can open it " +
              "and you can copy the text out. Import takes that text back."
      }));
      host.appendChild(h("div", {
        style: { display: "flex", gap: "8px", "flex-wrap": "wrap" }
      }, [
        h("button.g-btn", {
          html: DS.icon("save", 14) + "<span>Export current look</span>",
          onclick: function () {
            var name = DS.fs.freeName("/Users/you/Documents", "look", ".json");
            DS.fs.write("/Users/you/Documents/" + name,
                        JSON.stringify(currentLook(), null, 2));
            DS.ui.toast({
              icon: "save", title: "Exported",
              body: "Documents/" + name + " — open it in Notes to copy."
            });
          }
        }),
        h("button.g-btn", {
          html: DS.icon("layers", 14) + "<span>Export everything</span>",
          onclick: function () {
            var name = DS.fs.freeName("/Users/you/Documents", "dancestar-config", ".json");
            var dump = {};
            ["theme", "accentHue", "glass", "wallpaper", "refraction", "dock",
             "widgets", "customCmds", "looks", "focus", "clock", "avatar",
             "user", "motion", "autoMinimise"].forEach(function (k) {
              dump[k] = DS.store.get(k);
            });
            DS.fs.write("/Users/you/Documents/" + name, JSON.stringify(dump, null, 2));
            DS.ui.toast({ icon: "save", title: "Exported", body: "Documents/" + name });
          }
        }),
        h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Import…</span>",
          onclick: function () {
            DS.ui.prompt("Import", "Paste a look or config JSON.", "", { ok: "Import" })
              .then(function (text) {
                if (!text) return;
                var data;
                try { data = JSON.parse(text); }
                catch (e) {
                  return DS.ui.toast({ icon: "info", title: "Not valid JSON", body: e.message });
                }
                Object.keys(data).forEach(function (k) {
                  if (k === "fs") return;   // never let an import overwrite files
                  DS.store.set(k, data[k]);
                });
                DS.glass.applyAll();
                if (DS.shell.applyDockLayout) DS.shell.applyDockLayout();
                DS.widgets.renderAll();
                ctx.render();
                DS.ui.toast({ icon: "check", title: "Imported", body: "Everything applied." });
              });
          }
        })
      ]));
    }
  });

  /* ═══════════════════ WIDGETS ═══════════════════ */
  DS.settingsPanes.push({
    id: "widgets",
    label: "Widgets",
    icon: "grid",
    after: "looks",
    build: function (host, ctx) {
      host.appendChild(h("h2.st-h", { text: "Desktop widgets" }));
      host.appendChild(h("p.st-sub", {
        text: "Panes of glass that live on the desktop instead of in a window. " +
              "Drag them anywhere; positions are remembered. Right-click one to " +
              "remove it."
      }));

      host.appendChild(DS.ui.section("Available"));
      Object.keys(DS.widgets.TYPES).forEach(function (t) {
        var def = DS.widgets.TYPES[t];
        var count = DS.store.get("widgets", []).filter(function (w) {
          return w.type === t;
        }).length;
        host.appendChild(h("div.st-widget-row", {}, [
          h("span.st-wi", { html: DS.icon(def.icon, 17) }),
          h("div", { style: { flex: "1", "min-width": "0" } }, [
            h("div", { text: def.label, style: { "font-size": "12.5px" } }),
            h("div", {
              text: def.desc,
              style: { "font-size": "11px", color: "var(--text-3)", "margin-top": "2px" }
            })
          ]),
          count ? h("span.g-chip", { text: count + " on desktop" }) : null,
          h("button.g-btn", {
            html: DS.icon("plus", 14) + "<span>Add</span>",
            onclick: function () { DS.widgets.add(t); ctx.render(); }
          })
        ]));
      });

      var live = DS.store.get("widgets", []);
      host.appendChild(DS.ui.section(live.length ? "On the desktop" : "Desktop is empty"));
      live.forEach(function (rec) {
        var def = DS.widgets.TYPES[rec.type];
        if (!def) return;
        host.appendChild(h("div.st-widget-row", {}, [
          h("span.st-wi", { html: DS.icon(def.icon, 15) }),
          h("div", {
            text: def.label,
            style: { flex: "1", "font-size": "12.5px" }
          }),
          h("span", {
            text: Math.round(rec.x) + ", " + Math.round(rec.y),
            style: { "font-size": "11px", color: "var(--text-3)",
                     "font-variant-numeric": "tabular-nums" }
          }),
          h("button.g-btn.g-btn-sq", {
            html: DS.icon("trash", 14),
            onclick: function () { DS.widgets.remove(rec.id); ctx.render(); }
          })
        ]));
      });

      if (live.length) {
        host.appendChild(h("button.g-btn.g-btn-danger", {
          html: DS.icon("trash", 14) + "<span>Remove all widgets</span>",
          style: { "margin-top": "16px" },
          onclick: function () { DS.widgets.clear(); ctx.render(); }
        }));
      }
    }
  });
})(window.DS);
