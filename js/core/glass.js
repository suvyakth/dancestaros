/* ═══════════════════════════════════════════════════════════════
   glass.js — the optical runtime

   Two jobs:
     1. push the stored optical settings into CSS custom properties
     2. "dress" glass surfaces — inject the refraction band and wire
        the cursor-tracked specular sheen
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var glass = {};
  var root = document.documentElement;

  /** Write the stored glass settings onto :root as CSS variables. */
  glass.apply = function () {
    var g = DS.store.get("glass", {});
    var s = root.style;
    s.setProperty("--g-blur", g.blur + "px");
    s.setProperty("--g-alpha", (g.alpha / 100).toFixed(4));
    s.setProperty("--g-sat", g.sat + "%");
    s.setProperty("--g-bright", (g.bright / 100).toFixed(3));
    s.setProperty("--g-thick", g.thick + "px");
    s.setProperty("--g-disperse", (g.disperse / 100).toFixed(3));
    s.setProperty("--g-sheen", (g.sheen / 100).toFixed(3));
    s.setProperty("--g-radius", g.radius + "px");
    s.setProperty("--g-radius-sm", Math.round(g.radius * 0.55) + "px");
    s.setProperty("--g-radius-xs", Math.round(g.radius * 0.4) + "px");
  };

  glass.applyTheme = function () {
    root.setAttribute("data-theme", DS.store.get("theme", "aurora"));
  };

  glass.applyMotion = function () {
    var on = DS.store.get("wallpaperMotion", true);
    DS.qsa(".orb").forEach(function (o) {
      o.style.animationPlayState = on ? "running" : "paused";
    });
  };

  /* ── refraction band ──────────────────────────────────────────
     A masked ring that displaces the pixels behind the rim. It is
     the single most expensive effect in the OS, so it is optional
     and injected only into surfaces that are large enough to show
     it (windows, panels, the dock, the launcher). */
  function needsEdge(node) {
    var r = node.getBoundingClientRect();
    return r.width > 90 && r.height > 60;
  }

  glass.dress = function (scope) {
    var on = DS.store.get("refraction", true);
    var panes = [];
    if (scope && scope.classList && scope.classList.contains("g")) panes.push(scope);
    panes = panes.concat(DS.qsa(".g", scope || document));

    panes.forEach(function (p) {
      var has = p.firstElementChild && p.firstElementChild.classList.contains("g-edge");
      if (on && !has && needsEdge(p)) {
        var edge = document.createElement("div");
        edge.className = "g-edge";
        p.insertBefore(edge, p.firstChild);
      } else if (!on && has) {
        p.removeChild(p.firstElementChild);
      }
    });
  };

  /** Re-run dressing across the whole desktop (after a settings change). */
  glass.redress = function () {
    var on = DS.store.get("refraction", true);
    if (!on) {
      DS.qsa(".g-edge").forEach(function (e) {
        if (e.parentNode) e.parentNode.removeChild(e);
      });
      return;
    }
    glass.dress(document);
  };

  /* ── specular sheen ──────────────────────────────────────────
     One delegated pointer listener writes --mx/--my on whichever
     glass surface is under the cursor. Cheaper than a listener per
     surface, and it makes light genuinely slide across the panes. */
  var lastLit = null;
  var pending = null;

  function track(e) {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = null;
      var t = e.target;
      var pane = t && t.closest ? t.closest(".g, .g-btn, .dk, .di-glyph") : null;
      if (pane !== lastLit && lastLit) {
        lastLit.style.removeProperty("--mx");
        lastLit.style.removeProperty("--my");
      }
      lastLit = pane;
      if (!pane) return;
      var r = pane.getBoundingClientRect();
      pane.style.setProperty("--mx", (e.clientX - r.left).toFixed(1) + "px");
      pane.style.setProperty("--my", (e.clientY - r.top).toFixed(1) + "px");
    });
  }

  glass.initSheen = function () {
    document.addEventListener("pointermove", track, { passive: true });
  };

  /* ── perf mode ───────────────────────────────────────────────
     Stacked backdrop-filters are the bottleneck. During drags and
     resizes we halve every blur radius, then restore on release. */
  var liteDepth = 0;
  glass.lite = function (on) {
    liteDepth += on ? 1 : -1;
    if (liteDepth < 0) liteDepth = 0;
    root.classList.toggle("perf-lite", liteDepth > 0);
  };

  DS.glass = glass;
})(window.DS);
