/* ═══════════════════════════════════════════════════════════════
   ui.js — shared glass UI primitives
   Menus, context menus, dialogs, notifications, and the control
   factories (switch / slider / segmented) that apps reuse.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var ui = {};

  /* ───────────────────── NOTIFICATIONS ───────────────────── */
  ui.toast = function (opts) {
    var host = DS.qs("#toasts");
    if (!host) return null;
    var o = opts || {};
    var card = h("div.toast.g", {}, [
      h("div.ti", { html: DS.icon(o.icon || "bell", 17) }),
      h("div.tc", {}, [
        h("b", { text: o.title || "Notice" }),
        o.body ? h("p", { text: o.body }) : null
      ])
    ]);
    host.appendChild(card);
    DS.glass.dress(card);

    var life = o.timeout === 0 ? 0 : (o.timeout || 4200);
    function dismiss() {
      if (card.classList.contains("out")) return;
      card.classList.add("out");
      setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 280);
    }
    card.addEventListener("click", dismiss);
    if (life) setTimeout(dismiss, life);
    return dismiss;
  };

  /* ───────────────────── MENUS ─────────────────────
     One renderer for both the menu-bar popovers and the desktop
     context menu; only the positioning differs. */
  function renderItems(host, items, close) {
    DS.clear(host);
    items.forEach(function (it) {
      if (!it) return;
      if (it.sep) { host.appendChild(h("div.g-sep")); return; }
      if (it.title) { host.appendChild(h("div.mi-title", { text: it.title })); return; }
      var row = h("div.mi" + (it.dim ? ".dim" : ""), {}, [
        it.icon ? h("span", { html: DS.icon(it.icon, 15), style: { display: "contents" } }) : null,
        h("span", { text: it.label }),
        it.kbd ? h("span.k", { text: it.kbd }) : null
      ]);
      if (!it.dim) {
        row.addEventListener("click", function (e) {
          e.stopPropagation();
          close();
          if (it.action) it.action();
        });
      }
      host.appendChild(row);
    });
  }

  function placeIn(node, x, y) {
    // keep the menu inside the viewport
    node.style.left = "0px";
    node.style.top = "0px";
    node.hidden = false;
    var r = node.getBoundingClientRect();
    var maxX = window.innerWidth - r.width - 8;
    var maxY = window.innerHeight - r.height - 8;
    node.style.left = DS.clamp(x, 8, Math.max(8, maxX)) + "px";
    node.style.top = DS.clamp(y, 8, Math.max(8, maxY)) + "px";
  }

  var openMenu = null;

  function closeMenus() {
    if (!openMenu) return;
    openMenu.node.hidden = true;
    if (openMenu.onClose) openMenu.onClose();
    openMenu = null;
  }
  ui.closeMenus = closeMenus;

  function showMenu(node, x, y, items, onClose) {
    closeMenus();
    node.classList.remove("g");
    node.classList.add("g");
    renderItems(node, items, closeMenus);
    placeIn(node, x, y);
    DS.glass.dress(node);
    openMenu = { node: node, onClose: onClose };
  }

  /** Context menu at a point. */
  ui.ctx = function (x, y, items) {
    showMenu(DS.qs("#ctxmenu"), x, y, items);
  };

  /** Popover hanging off an anchor element (menu bar). */
  ui.pop = function (anchor, items) {
    var r = anchor.getBoundingClientRect();
    var node = DS.qs("#menu-pop");
    if (openMenu && openMenu.anchor === anchor) { closeMenus(); return; }
    anchor.classList.add("on");
    showMenu(node, r.left - 4, r.bottom + 5, items, function () {
      anchor.classList.remove("on");
    });
    openMenu.anchor = anchor;
  };

  document.addEventListener("pointerdown", function (e) {
    if (!openMenu) return;
    if (openMenu.node.contains(e.target)) return;
    if (openMenu.anchor && openMenu.anchor.contains(e.target)) return;
    closeMenus();
  }, true);
  window.addEventListener("blur", closeMenus);

  /* ───────────────────── DIALOGS ───────────────────── */
  function dialog(build) {
    return new Promise(function (resolve) {
      var veil = h("div.dlg-veil");
      var panel = h("div.dlg.g");
      veil.appendChild(panel);

      function done(v) {
        veil.style.transition = "opacity 160ms linear";
        veil.style.opacity = "0";
        setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 170);
        document.removeEventListener("keydown", onKey, true);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.stopPropagation(); done(null); }
      }
      document.addEventListener("keydown", onKey, true);
      veil.addEventListener("pointerdown", function (e) {
        if (e.target === veil) done(null);
      });

      build(panel, done);
      DS.qs("#desktop").appendChild(veil);
      DS.glass.dress(panel);
    });
  }

  ui.confirm = function (title, message, opts) {
    var o = opts || {};
    return dialog(function (panel, done) {
      panel.appendChild(h("h3", { text: title }));
      if (message) panel.appendChild(h("p", { text: message }));
      panel.appendChild(h("div.row", {}, [
        h("button.g-btn", { text: o.cancel || "Cancel", onclick: function () { done(false); } }),
        h("button.g-btn" + (o.danger ? ".g-btn-danger" : ".g-btn-accent"), {
          text: o.ok || "OK",
          onclick: function () { done(true); }
        })
      ]));
    });
  };

  ui.prompt = function (title, message, initial, opts) {
    var o = opts || {};
    return dialog(function (panel, done) {
      panel.appendChild(h("h3", { text: title }));
      if (message) panel.appendChild(h("p", { text: message }));
      var input = h("input.g-field", {
        type: "text",
        value: initial || "",
        style: { "margin-bottom": "16px" },
        onkeydown: function (e) {
          if (e.key === "Enter") done(input.value.trim() || null);
        }
      });
      panel.appendChild(input);
      panel.appendChild(h("div.row", {}, [
        h("button.g-btn", { text: "Cancel", onclick: function () { done(null); } }),
        h("button.g-btn.g-btn-accent", {
          text: o.ok || "Create",
          onclick: function () { done(input.value.trim() || null); }
        })
      ]));
      setTimeout(function () { input.focus(); input.select(); }, 60);
    });
  };

  ui.alert = function (title, message) {
    return dialog(function (panel, done) {
      panel.appendChild(h("h3", { text: title }));
      if (message) panel.appendChild(h("p", { text: message }));
      panel.appendChild(h("div.row", {}, [
        h("button.g-btn.g-btn-accent", { text: "Got it", onclick: function () { done(true); } })
      ]));
    });
  };

  /* ───────────────────── CONTROL FACTORIES ───────────────────── */

  /** Glass toggle. onChange receives the new boolean. */
  ui.toggle = function (value, onChange) {
    var node = h("div.g-switch" + (value ? ".on" : ""), {
      role: "switch",
      onclick: function () {
        node.classList.toggle("on");
        onChange(node.classList.contains("on"));
      }
    }, [h("i")]);
    return node;
  };

  /** Glass slider whose track fill follows the value. */
  ui.slider = function (opts) {
    var o = opts || {};
    var input = h("input.g-range", {
      type: "range",
      min: o.min, max: o.max, step: o.step || 1, value: o.value
    });
    function paint() {
      var pct = ((input.value - o.min) / (o.max - o.min)) * 100;
      input.style.setProperty("--fill", pct + "%");
    }
    input.addEventListener("input", function () {
      paint();
      if (o.onInput) o.onInput(parseFloat(input.value));
    });
    paint();
    input.dsPaint = paint;
    return input;
  };

  /** Labelled slider row with a live readout. */
  ui.sliderRow = function (opts) {
    var o = opts || {};
    var read = h("span", {
      text: o.format ? o.format(o.value) : String(o.value),
      style: {
        "font-size": "11.5px", color: "var(--text-2)",
        "font-variant-numeric": "tabular-nums", "min-width": "52px",
        "text-align": "right"
      }
    });
    var sl = ui.slider({
      min: o.min, max: o.max, step: o.step, value: o.value,
      onInput: function (v) {
        read.textContent = o.format ? o.format(v) : String(v);
        if (o.onInput) o.onInput(v);
      }
    });
    var row = h("div", {
      style: { display: "flex", "align-items": "center", gap: "12px", padding: "7px 0" }
    }, [
      h("span", {
        text: o.label,
        style: { "font-size": "12.5px", "min-width": "104px", flex: "none" }
      }),
      h("div", { style: { flex: "1" } }, [sl]),
      read
    ]);
    row.dsSet = function (v) {
      sl.value = v;
      sl.dsPaint();
      read.textContent = o.format ? o.format(v) : String(v);
    };
    return row;
  };

  /** Row with a label, optional hint, and a control on the right. */
  ui.row = function (label, hint, control) {
    return h("div", {
      style: {
        display: "flex", "align-items": "center", gap: "12px", padding: "9px 0"
      }
    }, [
      h("div", { style: { flex: "1", "min-width": "0" } }, [
        h("div", { text: label, style: { "font-size": "12.5px" } }),
        hint ? h("div", {
          text: hint,
          style: { "font-size": "11px", color: "var(--text-3)", "margin-top": "2px", "line-height": "1.4" }
        }) : null
      ]),
      control
    ]);
  };

  /** Segmented control. */
  ui.segmented = function (options, value, onChange) {
    var seg = h("div.g-seg");
    options.forEach(function (o) {
      var b = h("button" + (o.value === value ? ".on" : ""), {
        text: o.label,
        onclick: function () {
          DS.qsa("button", seg).forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          onChange(o.value);
        }
      });
      seg.appendChild(b);
    });
    return seg;
  };

  /** Section heading used inside app panes. */
  ui.section = function (title) {
    return h("div", {
      text: title,
      style: {
        "font-size": "10px", "font-weight": "650", "letter-spacing": ".1em",
        "text-transform": "uppercase", color: "var(--text-3)",
        margin: "18px 0 6px"
      }
    });
  };

  DS.ui = ui;
})(window.DS);
