/* ═══════════════════════════════════════════════════════════════
   settings-panes2.js — Language and Zoom

   Registered onto DS.settingsPanes the same way as the panes in
   settings-panes.js, which is the whole point of that hook: two more
   panes and not a line changed in the Settings app.

     Language   which language the interface speaks, what a date looks
                like, which way the text runs — and an editor for the
                phrases the book has not got to yet.
     Zoom       the size of the whole desktop, and of one window.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  DS.settingsPanes = DS.settingsPanes || [];

  /* ═══════════════════ LANGUAGE ═══════════════════ */
  DS.settingsPanes.push({
    id: "language",
    label: "Language",
    icon: "globe",
    after: "users",
    build: function (host, ctx) {
      var cur = DS.i18n.def();

      host.appendChild(h("h2.st-h", { text: "Language" }));
      host.appendChild(h("p.st-sub", {
        text: "This OS was written in English, and translation works by " +
              "recognising the English phrases as they are drawn. So it is " +
              "honest about its limits: the interface chrome is covered, and " +
              "anything the phrase book has not got to stays in English " +
              "rather than turning into nonsense."
      }));

      /* ── picking one ── */
      host.appendChild(DS.ui.section("Interface language"));
      var grid = h("div.lg-grid");
      DS.LANGS.forEach(function (l) {
        grid.appendChild(h("button.lg-tile" + (l.id === cur.id ? ".on" : ""), {
          onclick: function () {
            DS.i18n.set(l.id);
            ctx.render();
          }
        }, [
          l.rtl ? h("span.lg-rtl", { text: "RTL" }) : null,
          h("b", { text: l.native }),
          h("i", { text: l.name + "  ·  " + l.locale })
        ]));
      });
      host.appendChild(grid);

      /* ── coverage, stated plainly ── */
      var cov = DS.i18n.coverage();
      var gaps = DS.i18n.missing();
      host.appendChild(DS.ui.section("Coverage"));
      host.appendChild(h("div.g-card", {}, [
        h("div", {
          style: { display: "flex", "justify-content": "space-between",
                   "align-items": "baseline", "margin-bottom": "9px" }
        }, [
          h("b", {
            text: cur.id === "en" ? "Original" : cov.known + " phrases",
            style: { "font-size": "18px", "font-weight": "600" }
          }),
          h("span", {
            text: cur.id === "en"
              ? "nothing to translate"
              : gaps.length + " seen with no entry",
            style: { color: "var(--text-3)", "font-size": "12px" }
          })
        ]),
        h("div.g-progress", {}, [
          h("i", {
            style: {
              width: (cur.id === "en" ? 100
                : Math.max(4, Math.round(cov.known /
                    Math.max(1, cov.known + gaps.length) * 100))) + "%"
            }
          })
        ]),
        h("div", {
          text: cur.id === "en"
            ? "English is the source. Every other language is a phrase book laid over it."
            : "Counted from what has actually been on screen this session, " +
              "not from a guess at the whole system.",
          style: { "margin-top": "8px", "font-size": "11.5px", color: "var(--text-3)" }
        })
      ]));

      /* ── dates, times, weeks ── */
      host.appendChild(DS.ui.section("Region and formats"));
      host.appendChild(h("p.st-hint", {
        text: "Every clock and date in the system asks the browser to format " +
              "it. This is what the browser is told."
      }));

      var sample = h("div.st-kv", {}, [
        h("span", { text: "Right now, formatted" }),
        h("b", { text: "" })
      ]);
      function paintSample() {
        var d = new Date();
        sample.lastChild.textContent =
          d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) +
          "  ·  " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }

      var region = h("input.g-field", {
        type: "text",
        value: DS.store.get("region", ""),
        placeholder: cur.locale + "  (leave empty to follow the language)",
        style: { "max-width": "260px" },
        oninput: function () {
          DS.store.set("region", region.value.trim());
          paintSample();
        }
      });
      host.appendChild(DS.ui.row(
        "Locale override",
        "A BCP-47 tag — en-GB, de-AT, hi-IN. Empty means the language's own.",
        region
      ));

      host.appendChild(DS.ui.row(
        "Clock",
        "Automatic follows the locale. The other two force it, everywhere " +
        "the time appears.",
        DS.ui.segmented([
          { label: "Automatic", value: "auto" },
          { label: "12-hour", value: "12" },
          { label: "24-hour", value: "24" }
        ], DS.store.get("hour12", "auto"), function (v) {
          DS.store.set("hour12", v);
          paintSample();
        })
      ));

      host.appendChild(DS.ui.row(
        "First day of the week",
        "Used by the Calendar's month and week grids.",
        DS.ui.segmented([
          { label: "Sunday", value: 0 },
          { label: "Monday", value: 1 }
        ], DS.store.get("calendar.week0", 1), function (v) {
          DS.store.set("calendar.week0", v);
        })
      ));
      host.appendChild(sample);
      paintSample();

      /* ── direction ── */
      host.appendChild(DS.ui.section("Direction"));
      host.appendChild(h("p.st-hint", {
        text: cur.rtl
          ? "This language runs right to left."
          : "These matter once a right-to-left language is chosen — Arabic is " +
            "the one in the list."
      }));
      host.appendChild(DS.ui.row(
        "Right-to-left text",
        "How the script actually works, so it is on by default. Turning it " +
        "off renders Arabic left to right, which is wrong but occasionally " +
        "useful for comparing layouts.",
        DS.ui.toggle(DS.store.get("rtl", true), function (v) {
          DS.store.set("rtl", v);
          DS.i18n.apply();
        })
      ));
      host.appendChild(DS.ui.row(
        "Mirror the whole interface",
        "Flips the structure too: dock, menu bar, title bars, sidebars. A " +
        "bigger claim than turning the text around, so it is opt-in.",
        DS.ui.toggle(DS.store.get("mirror", false), function (v) {
          DS.store.set("mirror", v);
          DS.i18n.apply();
        })
      ));

      /* ── fill in the gaps ──────────────────────────────────────
         The interesting half. Anything shown on screen with no entry
         in the book is listed here, and what you type is merged over
         the built-in phrases and kept. */
      if (cur.id !== "en") {
        host.appendChild(DS.ui.section("Fill in the gaps"));
        if (!gaps.length) {
          host.appendChild(h("p.st-hint", {
            text: "Nothing untranslated has been on screen yet. Open a few " +
                  "apps and come back — whatever the book missed will be " +
                  "waiting here."
          }));
        } else {
          host.appendChild(h("p.st-hint", {
            text: "Phrases this session showed in English because the book " +
                  "had no entry. Type a translation and it is used " +
                  "immediately, and remembered."
          }));
          var mine = DS.store.get("phrases", {})[cur.id] || {};
          gaps.slice(0, 40).forEach(function (en) {
            var field = h("input", {
              type: "text",
              value: mine[en] || "",
              placeholder: cur.native,
              onchange: function () {
                DS.i18n.addPhrase(en, field.value.trim(), cur.id);
              }
            });
            host.appendChild(h("div.lg-gap", {}, [
              h("span", { text: en, title: en }),
              field
            ]));
          });
          if (gaps.length > 40) {
            host.appendChild(h("p.st-hint", {
              text: "…and " + (gaps.length - 40) + " more. The first forty are " +
                    "the ones you have actually seen most recently."
            }));
          }
        }

        var owned = Object.keys(DS.store.get("phrases", {})[cur.id] || {}).length;
        if (owned) {
          host.appendChild(h("button.g-btn.g-btn-danger", {
            html: DS.icon("trash", 14) + "<span>Forget my " + owned +
                  " phrase" + (owned === 1 ? "" : "s") + "</span>",
            style: { "margin-top": "16px" },
            onclick: function () {
              DS.ui.confirm("Forget your translations?",
                "The " + owned + " phrase" + (owned === 1 ? "" : "s") +
                " you filled in for " + cur.native + " will be removed. The " +
                "built-in phrase book is untouched.",
                { ok: "Forget", danger: true }).then(function (yes) {
                  if (!yes) return;
                  var all = DS.store.get("phrases", {});
                  delete all[cur.id];
                  DS.store.set("phrases", all);
                  DS.i18n.set(cur.id);
                  ctx.render();
                });
            }
          }));
        }
      }
    }
  });

  /* ═══════════════════ ZOOM ═══════════════════ */
  DS.settingsPanes.push({
    id: "zoom",
    label: "Zoom",
    icon: "zoomIn",
    after: "desktop",
    build: function (host, ctx) {
      host.appendChild(h("h2.st-h", { text: "Zoom" }));
      host.appendChild(h("p.st-sub", {
        text: "Two zooms. One scales the whole desktop, which is the " +
              "accessibility one; the other scales a single window's " +
              "contents and is remembered per app. Neither is the browser's " +
              "own zoom, which still works and stacks on top."
      }));

      /* ── fitting the screen ──────────────────────────────────────
         Not a zoom, but the same question: how much of this screen is
         there, and what should the shell do about it. */
      host.appendChild(DS.ui.section("Fitting the screen"));
      host.appendChild(h("div.st-kv", {}, [
        h("span", { text: "This screen reads as" }),
        h("b", {
          text: DS.form.kind() + "  ·  " + DS.form.w() + "×" + DS.form.h() +
                (DS.form.touch() ? "  ·  touch" : "")
        })
      ]));
      host.appendChild(DS.ui.row(
        "Windows fill the screen",
        "On a phone a floating window you drag by its title bar is a " +
        "300px pane you cannot aim at, so windows fill the frame and the " +
        "dock becomes the switcher. Automatic does that below 680px wide " +
        "and floats them above it.",
        DS.ui.segmented([
          { label: "Automatic", value: "auto" },
          { label: "Always", value: "on" },
          { label: "Never", value: "off" }
        ], DS.store.get("layout.tile", "auto"), function (v) {
          DS.store.set("layout.tile", v);
          DS.wm.refit();
          ctx.render();
        })
      ));

      if (!DS.zoom.supported) {
        host.appendChild(h("div.g-card", { style: { "margin-top": "10px" } }, [
          h("b", { text: "Not available in this browser" }),
          h("p", {
            text: "Scaling the desktop needs CSS zoom, which affects layout. " +
                  "The alternative — a transform — would create a backdrop " +
                  "root and stop every pane in the system from refracting the " +
                  "wallpaper, so it is not offered as a fallback.",
            style: { "font-size": "11.5px", color: "var(--text-3)", margin: "6px 0 0" }
          })
        ]));
        return;
      }

      /* ── system zoom ── */
      host.appendChild(DS.ui.section("System zoom"));

      var gauge = h("div.zm-gauge", {}, [
        h("span", { text: "Everything, at this size" })
      ]);
      function paintGauge(pct) {
        gauge.style.setProperty("--zm-preview", (pct / 100).toFixed(3));
      }
      host.appendChild(gauge);

      var stops = h("div.zm-stops");
      var slider;

      function repaintStops(pct) {
        DS.qsa(".zm-stop", stops).forEach(function (b) {
          b.classList.toggle("on", parseInt(b.dataset.pct, 10) === pct);
        });
      }

      slider = DS.ui.sliderRow({
        label: "Scale", min: DS.zoom.MIN, max: DS.zoom.MAX, step: 1,
        value: DS.zoom.pct(),
        format: function (v) { return v + "%"; },
        onInput: function (v) {
          DS.store.set("zoom.ui", Math.round(v));
          DS.zoom.apply();
          paintGauge(v);
          repaintStops(Math.round(v));
        }
      });
      host.appendChild(slider);

      DS.zoom.STOPS.forEach(function (p) {
        stops.appendChild(h("button.zm-stop", {
          text: p + "%",
          data: { pct: p },
          onclick: function () {
            DS.zoom.set(p, true);
            slider.dsSet(p);
            paintGauge(p);
            repaintStops(p);
          }
        }));
      });
      host.appendChild(stops);
      paintGauge(DS.zoom.pct());
      repaintStops(DS.zoom.pct());

      host.appendChild(DS.ui.row(
        "Ctrl and the wheel",
        "Scroll with Ctrl held to scale the desktop. This takes the gesture " +
        "away from the browser's own zoom while the pointer is over the OS.",
        DS.ui.toggle(DS.store.get("zoom.wheel", true), function (v) {
          DS.store.set("zoom.wheel", v);
        })
      ));

      /* ── window zoom ── */
      host.appendChild(DS.ui.section("Window zoom"));
      host.appendChild(h("p.st-hint", {
        text: "Ctrl+Shift with plus, minus or zero scales the window in " +
              "front. It is stored against the app, so the app opens at that " +
              "size next time."
      }));

      var apps = DS.store.get("zoom.apps", {});
      var ids = Object.keys(apps);
      if (!ids.length) {
        host.appendChild(h("p.st-hint", {
          text: "No app is zoomed. Any that you scale will be listed here."
        }));
      } else {
        ids.forEach(function (id) {
          var app = DS.apps.get(id);
          host.appendChild(h("div.zm-app-row", {}, [
            h("span", { html: DS.icon(app ? app.icon : "file", 15),
                        style: { display: "contents" } }),
            h("b", { text: app ? app.name : id }),
            h("i", { text: apps[id] + "%" }),
            h("button.g-btn.g-btn-sq", {
              html: DS.icon("refresh", 13),
              title: "Back to 100%",
              onclick: function () {
                var open = DS.wm.list().filter(function (w) {
                  return w._app.id === id;
                })[0];
                if (open) DS.zoom.setWin(open, 100, true);
                else {
                  var all = DS.store.get("zoom.apps", {});
                  delete all[id];
                  DS.store.set("zoom.apps", all);
                }
                ctx.render();
              }
            })
          ]));
        });
      }

      /* ── the keys ── */
      host.appendChild(DS.ui.section("Keyboard"));
      [
        ["Ctrl+Alt+ +  /  -", "Scale the desktop by one stop"],
        ["Ctrl+Alt+0", "Desktop back to 100%"],
        ["Ctrl+Shift+ +  /  -", "Scale the window in front"],
        ["Ctrl+Shift+0", "That window back to 100%"],
        ["Ctrl+wheel", "Scale the desktop continuously"]
      ].forEach(function (r) {
        host.appendChild(h("div.st-kv", {}, [
          h("span", { text: r[1] }),
          h("b", { text: r[0], style: { "font-size": "11.5px" } })
        ]));
      });
      host.appendChild(h("p.st-hint", {
        text: "Ctrl with plus or minus on its own belongs to the browser, " +
              "which does not give it up — so the OS never asks for it."
      }));

      host.appendChild(h("button.g-btn", {
        html: DS.icon("refresh", 14) + "<span>Reset every zoom</span>",
        style: { "margin-top": "18px" },
        onclick: function () {
          DS.zoom.resetAll();
          ctx.render();
        }
      }));
    }
  });

  /* ═══════════════════ THE BUG ═══════════════════ */
  DS.settingsPanes.push({
    id: "bugs",
    label: "Bugs",
    icon: "bug",
    after: "zoom",
    build: function (host, ctx) {
      host.appendChild(h("h2.st-h", { text: "Bugs" }));
      host.appendChild(h("p.st-sub", {
        text: "A glass beetle sits in a corner of the desktop. It counts " +
              "anything the system throws, and clicking it opens a report " +
              "that already knows the state of the machine. Nothing is " +
              "uploaded anywhere — reports are files in your Documents."
      }));

      host.appendChild(DS.ui.section("The beetle"));
      host.appendChild(DS.ui.row(
        "Show the bug",
        "Hiding it leaves the reporter reachable from the Help menu, the " +
        "launcher and Ctrl+K.",
        DS.ui.toggle(DS.store.get("bugs.show", true), function (v) {
          DS.store.set("bugs.show", v);
          DS.bugs.paintDot();
        })
      ));
      host.appendChild(DS.ui.row("Corner", "Where it sits.",
        DS.ui.segmented([
          { label: "Bottom right", value: "br" },
          { label: "Bottom left", value: "bl" },
          { label: "Top right", value: "tr" }
        ], DS.store.get("bugs.corner", "br"), function (v) {
          DS.store.set("bugs.corner", v);
          DS.bugs.paintDot();
        })
      ));

      var errs = DS.bugs.errors();
      var reports = DS.bugs.list();
      host.appendChild(DS.ui.section("This session"));
      [
        ["Errors caught", errs.length],
        ["Reports filed", reports.length]
      ].forEach(function (r) {
        host.appendChild(h("div.st-kv", {}, [
          h("span", { text: r[0] }),
          h("b", { text: String(r[1]) })
        ]));
      });

      host.appendChild(h("div", {
        style: { display: "flex", gap: "8px", "margin-top": "16px", "flex-wrap": "wrap" }
      }, [
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("bug", 14) + "<span>Report a bug</span>",
          onclick: function () { DS.bugs.open(); }
        }),
        h("button.g-btn", {
          html: DS.icon("cpu", 14) + "<span>Diagnostics</span>",
          onclick: function () { DS.bugs.open({ pane: "diag" }); }
        }),
        reports.length ? h("button.g-btn", {
          html: DS.icon("doc", 14) + "<span>Filed reports</span>",
          onclick: function () { DS.bugs.open({ pane: "filed" }); }
        }) : null
      ]));

      if (reports.length) {
        host.appendChild(DS.ui.section("Danger zone"));
        host.appendChild(h("button.g-btn.g-btn-danger", {
          html: DS.icon("trash", 14) + "<span>Delete all " + reports.length +
                " reports</span>",
          title: "The Markdown files in Documents are left alone",
          onclick: function () {
            DS.ui.confirm("Delete every report?",
              "The list is cleared. The Markdown files already written into " +
              "Documents › Bug Reports are left where they are.",
              { ok: "Delete", danger: true }).then(function (yes) {
                if (!yes) return;
                DS.store.set("bugs.reports", []);
                DS.bugs.paintDot();
                ctx.render();
              });
          }
        }));
      }
    }
  });
})(window.DS);
