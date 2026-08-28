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
    glass.applyAccent();
  };

  /* ── accent ───────────────────────────────────────────────────
     Each theme ships a sensible accent, but the user can override
     it with a single hue. Writing it inline on <html> beats the
     [data-theme] rules; clearing it hands control back to the theme. */
  glass.applyAccent = function () {
    var hue = DS.store.get("accentHue", null);
    if (hue === null || hue === undefined) {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
      return;
    }
    root.style.setProperty("--accent", hue + " 100% 66%");
    root.style.setProperty("--accent-2", ((hue + 96) % 360) + " 90% 74%");
  };

  /* ── optical presets ──────────────────────────────────────────
     Named points in the eight-dimensional optics space. Plastic is
     included deliberately, as the counter-example. */
  glass.PRESETS = {
    crystal: {
      label: "Crystal",
      desc: "Thin, sharp and highly dispersive. Reads as cut glass.",
      v: { blur: 14, alpha: 6, sat: 215, bright: 108, thick: 1.7, disperse: 100, sheen: 75, radius: 20 }
    },
    liquid: {
      label: "Liquid",
      desc: "Thick rims, heavy dispersion, soft corners. Molten.",
      v: { blur: 24, alpha: 9, sat: 195, bright: 106, thick: 2.4, disperse: 135, sheen: 95, radius: 32 }
    },
    frosted: {
      label: "Frosted",
      desc: "Deep blur, gentle edges. Quiet and very readable.",
      v: { blur: 36, alpha: 13, sat: 150, bright: 110, thick: 1.0, disperse: 35, sheen: 35, radius: 24 }
    },
    minimal: {
      label: "Minimal",
      desc: "Barely there. Tight corners, almost no tint.",
      v: { blur: 11, alpha: 5, sat: 135, bright: 103, thick: 0.8, disperse: 25, sheen: 25, radius: 10 }
    },
    plastic: {
      label: "Plastic",
      desc: "The counter-example: no dispersion, no rim, no sheen.",
      v: { blur: 20, alpha: 22, sat: 140, bright: 104, thick: 0, disperse: 0, sheen: 0, radius: 18 }
    }
  };

  glass.usePreset = function (id) {
    var p = glass.PRESETS[id];
    if (!p) return false;
    Object.keys(p.v).forEach(function (k) { DS.store.set("glass." + k, p.v[k]); });
    glass.apply();
    return true;
  };

  /* ═══════════════ THE LIGHT SOURCE ═══════════════
     One light for the whole desktop. Every pane's rim gradient and
     bloom is oriented toward the same point, so highlights across
     unrelated windows agree with each other instead of each pane
     pretending to be lit from its own top-left corner.

     This is the main thing that stops the material reading as a
     stack of independent frosted rectangles. */
  var LIT_SEL = ".g, .g-btn, .dk, .di-glyph, .widget, .ca-key, .pin-key";

  function lightPoint() {
    var l = DS.store.get("light", {});
    return {
      x: (l.x / 100) * window.innerWidth,
      y: (l.y / 100) * window.innerHeight
    };
  }

  /** Write each pane's offset to the light, in its own coordinates. */
  var relightPending = false;
  glass.relight = function () {
    if (relightPending) return;
    relightPending = true;
    requestAnimationFrame(function () {
      relightPending = false;
      var L = lightPoint();
      DS.qsa(LIT_SEL).forEach(function (p) {
        var r = p.getBoundingClientRect();
        if (!r.width) return;
        p.style.setProperty("--lit-x", Math.round(L.x - r.left) + "px");
        p.style.setProperty("--lit-y", Math.round(L.y - r.top) + "px");
      });
    });
  };

  glass.applyLight = function () {
    var l = DS.store.get("light", {});
    root.style.setProperty("--light-str", (l.strength / 100).toFixed(2));
    root.style.setProperty("--light-x", l.x + "%");
    root.style.setProperty("--light-y", l.y + "%");
    root.style.setProperty("--caustic", (l.caustic / 100).toFixed(2));
    glass.relight();
  };

  /* ═══════════════ SURFACE FINISH ═══════════════
     Real glass is rarely flat. A finish is a repeating relief on the
     pane plus, where the browser can afford it, an actual
     displacement of what shows through. */
  glass.FINISHES = {
    smooth:    { label: "Smooth",    desc: "Optically flat. The default." },
    reeded:    { label: "Reeded",    desc: "Tall thin ribs. Vertical smear." },
    fluted:    { label: "Fluted",    desc: "Wider, softer channels." },
    cathedral: { label: "Cathedral", desc: "Irregular hand-rolled ripple." },
    bubbled:   { label: "Bubbled",   desc: "Fat lazy blobs of distortion." },
    frosted:   { label: "Frosted",   desc: "Acid-etched. Diffuse, no detail." }
  };

  glass.applyFinish = function () {
    root.setAttribute("data-finish", DS.store.get("finish", "smooth"));
    glass.redress();
  };

  glass.applyMotion = function () {
    var on = DS.store.get("wallpaperMotion", true);
    DS.qsa(".orb").forEach(function (o) {
      o.style.animationPlayState = on ? "running" : "paused";
    });
    root.setAttribute("data-motion", DS.store.get("motion", "full"));
  };

  /* ── wallpaper studio ─────────────────────────────────────────
     When a custom wallpaper is on, these inline variables override
     whatever the theme declared. Turning it off simply removes them
     and the theme takes over again. */
  var WP_VARS = ["--wp-base", "--o1", "--o2", "--o3", "--o4", "--o5",
                 "--orb-blur", "--orb-op", "--orb-scale", "--orb-speed", "--wp-grid-op"];

  glass.applyWallpaper = function () {
    var w = DS.store.get("wallpaper", {});
    var s = root.style;
    if (!w.custom) {
      WP_VARS.forEach(function (v) { s.removeProperty(v); });
      return;
    }
    s.setProperty("--wp-base",
      "radial-gradient(120% 90% at 20% 10%, " + shade(w.base, 22) + " 0%, " +
      w.base + " 48%, " + shade(w.base, -40) + " 100%)");
    (w.orbs || []).forEach(function (c, i) { s.setProperty("--o" + (i + 1), c); });
    s.setProperty("--orb-blur", w.blur + "px");
    s.setProperty("--orb-op", (w.opacity / 100).toFixed(2));
    s.setProperty("--orb-scale", (w.size / 100).toFixed(2));
    s.setProperty("--orb-speed", (100 / Math.max(10, w.speed)).toFixed(2));
    s.setProperty("--wp-grid-op", (w.grid / 100).toFixed(3));
  };

  /** Lighten (amount > 0) or darken a #rrggbb by a percentage. */
  function shade(hex, amt) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex));
    if (!m) return hex;
    var out = "#";
    for (var i = 1; i <= 3; i++) {
      var v = parseInt(m[i], 16);
      v = Math.round(v + (amt > 0 ? (255 - v) * (amt / 100) : v * (amt / 100)));
      v = DS.clamp(v, 0, 255);
      out += ("0" + v.toString(16)).slice(-2);
    }
    return out;
  }
  glass.shade = shade;

  /* ── dock geometry ── */
  glass.applyDock = function () {
    var d = DS.store.get("dock", {});
    root.style.setProperty("--dk-size", d.size + "px");
    root.style.setProperty("--dock-h", (d.size + 22) + "px");
    var wrap = DS.qs(".dock-wrap");
    var dock = DS.qs("#dock");
    if (wrap) {
      wrap.dataset.pos = d.position || "bottom";
      wrap.classList.toggle("autohide", !!d.autohide);
    }
    if (dock) {
      dock.dataset.pos = d.position || "bottom";
      dock.classList.toggle("nomag", !d.magnify);
    }
  };

  /** Everything at once — used after applying a saved look. */
  glass.applyAll = function () {
    glass.applyTheme();
    glass.apply();
    glass.applyWallpaper();
    glass.applyMotion();
    glass.applyDock();
    glass.applyLight();
    glass.applyFinish();
    glass.redress();
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

    var finish = DS.store.get("finish", "smooth");

    panes.forEach(function (p) {
      var has = !!DS.qs(":scope > .g-edge", p);
      if (on && !has && needsEdge(p)) {
        var edge = document.createElement("div");
        edge.className = "g-edge";
        p.insertBefore(edge, p.firstChild);
      } else if (!on && has) {
        p.removeChild(DS.qs(":scope > .g-edge", p));
      }

      // the finish layer sits over the whole pane, not just the rim
      var fin = DS.qs(":scope > .g-finish", p);
      if (finish !== "smooth" && !fin && needsEdge(p)) {
        fin = document.createElement("div");
        fin.className = "g-finish";
        p.insertBefore(fin, p.firstChild);
      } else if (finish === "smooth" && fin) {
        p.removeChild(fin);
      }
    });
    glass.relight();
  };

  /** Re-run dressing across the whole desktop (after a settings change). */
  glass.redress = function () {
    if (!DS.store.get("refraction", true)) {
      DS.qsa(".g-edge").forEach(function (e) {
        if (e.parentNode) e.parentNode.removeChild(e);
      });
    }
    if (DS.store.get("finish", "smooth") === "smooth") {
      DS.qsa(".g-finish").forEach(function (e) {
        if (e.parentNode) e.parentNode.removeChild(e);
      });
    }
    glass.dress(document);
  };

  /* ═══════════════ SHATTER ═══════════════
     Closing a pane of glass should not look like closing a rectangle
     of frosted plastic. Shards are thrown from the window's own
     footprint, each one carrying a slice of the same backdrop blur. */
  glass.shatter = function (rect) {
    if (!DS.store.get("shatter", true)) return;
    if (DS.store.get("motion") === "off") return;

    var host = DS.qs("#desktop");
    if (!host) return;
    var n = DS.clamp(Math.round((rect.width * rect.height) / 22000), 8, 26);

    for (var i = 0; i < n; i++) {
      var sh = document.createElement("i");
      sh.className = "shard";
      var sx = Math.random(), sy = Math.random();
      var w = 18 + Math.random() * 46;
      sh.style.left = (rect.left + sx * (rect.width - w)) + "px";
      sh.style.top = (rect.top + sy * (rect.height - w)) + "px";
      sh.style.width = w + "px";
      sh.style.height = w + "px";
      // fling outward from the centre of the pane
      sh.style.setProperty("--dx", ((sx - 0.5) * 260 + (Math.random() - 0.5) * 90).toFixed(0) + "px");
      sh.style.setProperty("--dy", ((sy - 0.5) * 180 + 120 + Math.random() * 120).toFixed(0) + "px");
      sh.style.setProperty("--rot", ((Math.random() - 0.5) * 220).toFixed(0) + "deg");
      sh.style.setProperty("--delay", (Math.random() * 90).toFixed(0) + "ms");
      host.appendChild(sh);
      (function (node) {
        setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 900);
      })(sh);
    }
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

  var sheenOn = false;
  glass.initSheen = function () {
    if (sheenOn) return;          // boot.js and shell.init both call this
    sheenOn = true;
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
