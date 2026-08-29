/* ═══════════════════════════════════════════════════════════════
   widgets.js — desktop widgets

   Panes of glass that live on the desktop rather than in a window:
   no title bar, no chrome, draggable, positions persisted.

   They are views onto system state that already exists (the focus
   engine, the alarm daemon, the music player) rather than little
   apps of their own, so a widget and its full app never disagree.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var mounted = {};      // id -> { el, def, rec }
  var ticker = null;

  /* ── THE FLICKER FIX ────────────────────────────────────────────
     Widgets flickered once a second, worst on the ones showing live
     numbers. The cause was not the values changing - it was writing
     them when they had not.

     Every tick reassigned textContent whether or not the text
     differed. Each of those writes dirties the element, and because a
     widget sits behind a backdrop-filter, dirtying anything inside it
     makes the compositor re-sample the whole blurred backdrop. Once a
     second, forever, on every widget at once.

     So: never write text that already says what it should. The clock
     widget now touches the DOM twice a minute instead of sixty times. */
  function setText(el, value) {
    var v = String(value);
    if (el.textContent !== v) el.textContent = v;
  }

  /* ───────────────────── WIDGET TYPES ───────────────────── */
  var TYPES = {};

  /* ── clock ── */
  TYPES.clock = {
    label: "Clock",
    icon: "clock",
    desc: "Time, date, and the next alarm.",
    w: 208, h: 132,
    build: function (el) {
      el.appendChild(h("div.wg-time"));
      el.appendChild(h("div.wg-date"));
      el.appendChild(h("div.wg-sub"));
    },
    open: "clock",
    tick: function (el) {
      var d = new Date();
      setText(el.children[0], d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      setText(el.children[1], d.toLocaleDateString([], {
        weekday: "long", day: "numeric", month: "long"
      }));
      var next = DS.alarms.next();
      setText(el.children[2], next
        ? "Alarm " + DS.alarms.pad2(next.alarm.h) + ":" + DS.alarms.pad2(next.alarm.m) +
          " · " + DS.until(next.at - Date.now())
        : "No alarms set");
    }
  };

  /* ── calendar ── */
  TYPES.calendar = {
    label: "Calendar",
    icon: "grid",
    desc: "This month, today marked, and what is on.",
    open: "calendar",
    w: 232, h: 268,
    build: function (el) {
      el.appendChild(h("div.wg-cal-head"));
      el.appendChild(h("div.wg-cal"));
      el.appendChild(h("div.wg-evs"));
      el.addEventListener("dblclick", function () { DS.wm.open("calendar"); });
    },
    tick: function (el, rec, force) {
      var now = new Date();
      var key = now.getFullYear() + "-" + now.getMonth() + "-" + now.getDate();
      if (el._key === key && !force) return;
      el._key = key;

      setText(el.children[0], now.toLocaleDateString([], { month: "long", year: "numeric" }));
      var grid = el.children[1];
      DS.clear(grid);
      ["M", "T", "W", "T", "F", "S", "S"].forEach(function (d) {
        grid.appendChild(h("i.wg-dow", { text: d }));
      });
      var first = new Date(now.getFullYear(), now.getMonth(), 1);
      var lead = (first.getDay() + 6) % 7;               // Monday-first
      var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (var i = 0; i < lead; i++) grid.appendChild(h("i"));

      // mark any day that has something on it
      var evs = DS.store.get("calendar.events", []);
      var busy = {};
      evs.forEach(function (e) { busy[e.date] = true; });

      for (var d2 = 1; d2 <= days; d2++) {
        var dk = now.getFullYear() + "-" +
                 ("0" + (now.getMonth() + 1)).slice(-2) + "-" +
                 ("0" + d2).slice(-2);
        grid.appendChild(h("i" +
          (d2 === now.getDate() ? ".today" : "") +
          (busy[dk] && d2 !== now.getDate() ? ".busy" : ""), { text: d2 }));
      }

      /* today's agenda underneath */
      var todayKey = now.getFullYear() + "-" +
                     ("0" + (now.getMonth() + 1)).slice(-2) + "-" +
                     ("0" + now.getDate()).slice(-2);
      var mine = evs.filter(function (e) { return e.date === todayKey; })
        .sort(function (a, b) { return (a.start || "").localeCompare(b.start || ""); });
      var list = el.children[2];
      DS.clear(list);
      if (!mine.length) {
        list.appendChild(h("div.wg-sub", { text: "Nothing today", style: { margin: "0" } }));
      }
      mine.slice(0, 3).forEach(function (e) {
        list.appendChild(h("div.wg-ev", { style: { "--ec": e.color } }, [
          h("i"),
          h("b", { text: e.title }),
          h("u", { text: e.allDay ? "all day" : (e.start || "") })
        ]));
      });
    }
  };

  /* ── focus ── */
  TYPES.focus = {
    label: "Focus",
    icon: "star",
    desc: "Flowmodoro control, without opening the app.",
    open: "focus",
    w: 208, h: 158,
    build: function (el, api) {
      var ring = h("div.wg-ring", { html:
        '<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/>' +
        '<circle class="fg" cx="22" cy="22" r="19"/></svg>' });
      var time = h("div.wg-ftime", { text: "0:00" });
      var lab = h("div.wg-sub", { text: "Ready" });
      var go = h("button.g-btn.g-btn-sq", {
        html: DS.icon("play", 14),
        onclick: function () { DS.focus.toggle(); }
      });
      var brk = h("button.g-btn.g-btn-sq", {
        html: DS.icon("pause", 14), title: "Take the earned break",
        onclick: function () { DS.focus.skip(); }
      });
      el.appendChild(h("div.wg-frow", {}, [ring, h("div.wg-fcol", {}, [time, lab])]));
      el.appendChild(h("div.wg-fbtns", {}, [go, brk]));

      var fg = DS.qs(".fg", ring);
      var C = 2 * Math.PI * 19;
      fg.style.strokeDasharray = C;

      var lastIcon = null;
      api.unsub = DS.focus.on(function (s) {
        setText(time, s.display);
        setText(lab, s.label + (s.countingUp && s.phase === "focus"
          ? " · earns " + DS.hms(DS.focus.breakFor(s.elapsed)) : ""));
        fg.style.strokeDashoffset = C * (1 - s.progress);
        if (el.dataset.phase !== s.phase) el.dataset.phase = s.phase;
        var want = s.running ? "pause" : "play";
        if (want !== lastIcon) { lastIcon = want; go.innerHTML = DS.icon(want, 14); }
        brk.disabled = s.phase === "idle";
      });
    },
    destroy: function (el, api) { if (api.unsub) api.unsub(); }
  };

  /* ── sticky note ── */
  TYPES.sticky = {
    label: "Sticky note",
    icon: "notes",
    desc: "A scrap of glass you can write on.",
    open: "notes",
    w: 224, h: 176,
    build: function (el, api) {
      var ta = h("textarea.wg-sticky", {
        spellcheck: "false",
        placeholder: "Write something…",
        value: api.rec.data.text || ""
      });
      var t = null;
      ta.addEventListener("input", function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          api.rec.data.text = ta.value;
          api.save();
        }, 400);
      });
      el.appendChild(ta);
    }
  };

  /* ── system stats ── */
  TYPES.stats = {
    label: "System",
    icon: "cpu",
    desc: "Frame rate, windows, glass surfaces, storage.",
    open: "about",
    w: 208, h: 148,
    build: function (el, api) {
      ["Frame rate", "Windows", "Glass panes", "Stored"].forEach(function (k) {
        el.appendChild(h("div.wg-kv", {}, [h("span", { text: k }), h("b", { text: "—" })]));
      });
      api.frames = 0;
      api.last = performance.now();
      api.raf = requestAnimationFrame(function spin(t) {
        api.frames += 1;
        if (t - api.last >= 1000) {
          api.fps = Math.round(api.frames * 1000 / (t - api.last));
          api.frames = 0;
          api.last = t;
        }
        api.raf = requestAnimationFrame(spin);
      });
    },
    tick: function (el, rec, force, api) {
      var raw = "";
      try { raw = localStorage.getItem("dancestar.os.v1") || ""; } catch (e) {}
      var vals = [
        (api.fps || 0) + " fps",
        String(DS.wm.list().length),
        String(DS.qsa(".g, .g-btn, .dk, .di-glyph, .widget").length),
        DS.bytes(raw.length)
      ];
      DS.qsa(".wg-kv b", el).forEach(function (b, i) { setText(b, vals[i]); });
    },
    destroy: function (el, api) { if (api.raf) cancelAnimationFrame(api.raf); }
  };

  /* ── now playing ── */
  TYPES.nowplaying = {
    label: "Now playing",
    icon: "music",
    desc: "What Music is doing, and a play button.",
    open: "music",
    w: 224, h: 96,
    build: function (el) {
      el.appendChild(h("div.wg-np", {}, [
        h("div.wg-art"),
        h("div.wg-npc", {}, [h("b"), h("i")]),
        h("button.g-btn.g-btn-sq.wg-npb", {
          html: DS.icon("play", 14),
          onclick: function () {
            if (DS.nowPlaying && DS.nowPlaying.toggle) DS.nowPlaying.toggle();
            else DS.wm.open("music");
          }
        })
      ]));
    },
    tick: function (el) {
      var np = DS.nowPlaying;
      var art = DS.qs(".wg-art", el);
      var b = DS.qs(".wg-npc b", el);
      var i = DS.qs(".wg-npc i", el);
      var btn = DS.qs(".wg-npb", el);
      var wantIcon = np && np.playing ? "pause" : "play";
      if (btn._icon !== wantIcon) { btn._icon = wantIcon; btn.innerHTML = DS.icon(wantIcon, 14); }
      if (!np) {
        setText(b, "Music is closed");
        setText(i, "Click to open it");
        if (art._bg !== "none") { art._bg = "none"; art.style.background = "rgb(var(--edge-hi) / .12)"; }
        return;
      }
      setText(b, np.title);
      setText(i, np.artist);
      if (art._bg !== np.art) { art._bg = np.art; art.style.background = np.art; }
    }
  };

  /* ───────────────────── LAYER ───────────────────── */
  function layer() { return DS.qs("#widgets"); }

  function persist() {
    DS.store.set("widgets", DS.store.get("widgets", []));
  }

  function freeSpot(def) {
    var L = layer().getBoundingClientRect();
    var taken = DS.store.get("widgets", []);
    for (var col = 0; col < 6; col++) {
      for (var rowN = 0; rowN < 6; rowN++) {
        var x = 18 + col * (def.w + 16);
        var y = 18 + rowN * 150;
        if (x + def.w > L.width - 18 || y + def.h > L.height - 18) continue;
        var clash = taken.some(function (t) {
          return Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 40;
        });
        if (!clash) return { x: x, y: y };
      }
    }
    return { x: 24, y: 24 };
  }

  function mountOne(rec) {
    var def = TYPES[rec.type];
    if (!def) return;

    var bodyEl = h("div.wg-body");
    var el = h("div.widget.g", {
      data: { id: rec.id, type: rec.type },
      style: {
        left: rec.x + "px", top: rec.y + "px",
        width: def.w + "px", height: def.h + "px"
      }
    }, [bodyEl]);

    var api = {
      rec: rec,
      el: el,
      save: persist,
      remove: function () { widgets.remove(rec.id); }
    };

    if (!rec.data) rec.data = {};
    def.build(bodyEl, api);

    el.title = def.open ? "Click to open " + (DS.apps.get(def.open) || {}).name : "";
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      DS.ui.ctx(e.clientX, e.clientY, [
        { title: def.label },
        { label: "Bring to front", icon: "layers", action: function () {
            layer().appendChild(el);
          } },
        { sep: true },
        { label: "Remove widget", icon: "trash", action: api.remove }
      ]);
    });

    initDrag(el, rec, def);
    layer().appendChild(el);
    mounted[rec.id] = { el: el, body: bodyEl, def: def, rec: rec, api: api };
    DS.glass.dress(el);
    if (def.tick) def.tick(bodyEl, rec, true, api);
    return el;
  }

  function initDrag(el, rec, def) {
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest("button, input, textarea, a")) return;

      var L = layer().getBoundingClientRect();
      var sx = e.clientX, sy = e.clientY;
      var ox = rec.x, oy = rec.y;
      var moved = false;

      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      DS.glass.lite(true);

      function move(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        rec.x = DS.clamp(ox + dx, 6, Math.max(6, L.width - el.offsetWidth - 6));
        rec.y = DS.clamp(oy + dy, 6, Math.max(6, L.height - el.offsetHeight - 6));
        el.style.left = rec.x + "px";
        el.style.top = rec.y + "px";
      }
      function up(ev) {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.classList.remove("dragging");
        DS.glass.lite(false);
        if (moved) { persist(); return; }

        // A click that never became a drag opens the full app, so a
        // widget is a way into its window rather than a dead end.
        if (ev && ev.type === "pointerup" && def && def.open &&
            !ev.target.closest("button, input, textarea, a")) {
          DS.wm.open(def.open);
        }
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  var widgets = {
    TYPES: TYPES,

    init: function () {
      widgets.renderAll();
      if (!ticker) {
        ticker = setInterval(function () {
          Object.keys(mounted).forEach(function (id) {
            var m = mounted[id];
            if (m.def.tick) {
              try { m.def.tick(m.body, m.rec, false, m.api); } catch (e) {}
            }
          });
        }, 1000);
      }
    },

    renderAll: function () {
      var host = layer();
      if (!host) return;
      Object.keys(mounted).forEach(function (id) { widgets.unmount(id); });
      DS.clear(host);
      DS.store.get("widgets", []).forEach(mountOne);
    },

    unmount: function (id) {
      var m = mounted[id];
      if (!m) return;
      if (m.def.destroy) { try { m.def.destroy(m.body, m.api); } catch (e) {} }
      if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
      delete mounted[id];
    },

    add: function (type) {
      var def = TYPES[type];
      if (!def) return null;
      var spot = freeSpot(def);
      var rec = { id: DS.uid("wg"), type: type, x: spot.x, y: spot.y, data: {} };
      var list = DS.store.get("widgets", []);
      list.push(rec);
      DS.store.set("widgets", list);
      mountOne(rec);
      DS.ui.toast({ icon: def.icon, title: def.label + " added", body: "Drag it anywhere." });
      return rec;
    },

    remove: function (id) {
      widgets.unmount(id);
      DS.store.set("widgets", DS.store.get("widgets", []).filter(function (w) {
        return w.id !== id;
      }));
    },

    has: function (type) {
      return DS.store.get("widgets", []).some(function (w) { return w.type === type; });
    },

    count: function () { return DS.store.get("widgets", []).length; },

    clear: function () {
      Object.keys(mounted).forEach(function (id) { widgets.unmount(id); });
      DS.store.set("widgets", []);
    },

    /** Menu items for "Add widget", used by the desktop menu and launcher. */
    addMenu: function () {
      return Object.keys(TYPES).map(function (t) {
        return {
          label: TYPES[t].label,
          icon: TYPES[t].icon,
          action: function () { widgets.add(t); }
        };
      });
    }
  };

  DS.widgets = widgets;
})(window.DS);
