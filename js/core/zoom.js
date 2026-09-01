/* ═══════════════════════════════════════════════════════════════
   zoom.js — scale the whole desktop, or just one window

   Two zooms, deliberately separate:

     system zoom   scales the entire shell — menu bar, dock, windows,
                   widgets, menus. Everything gets bigger together, so
                   the desktop keeps its proportions and simply stops
                   being small. This is the accessibility one.

     window zoom   scales one window's contents and nothing else, per
                   app and remembered. Useful for reading a note at
                   140% without inflating the dock.

   Both ride on CSS `zoom`, which — unlike a transform — affects
   layout, so the desktop still measures exactly one viewport and
   nothing overflows. That matters here for one specific reason: a
   `transform` on an ancestor creates a backdrop root and every
   backdrop-filter underneath it stops sampling the wallpaper, which
   would take the glass out of a glass operating system. `zoom` does
   not do that.

   The cost is arithmetic. Pointer events arrive in viewport pixels
   while `style.left` is written in zoomed ones, so anything that
   converts between the two divides by the factor. That is what the
   helpers at the bottom are for, and why they all return 1 when
   nothing is zoomed — at 100% every one of them is a no-op, which is
   what keeps this from disturbing code that never asked about zoom.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var zoom = {};
  var root = document.documentElement;

  /* Firefox only grew a spec-compliant `zoom` in 126. Where it is
     missing we keep the factor pinned at 1 rather than half-applying
     it and leaving the pointer maths lying. */
  zoom.supported = (function () {
    try { return !!(window.CSS && CSS.supports && CSS.supports("zoom", "1.25")); }
    catch (e) { return false; }
  })();

  zoom.MIN = 60;
  zoom.MAX = 200;
  zoom.STOPS = [67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

  /* ───────────────────── SYSTEM ZOOM ───────────────────── */

  /** Percent, as stored. */
  zoom.pct = function () {
    if (!zoom.supported) return 100;
    return DS.clamp(DS.store.get("zoom.ui", 100), zoom.MIN, zoom.MAX);
  };

  /** The factor everything divides by. 1 when the desktop is at 100%. */
  zoom.k = function () { return zoom.pct() / 100; };

  zoom.apply = function () {
    root.style.setProperty("--ui-zoom", (zoom.pct() / 100).toFixed(4));
    root.setAttribute("data-zoomed", zoom.pct() === 100 ? "off" : "on");
    if (DS.shell && DS.shell.paintZoomPill) DS.shell.paintZoomPill();
    if (DS.glass && DS.glass.relight) DS.glass.relight();
  };

  zoom.set = function (pct, quiet) {
    if (!zoom.supported) {
      if (!quiet) {
        DS.ui.toast({
          icon: "info", title: "Zoom unavailable",
          body: "This browser has no support for CSS zoom, so the desktop " +
                "cannot be scaled without breaking window dragging."
        });
      }
      return 100;
    }
    var v = Math.round(DS.clamp(pct, zoom.MIN, zoom.MAX));
    DS.store.set("zoom.ui", v);
    zoom.apply();
    if (!quiet) {
      DS.ui.toast({
        icon: "search", title: "System zoom " + v + "%",
        body: v === 100 ? "Actual size." : "Ctrl+Alt+0 returns to 100%.",
        timeout: 1800
      });
    }
    return v;
  };

  /** The next preset stop above (dir > 0) or below the current one. */
  function nextStop(cur, dir) {
    var stops = zoom.STOPS;
    var i;
    if (dir > 0) {
      for (i = 0; i < stops.length; i++) if (stops[i] > cur) return stops[i];
      return stops[stops.length - 1];
    }
    for (i = stops.length - 1; i >= 0; i--) if (stops[i] < cur) return stops[i];
    return stops[0];
  }

  /** Move to the next preset stop in either direction. */
  zoom.step = function (dir) { return zoom.set(nextStop(zoom.pct(), dir)); };

  zoom.reset = function () { return zoom.set(100); };

  /* ───────────────────── WINDOW ZOOM ───────────────────── */
  /* Kept per app rather than per window, so reopening Notes at 130%
     gives you Notes at 130%. */

  function appOf(win) { return win && win._app ? win._app.id : null; }

  zoom.winPct = function (win) {
    var id = appOf(win);
    if (!id || !zoom.supported) return 100;
    return DS.clamp(DS.store.get("zoom.apps", {})[id] || 100, zoom.MIN, zoom.MAX);
  };

  zoom.paintWin = function (win) {
    if (!win || !win._body) return;
    var pct = zoom.winPct(win);
    win._body.style.zoom = pct === 100 ? "" : (pct / 100).toFixed(4);
    win.classList.toggle("win-zoomed", pct !== 100);
  };

  zoom.setWin = function (win, pct, quiet) {
    if (!win) return 100;
    if (!zoom.supported) {
      if (!quiet) zoom.set(pct);   // borrows the one honest message
      return 100;
    }
    var id = appOf(win);
    var v = Math.round(DS.clamp(pct, zoom.MIN, zoom.MAX));
    var all = DS.store.get("zoom.apps", {});
    if (v === 100) delete all[id];
    else all[id] = v;
    DS.store.set("zoom.apps", all);
    zoom.paintWin(win);
    if (win._app && win._app.onResize) {
      try { win._app.onResize(win._api); } catch (e) {}
    }
    if (!quiet) {
      DS.ui.toast({
        icon: "search",
        title: win._app.name + " at " + v + "%",
        body: v === 100 ? "Actual size." : "Ctrl+Shift+0 returns this window to 100%.",
        timeout: 1800
      });
    }
    return v;
  };

  zoom.stepWin = function (win, dir) {
    if (!win) return 100;
    return zoom.setWin(win, nextStop(zoom.winPct(win), dir));
  };

  /** Repaint every open window — after a reset, or on first paint. */
  zoom.paintAll = function () {
    if (!DS.wm) return;
    DS.wm.list().forEach(zoom.paintWin);
  };

  zoom.resetAll = function () {
    DS.store.set("zoom.apps", {});
    DS.store.set("zoom.ui", 100);
    zoom.apply();
    zoom.paintAll();
  };

  /* ───────────────────── COORDINATE HELPERS ─────────────────────
     Everything below returns identity at 100%, which is why calling
     them everywhere costs nothing when nobody has zoomed. */

  /** A viewport x/y, in the desktop's own coordinates. */
  zoom.x = function (clientX) { return clientX / zoom.k(); };
  zoom.y = function (clientY) { return clientY / zoom.k(); };

  /** A pointer delta, in the desktop's own pixels. */
  zoom.d = function (delta) { return delta / zoom.k(); };

  /** The viewport, in the desktop's own pixels. */
  zoom.vw = function () { return window.innerWidth / zoom.k(); };
  zoom.vh = function () { return window.innerHeight / zoom.k(); };

  /** getBoundingClientRect, converted to the desktop's coordinates. */
  zoom.rect = function (el) {
    var r = el.getBoundingClientRect();
    var k = zoom.k();
    return {
      left: r.left / k, top: r.top / k,
      right: r.right / k, bottom: r.bottom / k,
      width: r.width / k, height: r.height / k
    };
  };

  /** Total scale applied to an element: system zoom times its window's. */
  zoom.of = function (el) {
    var k = zoom.k();
    var body = el && el.closest ? el.closest(".win-body") : null;
    if (body && body.style.zoom) k *= parseFloat(body.style.zoom) || 1;
    return k;
  };

  /* ───────────────────── WHEEL + INIT ───────────────────── */

  function wireWheel() {
    window.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!DS.store.get("zoom.wheel", true)) return;
      if (!zoom.supported) return;
      e.preventDefault();                       // and not the browser's zoom
      var pct = zoom.pct() + (e.deltaY < 0 ? 5 : -5);
      DS.store.set("zoom.ui", Math.round(DS.clamp(pct, zoom.MIN, zoom.MAX)));
      zoom.apply();
    }, { passive: false });
  }

  zoom.init = function () {
    zoom.apply();
    zoom.paintAll();
    wireWheel();
  };

  DS.zoom = zoom;
})(window.DS);
