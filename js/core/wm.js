/* ═══════════════════════════════════════════════════════════════
   wm.js — app registry + window manager

   Windows are glass all the way down, which creates a problem
   ordinary window managers do not have: with nothing opaque, a
   stack of windows turns to soup. The fix is in CSS
   (.win:not(.focused) drops its tint and kills its sheen) and here
   (strict z-order, and only ever one focused window).
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  /* ───────────────────── APP REGISTRY ───────────────────── */
  var registry = {};
  var order = [];

  DS.apps = {
    register: function (def) {
      registry[def.id] = def;
      order.push(def.id);
      return def;
    },
    get: function (id) { return registry[id]; },
    all: function () { return order.map(function (id) { return registry[id]; }); }
  };

  /* ───────────────────── WINDOW MANAGER ───────────────────── */
  var wins = [];
  var zTop = 100;
  var cascade = 0;
  var focused = null;

  var wm = {};

  function layer() { return DS.qs("#windows"); }
  function bounds() { return layer().getBoundingClientRect(); }

  function setGeom(win, x, y, w, hh) {
    var b = bounds();
    if (w !== null && w !== undefined) win.style.width = Math.max(win._minW, w) + "px";
    if (hh !== null && hh !== undefined) win.style.height = Math.max(win._minH, hh) + "px";
    var wv = parseFloat(win.style.width);
    var hv = parseFloat(win.style.height);
    if (x !== null && x !== undefined) {
      win.style.left = DS.clamp(x, 24 - wv, b.width - 60) + "px";
    }
    if (y !== null && y !== undefined) {
      win.style.top = DS.clamp(y, 0, Math.max(0, b.height - 42)) + "px";
    }
  }

  wm.focus = function (win) {
    if (focused === win && win.classList.contains("focused")) return;

    // "Minimise on focus loss": the window you leave gets out of the way.
    // Deliberately skipped while a dialog is up, and never applied to a
    // window that is already on its way out.
    var prev = focused;
    if (prev && prev !== win &&
        DS.store.get("autoMinimise") === "focus" &&
        !prev._minimized && !prev.classList.contains("closing") &&
        !DS.qs(".dlg-veil")) {
      wm.minimize(prev);
    }

    wins.forEach(function (w) { w.classList.remove("focused"); });
    win.classList.add("focused");
    zTop += 1;
    win.style.zIndex = zTop;
    focused = win;
    var label = DS.qs("#mb-appname");
    if (label) label.textContent = win._app.name;
    wm.syncDock();
  };

  wm.list = function () { return wins.slice(); };
  wm.focused = function () { return focused; };

  /* ── open ─────────────────────────────────────────────────── */
  wm.open = function (appId, arg) {
    var app = registry[appId];
    if (!app) { DS.ui.toast({ icon: "info", title: "No such app", body: appId }); return null; }

    // Single-instance apps just come forward.
    if (app.single !== false) {
      var existing = wins.filter(function (w) { return w._app.id === appId; })[0];
      if (existing) {
        if (existing._minimized) wm.unminimize(existing);
        wm.focus(existing);
        if (arg && app.onArg) app.onArg(existing._api, arg);
        return existing;
      }
    }

    var b = bounds();
    var w = Math.min(app.w || 720, Math.max(320, b.width - 60));
    var hh = Math.min(app.h || 480, Math.max(220, b.height - 80));

    var lights = h("div.win-lights", {}, [
      h("button.lt.lt-close", { title: "Close" }),
      h("button.lt.lt-min", { title: "Minimise" }),
      h("button.lt.lt-max", { title: "Maximise" })
    ]);
    var titleEl = h("div.win-title", {}, [
      h("span", { html: DS.icon(app.icon, 14), style: { display: "contents" } }),
      h("span", { text: app.name })
    ]);
    var tools = h("div.win-tools");
    var bar = h("header.win-bar", {}, [lights, titleEl, tools]);
    var body = h("div.win-body" + (app.flush ? ".flush" : app.pad === false ? "" : ".pad"));

    var win = h("section.win.g", { data: { app: appId } }, [bar, body]);
    ["n", "s", "w", "e", "nw", "ne", "sw", "se"].forEach(function (d) {
      win.appendChild(h("span.rz.rz-" + d, { data: { dir: d } }));
    });

    win._app = app;
    win._minW = app.minW || 320;
    win._minH = app.minH || 200;
    win._minimized = false;
    win._body = body;
    win._titleEl = titleEl.lastChild;
    win._tools = tools;

    // cascade so a fresh window never lands exactly on the last one
    var ox = (cascade % 6) * 28;
    var oy = (cascade % 6) * 24;
    cascade += 1;
    win.style.width = w + "px";
    win.style.height = hh + "px";
    win.style.left = Math.max(12, (b.width - w) / 2 + ox - 70) + "px";
    win.style.top = Math.max(10, (b.height - hh) / 2 + oy - 60) + "px";

    layer().appendChild(win);
    wins.push(win);

    /* ── the api handed to the app ── */
    var api = {
      win: win,
      body: body,
      app: app,
      arg: arg,
      close: function () { wm.close(win); },
      setTitle: function (t) { win._titleEl.textContent = t; },
      toolbar: function (node) { tools.appendChild(node); return node; },
      notify: function (o) { return DS.ui.toast(o); },
      focus: function () { wm.focus(win); }
    };
    win._api = api;

    lights.children[0].addEventListener("click", function (e) { e.stopPropagation(); wm.close(win); });
    lights.children[1].addEventListener("click", function (e) { e.stopPropagation(); wm.minimize(win); });
    lights.children[2].addEventListener("click", function (e) { e.stopPropagation(); wm.toggleMax(win); });

    win.addEventListener("pointerdown", function () { wm.focus(win); }, true);
    bar.addEventListener("dblclick", function (e) {
      if (e.target.closest(".lt") || e.target.closest(".win-tools")) return;
      wm.toggleMax(win);
    });

    initDrag(win, bar);
    initResize(win);

    wm.focus(win);
    DS.glass.dress(win);

    try {
      if (app.mount) app.mount(body, api);
    } catch (err) {
      console.error("[" + appId + "] mount failed", err);
      DS.clear(body);
      body.appendChild(h("div.empty-state", {}, [
        h("div", { html: DS.icon("info", 30) }),
        h("div", { text: app.name + " failed to start." }),
        h("div", { text: String(err && err.message || err), style: { "font-size": "11px" } })
      ]));
    }

    var recent = DS.store.get("lastOpened", []).filter(function (x) { return x !== appId; });
    recent.unshift(appId);
    DS.store.set("lastOpened", recent.slice(0, 8));

    wm.syncDock();
    return win;
  };

  /* ── close / minimise / maximise ──────────────────────────── */
  wm.close = function (win) {
    // per-window cleanup first, then the app-level hook
    if (win._api && typeof win._api.onClose === "function") {
      try { win._api.onClose(); } catch (e) { console.error(e); }
    }
    if (win._app.onClose) {
      try { win._app.onClose(win._api); } catch (e) { console.error(e); }
    }
    win.classList.add("closing");
    setTimeout(function () {
      if (win.parentNode) win.parentNode.removeChild(win);
      wins = wins.filter(function (w) { return w !== win; });
      if (focused === win) {
        focused = null;
        var next = wins.filter(function (w) { return !w._minimized; }).pop();
        if (next) wm.focus(next);
        else {
          var label = DS.qs("#mb-appname");
          if (label) label.textContent = "Finder";
        }
      }
      wm.syncDock();
    }, 200);
  };

  wm.minimize = function (win) {
    win.classList.add("minimizing");
    setTimeout(function () {
      win.hidden = true;
      win.classList.remove("minimizing");
      win._minimized = true;
      if (focused === win) {
        focused = null;
        var next = wins.filter(function (w) { return !w._minimized; }).pop();
        if (next) wm.focus(next);
      }
      wm.syncDock();
    }, 290);
  };

  wm.unminimize = function (win) {
    win.hidden = false;
    win._minimized = false;
    win.style.animation = "none";
    void win.offsetWidth;
    win.style.animation = "winOpen 300ms var(--ease-back)";
    wm.focus(win);
  };

  wm.toggleMax = function (win) {
    var b = bounds();
    if (win.classList.contains("maximized")) {
      var p = win._prev || { x: 60, y: 40, w: 720, h: 480 };
      win.classList.remove("maximized");
      setGeom(win, p.x, p.y, p.w, p.h);
    } else {
      win._prev = {
        x: parseFloat(win.style.left), y: parseFloat(win.style.top),
        w: parseFloat(win.style.width), h: parseFloat(win.style.height)
      };
      win.classList.add("maximized");
      win.style.left = "0px";
      win.style.top = "0px";
      win.style.width = b.width + "px";
      win.style.height = b.height + "px";
    }
    if (win._app.onResize) win._app.onResize(win._api);
  };

  /* ── dragging, with edge snapping ─────────────────────────── */
  var SNAP = 8;   // px from the edge that arms a snap

  function snapRegion(px, py, b) {
    if (py <= SNAP) return "max";
    if (px <= SNAP) return "left";
    if (px >= b.width - SNAP) return "right";
    if (py >= b.height - SNAP) return "bottom";
    return null;
  }

  function snapRect(region, b) {
    switch (region) {
      case "max":    return { x: 0, y: 0, w: b.width, h: b.height };
      case "left":   return { x: 0, y: 0, w: Math.round(b.width / 2), h: b.height };
      case "right":  return { x: Math.round(b.width / 2), y: 0, w: Math.round(b.width / 2), h: b.height };
      case "bottom": return { x: 0, y: Math.round(b.height / 2), w: b.width, h: Math.round(b.height / 2) };
      default: return null;
    }
  }

  function initDrag(win, bar) {
    bar.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".lt") || e.target.closest(".win-tools")) return;

      var b = bounds();
      var startX = e.clientX, startY = e.clientY;
      var wasMax = win.classList.contains("maximized");
      var ox = parseFloat(win.style.left);
      var oy = parseFloat(win.style.top);
      var ww = parseFloat(win.style.width);
      var region = null;
      var moved = false;
      var hint = DS.qs("#snap-hint");

      bar.setPointerCapture(e.pointerId);
      DS.glass.lite(true);

      function move(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;

        // Dragging a maximized window restores it under the cursor.
        if (!moved && wasMax) {
          var p = win._prev || { w: 720, h: 480 };
          win.classList.remove("maximized");
          ww = p.w;
          win.style.width = p.w + "px";
          win.style.height = p.h + "px";
          ox = ev.clientX - b.left - p.w / 2;
          oy = 0;
          startX = ev.clientX;
          startY = ev.clientY;
          dx = 0; dy = 0;
        }
        moved = true;

        setGeom(win, ox + dx, oy + dy, null, null);

        var px = ev.clientX - b.left;
        var py = ev.clientY - b.top;
        var r = snapRegion(px, py, b);
        if (r !== region) {
          region = r;
          var rect = snapRect(region, b);
          if (rect) {
            hint.hidden = false;
            hint.style.left = rect.x + "px";
            hint.style.top = (rect.y + b.top) + "px";
            hint.style.width = rect.w + "px";
            hint.style.height = rect.h + "px";
          } else {
            hint.hidden = true;
          }
        }
      }

      function up() {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
        hint.hidden = true;
        DS.glass.lite(false);

        if (region) {
          var rect = snapRect(region, b);
          if (region === "max") {
            if (!win.classList.contains("maximized")) {
              win._prev = {
                x: ox, y: oy, w: parseFloat(win.style.width), h: parseFloat(win.style.height)
              };
              win.classList.add("maximized");
              win.style.left = "0px"; win.style.top = "0px";
              win.style.width = b.width + "px"; win.style.height = b.height + "px";
            }
          } else {
            win._prev = {
              x: ox, y: oy, w: parseFloat(win.style.width), h: parseFloat(win.style.height)
            };
            win.style.transition = "left 180ms var(--ease), top 180ms var(--ease), " +
                                   "width 180ms var(--ease), height 180ms var(--ease)";
            setGeom(win, rect.x, rect.y, rect.w, rect.h);
            setTimeout(function () { win.style.transition = ""; }, 200);
          }
          if (win._app.onResize) win._app.onResize(win._api);
        }
      }

      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    });
  }

  /* ── resizing ─────────────────────────────────────────────── */
  function initResize(win) {
    DS.qsa(".rz", win).forEach(function (grip) {
      grip.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        var dir = grip.dataset.dir;
        var sx = e.clientX, sy = e.clientY;
        var ox = parseFloat(win.style.left), oy = parseFloat(win.style.top);
        var ow = parseFloat(win.style.width), oh = parseFloat(win.style.height);

        grip.setPointerCapture(e.pointerId);
        DS.glass.lite(true);

        function move(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          var x = ox, y = oy, w = ow, hh = oh;
          if (dir.indexOf("e") >= 0) w = ow + dx;
          if (dir.indexOf("s") >= 0) hh = oh + dy;
          if (dir.indexOf("w") >= 0) {
            w = Math.max(win._minW, ow - dx);
            x = ox + (ow - w);
          }
          if (dir.indexOf("n") >= 0) {
            hh = Math.max(win._minH, oh - dy);
            y = oy + (oh - hh);
          }
          setGeom(win, x, y, w, hh);
        }
        function up() {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          DS.glass.lite(false);
          if (win._app.onResize) win._app.onResize(win._api);
        }
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
      });
    });
  }

  /* ── dock running indicators ──────────────────────────────── */
  wm.syncDock = function () {
    var running = {};
    wins.forEach(function (w) { running[w._app.id] = true; });
    DS.qsa(".dk").forEach(function (d) {
      d.classList.toggle("running", !!running[d.dataset.app]);
    });
  };

  /** Minimise whatever is focused. Used by click-away on the desktop. */
  wm.minimiseFocused = function () {
    if (focused && !focused._minimized) wm.minimize(focused);
  };

  /** Cycle focus (Alt+Tab). */
  wm.cycle = function () {
    var live = wins.filter(function (w) { return !w._minimized; });
    if (live.length < 2) return;
    var idx = live.indexOf(focused);
    wm.focus(live[(idx + 1) % live.length]);
  };

  /** Keep windows on screen when the viewport shrinks. */
  window.addEventListener("resize", function () {
    var b = bounds();
    wins.forEach(function (w) {
      if (w.classList.contains("maximized")) {
        w.style.width = b.width + "px";
        w.style.height = b.height + "px";
        return;
      }
      var x = parseFloat(w.style.left), y = parseFloat(w.style.top);
      var ww = parseFloat(w.style.width), hh = parseFloat(w.style.height);
      setGeom(w, Math.min(x, b.width - 80), Math.min(y, b.height - 42),
              Math.min(ww, b.width - 16), Math.min(hh, b.height - 16));
    });
  });

  DS.wm = wm;
})(window.DS);
