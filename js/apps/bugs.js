/* ═══════════════════════════════════════════════════════════════
   bugs.js (app) — the Bug Reporter

   Three panes. Report writes one, Filed keeps the ones you wrote, and
   Diagnostics shows the machine's answer to "what was going on at the
   time" — including a button that breaks something on purpose, so you
   can watch the beetle notice.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var SEVERITY = [
    { value: "cosmetic", label: "Cosmetic" },
    { value: "annoying", label: "Annoying" },
    { value: "broken",   label: "Broken" }
  ];

  function copy(text, what) {
    function ok() {
      DS.ui.toast({ icon: "check", title: "Copied", body: what, timeout: 2400 });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else {
      fallback();
    }
    function fallback() {
      /* file:// with no clipboard permission still needs to work. */
      var ta = h("textarea", {
        value: text,
        style: { position: "fixed", top: "-1000px", opacity: "0" }
      });
      document.body.appendChild(ta);
      ta.select();
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) { done = false; }
      document.body.removeChild(ta);
      if (done) ok();
      else {
        DS.ui.alert("Could not reach the clipboard",
          "The browser refused. The report is saved in Documents › Bug " +
          "Reports, so it can be copied from Notes instead.");
      }
    }
  }

  DS.apps.register({
    id: "bugs",
    name: "Bug Reporter",
    icon: "bug",
    w: 700, h: 560, minW: 520, minH: 380,
    flush: true,

    mount: function (body, api) {
      var arg = api.arg || {};
      var pane = arg.pane || "report";

      /* the report being written, kept across pane switches */
      var draft = {
        title: arg.title || "",
        what: arg.what || "",
        steps: arg.steps || "",
        severity: arg.severity || "annoying",
        diag: arg.diag === false ? false : true
      };

      var side = h("aside.app-side");
      var main = h("div.app-main.bug-main");
      body.appendChild(side);
      body.appendChild(main);

      var PANES = [
        { id: "report", label: "Report a bug", icon: "bell",  build: paneReport },
        { id: "filed",  label: "Filed reports", icon: "doc",  build: paneFiled },
        { id: "diag",   label: "Diagnostics",  icon: "cpu",   build: paneDiag }
      ];

      function render() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Bugs" }));
        PANES.forEach(function (p) {
          side.appendChild(h("div.side-item" + (p.id === pane ? ".on" : ""), {
            onclick: function () { pane = p.id; render(); }
          }, [
            h("span", { html: DS.icon(p.icon, 15), style: { display: "contents" } }),
            h("span", { text: p.label })
          ]));
        });

        DS.clear(main);
        var p = PANES.filter(function (x) { return x.id === pane; })[0];
        api.setTitle("Bug Reporter — " + p.label);
        p.build(main);
        DS.glass.dress(main);
      }

      /* ───────────── REPORT ───────────── */
      function paneReport(host) {
        host.appendChild(h("h2.st-h", { text: "Report a bug" }));
        host.appendChild(h("p.st-sub", {
          text: "Nothing here leaves the machine. The report is saved into " +
                "Documents › Bug Reports as Markdown, and you can copy it " +
                "straight out to paste wherever it needs to go."
        }));

        host.appendChild(DS.ui.section("Title"));
        var title = h("input.g-field", {
          type: "text",
          value: draft.title,
          placeholder: "One line: the dock forgets its position",
          oninput: function () { draft.title = title.value; }
        });
        host.appendChild(title);

        host.appendChild(DS.ui.section("What happened?"));
        var what = h("textarea.g-field.bug-area", {
          placeholder: "What you expected, and what you got instead.",
          oninput: function () { draft.what = what.value; }
        });
        what.value = draft.what;
        host.appendChild(what);

        host.appendChild(DS.ui.section("Steps to reproduce"));
        var steps = h("textarea.g-field.bug-area", {
          placeholder: "1. Move the dock to the left\n2. Reload\n3. It is back at the bottom",
          oninput: function () { draft.steps = steps.value; }
        });
        steps.value = draft.steps;
        host.appendChild(steps);

        host.appendChild(DS.ui.section("Severity"));
        host.appendChild(DS.ui.row(
          "How bad is it?",
          "Cosmetic is something that looks wrong. Broken is something that " +
          "cannot be worked around.",
          DS.ui.segmented(SEVERITY, draft.severity, function (v) {
            draft.severity = v;
          })
        ));

        host.appendChild(DS.ui.row(
          "Include diagnostics",
          "Theme, optics, zoom, language, viewport, which window was in " +
          "front, and any errors the system caught. It is what makes a " +
          "report reproducible.",
          DS.ui.toggle(draft.diag, function (v) { draft.diag = v; })
        ));

        var errs = DS.bugs.errors();
        if (errs.length) {
          host.appendChild(DS.ui.section("Errors this session"));
          host.appendChild(h("div.bug-errs", {}, errs.slice(0, 5).map(errRow)));
        }

        host.appendChild(h("div", {
          style: { display: "flex", gap: "8px", "margin-top": "20px", "flex-wrap": "wrap" }
        }, [
          h("button.g-btn.g-btn-accent", {
            html: DS.icon("check", 14) + "<span>File the report</span>",
            onclick: function () {
              if (!draft.title.trim() && !draft.what.trim()) {
                DS.ui.alert("Nothing to file",
                  "Give it a title or describe what happened, and it will " +
                  "have something to say.");
                return;
              }
              var rec = DS.bugs.file({
                title: draft.title.trim() ||
                       draft.what.trim().split("\n")[0].slice(0, 60),
                what: draft.what,
                steps: draft.steps,
                severity: draft.severity,
                diag: draft.diag ? DS.bugs.diagnostics() : null,
                errors: draft.diag ? DS.bugs.errors() : []
              });
              draft = { title: "", what: "", steps: "", severity: "annoying", diag: true };
              pane = "filed";
              render();
              DS.ui.toast({
                icon: "check", title: "Report filed",
                body: rec.path ? "Saved as " + DS.fs.basename(rec.path) + "."
                               : "Saved.",
                action: rec.path ? {
                  label: "Open it",
                  run: function () { DS.openPath(rec.path); }
                } : null
              });
            }
          }),
          h("button.g-btn", {
            html: DS.icon("doc", 14) + "<span>Copy as Markdown</span>",
            onclick: function () {
              copy(DS.bugs.markdown({
                title: draft.title || "Untitled report",
                what: draft.what,
                steps: draft.steps,
                severity: draft.severity,
                when: Date.now(),
                diag: draft.diag ? DS.bugs.diagnostics() : null,
                errors: draft.diag ? DS.bugs.errors() : []
              }), "The report, unfiled.");
            }
          })
        ]));
      }

      /* ───────────── FILED ───────────── */
      function paneFiled(host) {
        host.appendChild(h("h2.st-h", { text: "Filed reports" }));
        var list = DS.bugs.list();
        host.appendChild(h("p.st-sub", {
          text: list.length
            ? "Every report you have written, newest first. Right-click one " +
              "for the rest of its options."
            : "Reports you file land here, and in Documents › Bug Reports."
        }));

        if (!list.length) {
          host.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("bug", 30) }),
            h("div", { text: "No reports yet" }),
            h("button.g-btn", {
              html: DS.icon("plus", 14) + "<span>Write one</span>",
              style: { "margin-top": "12px" },
              onclick: function () { pane = "report"; render(); }
            })
          ]));
          return;
        }

        list.forEach(function (r) {
          var row = h("div.bug-row", {}, [
            h("span.bug-sev", { data: { sev: r.severity } }),
            h("div.bug-rt", {}, [
              h("b", { text: r.title }),
              h("i", { text: DS.when(r.when) + "  ·  " + r.severity +
                             (r.errors && r.errors.length
                               ? "  ·  " + r.errors.length + " error" +
                                 (r.errors.length === 1 ? "" : "s")
                               : "") })
            ]),
            h("span.bug-go", { html: DS.icon("chevR", 14) })
          ]);
          row.addEventListener("click", function () {
            if (r.path && DS.fs.exists(r.path)) DS.openPath(r.path);
            else DS.ui.alert(r.title, DS.bugs.markdown(r));
          });
          row.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            e.stopPropagation();
            DS.ui.ctx(e.clientX, e.clientY, [
              { title: r.title },
              r.path && DS.fs.exists(r.path)
                ? { label: "Open in Notes", icon: "notes",
                    action: function () { DS.openPath(r.path); } }
                : null,
              { label: "Copy as Markdown", icon: "doc",
                action: function () { copy(DS.bugs.markdown(r), r.title); } },
              { sep: true },
              { label: "Delete", icon: "trash", action: function () {
                  DS.ui.confirm("Delete this report?", r.title,
                    { ok: "Delete", danger: true }).then(function (yes) {
                      if (!yes) return;
                      DS.bugs.remove(r.id);
                      render();
                    });
                } }
            ].filter(Boolean));
          });
          host.appendChild(row);
        });

        host.appendChild(h("div", { style: { "margin-top": "18px" } }, [
          h("button.g-btn", {
            html: DS.icon("folder", 14) + "<span>Show the folder</span>",
            onclick: function () {
              DS.wm.open("finder", { path: "/Users/you/Documents/Bug Reports" });
            }
          })
        ]));
      }

      /* ───────────── DIAGNOSTICS ───────────── */
      function errRow(e) {
        return h("div.bug-err", {}, [
          h("span.bug-ek", { text: e.kind }),
          h("div", {}, [
            h("b", { text: e.message + (e.count > 1 ? "  ×" + e.count : "") }),
            e.where ? h("i", { text: e.where }) : null
          ]),
          h("span.bug-ew", { text: DS.when(e.when) })
        ]);
      }

      function paneDiag(host) {
        host.appendChild(h("h2.st-h", { text: "Diagnostics" }));
        host.appendChild(h("p.st-sub", {
          text: "What a report attaches when diagnostics are switched on. " +
                "This is the whole of it — there is nothing collected that " +
                "is not on this page."
        }));

        var d = DS.bugs.diagnostics();
        Object.keys(d).forEach(function (k) {
          host.appendChild(h("div.st-kv", {}, [
            h("span", { text: k }),
            h("b", { text: String(d[k]), style: { "text-align": "right" } })
          ]));
        });

        host.appendChild(DS.ui.section("Errors caught"));
        var errs = DS.bugs.errors();
        if (!errs.length) {
          host.appendChild(h("p.st-hint", {
            text: "Nothing has thrown since the system started. Anything " +
                  "unhandled would appear here, and on the beetle."
          }));
        } else {
          host.appendChild(h("div.bug-errs", {}, errs.map(errRow)));
        }

        host.appendChild(h("div", {
          style: { display: "flex", gap: "8px", "margin-top": "18px", "flex-wrap": "wrap" }
        }, [
          h("button.g-btn", {
            html: DS.icon("doc", 14) + "<span>Copy diagnostics</span>",
            onclick: function () {
              copy(DS.bugs.markdown({
                title: "Diagnostics", severity: "cosmetic", when: Date.now(),
                what: "Diagnostics only, no report attached.",
                diag: d, errors: errs
              }), "Diagnostics only.");
            }
          }),
          h("button.g-btn", {
            html: DS.icon("refresh", 14) + "<span>Refresh</span>",
            onclick: render
          }),
          errs.length ? h("button.g-btn", {
            html: DS.icon("trash", 14) + "<span>Clear the log</span>",
            onclick: function () { DS.bugs.clearErrors(); render(); }
          }) : null,
          h("button.g-btn", {
            html: DS.icon("layers", 14) + "<span>Break something</span>",
            title: "Throws a real error, so you can see the beetle catch it",
            onclick: function () {
              setTimeout(function () {
                throw new Error("Deliberate test error from the Bug Reporter");
              }, 0);
              DS.ui.toast({
                icon: "bug", title: "Thrown",
                body: "Watch the beetle in the corner take the count.",
                timeout: 3000
              });
            }
          })
        ]));
      }

      render();

      api.openPane = function (id) { pane = id; render(); };

      /* Clicking "Report it" on an error toast while the window is
         already open should still hand the message over. */
      api.prefill = function (a) {
        if (a.what) draft.what = draft.what ? draft.what + "\n" + a.what : a.what;
        if (a.title) draft.title = a.title;
        if (a.severity) draft.severity = a.severity;
        pane = a.pane || "report";
        render();
      };
    },

    onArg: function (api, arg) {
      if (!arg || !api.prefill) return;
      api.prefill(arg);
    }
  });
})(window.DS);
