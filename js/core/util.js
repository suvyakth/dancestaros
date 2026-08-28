/* ═══════════════════════════════════════════════════════════════
   util.js — DOM helpers + the icon set
   Plain classic scripts on a single DS namespace, so the OS runs
   from file:// with no build step and no server.
   ═══════════════════════════════════════════════════════════════ */
window.DS = window.DS || {};

(function (DS) {
  "use strict";

  /* ── hyperscript ───────────────────────────────────────────── */
  function h(tag, attrs, children) {
    var parts = tag.split(".");
    var node = document.createElement(parts[0] || "div");
    if (parts.length > 1) node.className = parts.slice(1).join(" ");

    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") {
          node.className = (node.className ? node.className + " " : "") + v;
        } else if (k === "html") {
          node.innerHTML = v;
        } else if (k === "text") {
          node.textContent = v;
        } else if (k === "style" && typeof v === "object") {
          Object.keys(v).forEach(function (p) { node.style.setProperty(p, v[p]); });
        } else if (k === "data" && typeof v === "object") {
          Object.keys(v).forEach(function (p) { node.dataset[p] = v[p]; });
        } else if (k.slice(0, 2) === "on" && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === "value") {
          node.value = v;
        } else {
          node.setAttribute(k, v === true ? "" : v);
        }
      });
    }

    (Array.isArray(children) ? children : children != null ? [children] : [])
      .forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
      });
    return node;
  }

  DS.h = h;
  DS.qs = function (s, r) { return (r || document).querySelector(s); };
  DS.qsa = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  DS.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  DS.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var seq = 0;
  DS.uid = function (p) { seq += 1; return (p || "id") + "-" + seq.toString(36); };

  DS.bytes = function (n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  };

  DS.when = function (ts) {
    var d = new Date(ts);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  };

  DS.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ── icons ─────────────────────────────────────────────────────
     One consistent 24x24 line-art set. Stroke uses currentColor so
     every icon inherits the glass text colour automatically. */
  var P = {
    finder:   '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2c.5 0 1 .2 1.4.6l1.3 1.3h7.1A2.5 2.5 0 0 1 21 9.4v7.1A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    notes:    '<path d="M6 3.5h9L19.5 8v12.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M14.5 3.6V8H19"/><path d="M8.5 12.5h7M8.5 16h5"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 10l2.6 2.4L7 15"/><path d="M12.5 15.4h4.5"/>',
    calc:     '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7"/><path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M3.9 7.2l2.6 1.5M17.5 15.3l2.6 1.5M3.9 16.8l2.6-1.5M17.5 8.7l2.6-1.5"/>',
    music:    '<circle cx="7" cy="17.5" r="2.6"/><circle cx="18" cy="15.5" r="2.6"/><path d="M9.6 17.5V7.2l11-2.1v10.4"/><path d="M9.6 9.6l11-2.1"/>',
    photos:   '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.8"/><path d="M3.6 17.2l4.6-4.2a2 2 0 0 1 2.7 0l3 2.8 2-1.8a2 2 0 0 1 2.7.1l3 2.9"/>',
    about:    '<circle cx="12" cy="12" r="9"/><path d="M12 10.8v6M12 7.6h.01"/>',
    folder:   '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6c.5 0 1 .2 1.3.6l1.2 1.4H19a2 2 0 0 1 2 2v7A2 2 0 0 1 19 18.5H5a2 2 0 0 1-2-2z"/>',
    file:     '<path d="M6.5 3.5h8L19 8v12.5h-12.5z"/><path d="M14.3 3.6V8H19"/>',
    doc:      '<path d="M6.5 3.5h8L19 8v12.5h-12.5z"/><path d="M14.3 3.6V8H19"/><path d="M9 12h6M9 15.5h4"/>',
    image:    '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.8" cy="10" r="1.6"/><path d="M4 17l4.4-4a1.8 1.8 0 0 1 2.4 0l5.6 5"/>',
    search:   '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    trash:    '<path d="M4.5 7h15M9.5 7V4.8h5V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
    check:    '<path d="M5 12.8l4.2 4.2L19 7.2"/>',
    x:        '<path d="M6 6l12 12M18 6L6 18"/>',
    chevR:    '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
    chevD:    '<path d="M5.5 9.5L12 16l6.5-6.5"/>',
    chevL:    '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    play:     '<path d="M7.5 4.8l11.5 7.2-11.5 7.2z"/>',
    pause:    '<path d="M8.8 5v14M15.2 5v14"/>',
    next:     '<path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/>',
    prev:     '<path d="M18 5l-9 7 9 7z"/><path d="M6 5v14"/>',
    volume:   '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.6a7.5 7.5 0 0 1 0 10.8"/>',
    shuffle:  '<path d="M17 4.5L20 7l-3 2.5"/><path d="M20 7h-3.4a4 4 0 0 0-3.3 1.8L11 12"/><path d="M17 14.5L20 17l-3 2.5"/><path d="M4 7h2.2a4 4 0 0 1 3.3 1.8"/><path d="M20 17h-3.4a4 4 0 0 1-3.3-1.8L11 12"/><path d="M4 17h2.2"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.4M12 19v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.6 12H5M19 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>',
    moon:     '<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4z"/>',
    palette:  '<path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.3 0 1.8-.9 1.8-1.7 0-1.6-1.4-1.9-1.4-3.1 0-1 .8-1.7 2-1.7h1.7c2.6 0 4.7-2 4.7-4.6C20.8 6 16.9 3.2 12 3.2z"/><circle cx="7.6" cy="11" r="1.2"/><circle cx="10.4" cy="7.4" r="1.2"/><circle cx="15" cy="8" r="1.2"/>',
    sliders:  '<path d="M5 5v5M5 14v5M12 5v9M12 18v1M19 5v2M19 11v8"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="19" cy="9" r="2"/>',
    clock:    '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.4 2.2"/>',
    star:     '<path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1 5.6-4.9-2.8-4.9 2.8 1-5.6L4 9.8l5.6-.7z"/>',
    home:     '<path d="M4 10.6L12 4l8 6.6V20h-5.5v-5.5h-5V20H4z"/>',
    desktop:  '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
    grid:     '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    list:     '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4.2 6.5h.01M4.2 12h.01M4.2 17.5h.01"/>',
    cpu:      '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3"/>',
    power:    '<path d="M12 4v8"/><path d="M7.2 7a7 7 0 1 0 9.6 0"/>',
    lock:     '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
    refresh:  '<path d="M20 6.5v5h-5"/><path d="M19.4 11.5A7.5 7.5 0 1 0 12 19.5a7.5 7.5 0 0 0 6.4-3.6"/>',
    save:     '<path d="M5.5 4.5h10L19.5 8.5v11h-14z"/><path d="M9 4.5v5h6v-5"/><rect x="8.5" y="13" width="7" height="6.5"/>',
    download: '<path d="M12 3.5v12"/><path d="M7.5 11L12 15.5 16.5 11"/><path d="M4.5 19.5h15"/>',
    upload:   '<path d="M12 20.5v-12"/><path d="M7.5 13L12 8.5 16.5 13"/><path d="M4.5 4.5h15"/>',
    film:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14"/><path d="M3 12h18M3 8.5h4.5M3 15.5h4.5M16.5 8.5H21M16.5 15.5H21"/>',
    wave:     '<path d="M3 12h2M7 7v10M11 4v16M15 8.5v7M19 10.5v3"/>',
    eye:      '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.8"/>',
    layers:   '<path d="M12 3.5l8.5 4.6L12 12.7 3.5 8.1z"/><path d="M3.5 12.4l8.5 4.6 8.5-4.6"/><path d="M3.5 16.4l8.5 4.6 8.5-4.6"/>',
    wifi:     '<path d="M4 9.2a12 12 0 0 1 16 0"/><path d="M7 12.6a7.6 7.6 0 0 1 10 0"/><path d="M9.9 15.9a3.5 3.5 0 0 1 4.2 0"/><path d="M12 19.2h.01"/>',
    battery:  '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21 11v2"/><rect x="4.5" y="10" width="9" height="4" rx="1" fill="currentColor" stroke="none"/>',
    info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    bell:     '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z"/><path d="M10 18.5a2.2 2.2 0 0 0 4 0"/>',
    stack:    '<rect x="3.5" y="4" width="17" height="5" rx="1.6"/><rect x="3.5" y="11" width="17" height="5" rx="1.6"/><path d="M6 18.6h12"/>',
    minimize: '<path d="M6 12h12"/>',
    maximize: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>'
  };

  DS.icon = function (name, size, extra) {
    var s = size || 18;
    var body = P[name] || P.file;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" ' +
      (extra || "") + '>' + body + "</svg>";
  };

  DS.iconEl = function (name, size, extra) {
    var span = document.createElement("span");
    span.style.display = "contents";
    span.innerHTML = DS.icon(name, size, extra);
    return span.firstChild;
  };

  DS.hasIcon = function (name) { return !!P[name]; };

  /* ── avatar presets ─────────────────────────────────────────
     A bead of coloured glass with a glyph on it. Cheap to store
     (one index + one character) and it themes itself. */
  DS.AVATARS = {
    grads: [
      "linear-gradient(150deg,#22d3ee,#6366f1)",
      "linear-gradient(150deg,#f43f5e,#fb923c)",
      "linear-gradient(150deg,#a855f7,#ec4899)",
      "linear-gradient(150deg,#34d399,#0ea5e9)",
      "linear-gradient(150deg,#fbbf24,#f43f5e)",
      "linear-gradient(150deg,#818cf8,#c084fc)",
      "linear-gradient(150deg,#2dd4bf,#a3e635)",
      "linear-gradient(150deg,#fda4af,#a855f7)",
      "linear-gradient(150deg,#94a3b8,#0f172a)",
      "linear-gradient(150deg,#fcd34d,#22d3ee)"
    ],
    glyphs: ["✦", "◈", "❖", "▲", "●", "✦",
             "♢", "✷", "☾", "✺", "⬡", "✧"]
  };

  DS.avatarGrad = function (i) {
    var g = DS.AVATARS.grads;
    return g[((i || 0) % g.length + g.length) % g.length];
  };
})(window.DS);
