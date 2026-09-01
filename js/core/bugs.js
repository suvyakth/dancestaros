/* ═══════════════════════════════════════════════════════════════
   bugs.js — the bug in the corner

   A glass beetle sits at the bottom right of the desktop. Click it
   and it opens a report already knowing everything a report normally
   has to ask you for: which theme, which optics, which window was in
   front, what the browser is, and — the useful part — whatever the OS
   itself threw in the last few minutes.

   That is the point of it. Anything unhandled that hits `window` is
   caught here, kept in a ring buffer, and counted on the beetle's
   back, so the moment something goes wrong the way to say so is
   already glowing at you rather than needing to be found.

   Nothing is uploaded anywhere. Reports are saved into the file
   system as Markdown under Documents/Bug Reports and can be copied
   out; where they go after that is your business.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var bugs = {};

  var DIR = "/Users/you/Documents/Bug Reports";
  var KEEP = 25;          // errors held in the session ring buffer
  var caught = [];        // { when, kind, message, where }
  var seen = 0;           // errors caught since the beetle was last opened

  /* ───────────────────── ERROR CAPTURE ───────────────────── */

  function place(src, line, col) {
    if (!src) return "";
    var file = String(src).split("/").pop();
    return file + (line ? ":" + line : "") + (col ? ":" + col : "");
  }

  bugs.note = function (kind, message, where) {
    var msg = String(message == null ? "(no message)" : message).slice(0, 400);

    // The same error firing in a loop should read as one line, not forty.
    var last = caught[caught.length - 1];
    if (last && last.message === msg && last.kind === kind) {
      last.count += 1;
      last.when = Date.now();
    } else {
      caught.push({
        when: Date.now(), kind: kind, message: msg,
        where: where || "", count: 1
      });
      if (caught.length > KEEP) caught.shift();
    }

    seen += 1;
    bugs.paintDot();

    /* Say something the first time only. After that the count on the
       beetle is enough — a stream of toasts about a broken thing is
       its own broken thing. */
    if (seen === 1) {
      DS.ui.toast({
        icon: "info",
        title: "Something went wrong",
        body: msg,
        timeout: 9000,
        action: {
          label: "Report it",
          run: function () { bugs.open({ what: msg }); }
        }
      });
    }
    return true;
  };

  bugs.errors = function () { return caught.slice().reverse(); };
  bugs.unseen = function () { return seen; };
  bugs.clearErrors = function () { caught = []; seen = 0; bugs.paintDot(); };

  function wireCapture() {
    window.addEventListener("error", function (e) {
      // a failed <img>/<audio> is an event on the element, not a script error
      if (e.target && e.target !== window && e.target.tagName) {
        bugs.note("resource", (e.target.tagName || "") + " failed to load",
                  place(e.target.currentSrc || e.target.src));
        return;
      }
      bugs.note("error", (e.message || "Script error"),
                place(e.filename, e.lineno, e.colno));
    }, true);

    window.addEventListener("unhandledrejection", function (e) {
      var r = e.reason;
      bugs.note("promise", r && r.message ? r.message : r, "");
    });
  }

  /* ───────────────────── DIAGNOSTICS ───────────────────── */

  bugs.diagnostics = function () {
    var g = DS.store.get("glass", {});
    var win = DS.wm ? DS.wm.focused() : null;
    var raw = "";
    try { raw = localStorage.getItem("dancestar.os.v1") || ""; } catch (e) {}

    return {
      when: new Date().toISOString(),
      front: win && win._app ? win._app.name : "(nothing)",
      open: DS.wm ? DS.wm.list().map(function (w) { return w._app.id; }).join(", ") : "",
      theme: DS.store.get("theme"),
      finish: DS.store.get("finish"),
      refraction: DS.store.get("refraction") ? "on" : "off",
      motion: DS.store.get("motion"),
      optics: "blur " + g.blur + "px, tint " + g.alpha + "%, dispersion " +
              g.disperse + "%, rim " + g.thick + "px, radius " + g.radius + "px",
      zoom: (DS.zoom ? DS.zoom.pct() : 100) + "%" +
            (DS.zoom && DS.zoom.supported ? "" : " (unsupported)"),
      language: DS.i18n ? DS.i18n.id() + " / " + DS.i18n.locale() : "en",
      viewport: window.innerWidth + "×" + window.innerHeight +
                " @ " + (window.devicePixelRatio || 1) + "x",
      state: DS.bytes(raw.length),
      agent: navigator.userAgent
    };
  };

  /* ───────────────────── REPORTS ───────────────────── */

  bugs.list = function () { return DS.store.get("bugs.reports", []); };

  bugs.markdown = function (r) {
    var out = [];
    out.push("# " + (r.title || "Untitled report"));
    out.push("");
    out.push("- **Severity:** " + r.severity);
    out.push("- **Filed:** " + new Date(r.when).toLocaleString());
    out.push("");
    out.push("## What happened");
    out.push(r.what || "(not described)");
    if (r.steps) {
      out.push("");
      out.push("## Steps to reproduce");
      out.push(r.steps);
    }
    if (r.diag) {
      out.push("");
      out.push("## Diagnostics");
      Object.keys(r.diag).forEach(function (k) {
        out.push("- **" + k + ":** " + r.diag[k]);
      });
    }
    if (r.errors && r.errors.length) {
      out.push("");
      out.push("## Errors caught");
      r.errors.forEach(function (e) {
        out.push("- `" + e.kind + "` " + e.message +
                 (e.where ? " (" + e.where + ")" : "") +
                 (e.count > 1 ? " ×" + e.count : ""));
      });
    }
    out.push("");
    return out.join("\n");
  };

  /** File a report. Saved to the store and written out as Markdown. */
  bugs.file = function (r) {
    var rec = {
      id: DS.uid("bug"),
      when: Date.now(),
      title: r.title || "Untitled report",
      what: r.what || "",
      steps: r.steps || "",
      severity: r.severity || "annoying",
      diag: r.diag || null,
      errors: r.errors || []
    };

    /* Written into the file system as well, so a report is a thing you
       can open in Notes and hand to someone, not a row in a list that
       only this app can read. */
    rec.path = null;
    try {
      if (!DS.fs.exists(DIR)) DS.fs.mkdir(DIR);
      var safe = rec.title.replace(/[\/\\:*?"<>|]/g, "-").trim().slice(0, 48) || "report";
      var path = DIR + "/" + DS.fs.freeName(DIR, safe, ".md");
      if (DS.fs.write(path, bugs.markdown(rec), "text")) rec.path = path;
    } catch (e) { /* a full tree must not cost us the report itself */ }

    var list = bugs.list().slice();
    list.unshift(rec);
    DS.store.set("bugs.reports", list.slice(0, 60));

    bugs.paintDot();
    return rec;
  };

  bugs.remove = function (id) {
    DS.store.set("bugs.reports", bugs.list().filter(function (r) {
      return r.id !== id;
    }));
    bugs.paintDot();
  };

  /* ───────────────────── THE BEETLE ───────────────────── */

  bugs.open = function (prefill) {
    seen = 0;
    bugs.paintDot();
    DS.wm.open("bugs", prefill || {});
  };

  /** Position, visibility and the count on its back. */
  bugs.paintDot = function () {
    var dot = DS.qs("#bugdot");
    if (!dot) return;
    var conf = DS.store.get("bugs", {});
    dot.hidden = conf.show === false;
    dot.dataset.corner = conf.corner || "br";
    dot.classList.toggle("alert", seen > 0);

    var badge = DS.qs(".bug-count", dot);
    if (badge) {
      badge.textContent = seen > 9 ? "9+" : String(seen);
      badge.hidden = seen === 0;
    }
    dot.title = seen
      ? seen + " error" + (seen === 1 ? "" : "s") + " caught — report it"
      : "Report a bug";
  };

  function dotMenu(x, y) {
    var conf = DS.store.get("bugs", {});
    function corner(id, label) {
      return {
        label: label,
        icon: (conf.corner || "br") === id ? "check" : "chevR",
        action: function () { DS.store.set("bugs.corner", id); bugs.paintDot(); }
      };
    }
    DS.ui.ctx(x, y, [
      { title: "The bug" },
      { label: "Report a bug", icon: "bell", action: function () { bugs.open(); } },
      { label: "Bug reports", icon: "doc",
        action: function () { bugs.open({ pane: "filed" }); } },
      { sep: true },
      { title: "Corner" },
      corner("br", "Bottom right"),
      corner("bl", "Bottom left"),
      corner("tr", "Top right"),
      { sep: true },
      { label: "Squash it", icon: "layers", action: function () {
          /* It is made of glass, after all. */
          var r = DS.qs("#bugdot").getBoundingClientRect();
          DS.glass.crack(r.left + r.width / 2, r.top + r.height / 2,
                         { arms: 9, reach: 260, hold: 1200 });
          DS.ui.toast({
            icon: "layers", title: "It is glass, not chitin",
            body: "The beetle is fine. The screen took it instead.",
            timeout: 3200
          });
        } },
      { label: "Hide the bug", icon: "eye", action: function () {
          DS.store.set("bugs.show", false);
          bugs.paintDot();
          DS.ui.toast({
            icon: "eye", title: "The bug is hidden",
            body: "Bring it back from Settings, or with the Report a bug action.",
            timeout: 6000,
            action: {
              label: "Undo",
              run: function () { DS.store.set("bugs.show", true); bugs.paintDot(); }
            }
          });
        } }
    ]);
  }

  bugs.init = function () {
    wireCapture();
    var dot = DS.qs("#bugdot");
    if (dot) {
      dot.addEventListener("click", function () { bugs.open(); });
      dot.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dotMenu(e.clientX, e.clientY);
      });
      DS.glass.dress(dot);
    }
    bugs.paintDot();
  };

  DS.bugs = bugs;
})(window.DS);
