/* ═══════════════════════════════════════════════════════════════
   mines.js — Mines

   Two rules here are not the naive ones, and both matter:

   1. The mines are laid *after* the first click, around it, so the
      opening move can never lose. A first-click death is not a game,
      it is a coin toss.
   2. Revealing a zero floods outward iteratively rather than by
      recursion, because a 18x14 board can flood nearly 250 cells deep
      and a recursive version is one stack frame per cell.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var LEVELS = {
    small:  { cols: 9,  rows: 9,  mines: 10, label: "Small" },
    medium: { cols: 14, rows: 12, mines: 28, label: "Medium" },
    large:  { cols: 20, rows: 14, mines: 58, label: "Large" }
  };

  function glyphSwatch(ch, hue) {
    return '<svg viewBox="0 0 20 20"><text x="10" y="14.5" text-anchor="middle" ' +
      'font-size="12" fill="hsl(' + hue + ' 90% 68%)">' + ch + '</text></svg>';
  }

  function mmss(s) {
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  DS.games.register({
    id: "mines",
    name: "Mines",
    tag: "Logic",
    blurb: "Clear the field. The first click is always safe.",
    keys: "Click to clear · right-click (or hold) to flag · click a number to chord",
    scoreLabel: "Time",
    low: true,
    format: mmss,

    counters: [
      { key: "revealed", label: "Cells cleared" },
      { key: "wins",     label: "Fields cleared" },
      { key: "flags",    label: "Flags planted" },
      { key: "booms",    label: "Mines stepped on" },
      { key: "runs",     label: "Runs" }
    ],

    skins: [
      {
        key: "marker", label: "Flag",
        items: [
          { id: "star",  label: "Star",    glyph: "✦", hue: 282,
            swatch: glyphSwatch("✦", 282) },
          { id: "flag",  label: "Pennant", glyph: "⚑", hue: 358,
            swatch: glyphSwatch("⚑", 358), note: "Clear one field",
            need: { key: "wins", at: 1 } },
          { id: "gem",   label: "Gem",     glyph: "◆", hue: 190,
            swatch: glyphSwatch("◆", 190), note: "Plant 60 flags in all",
            need: { key: "flags", at: 60 } },
          { id: "bolt",  label: "Spark",   glyph: "✹", hue: 45,
            swatch: glyphSwatch("✹", 45), note: "Clear five fields",
            need: { key: "wins", at: 5 } }
        ]
      },
      {
        key: "mine", label: "Mine",
        items: [
          { id: "bug",   label: "Beetle",  icon: "bug",
            swatch: DS.icon("bug", 15) },
          { id: "burst", label: "Burst",   glyph: "✴", hue: 358,
            swatch: glyphSwatch("✴", 358), note: "Step on twenty mines",
            need: { key: "booms", at: 20 } },
          { id: "core",  label: "Core",    glyph: "◉", hue: 22,
            swatch: glyphSwatch("◉", 22), note: "Clear 800 cells in all",
            need: { key: "revealed", at: 800 } }
        ]
      }
    ],

    awards: [
      { id: "mines-first",  name: "Swept",        hint: "Clear a field of any size.",
        icon: "check",  tier: "bronze", key: "wins", at: 1 },
      { id: "mines-five",   name: "Steady Hand",  hint: "Clear five fields.",
        icon: "layers", tier: "silver", key: "wins", at: 5 },
      { id: "mines-fast",   name: "Under a Minute", hint: "Clear a field in 60 seconds or less.",
        icon: "clock",  tier: "gold",   key: "best", at: 60, cmp: "lte" },
      { id: "mines-flags",  name: "Cartographer", hint: "Plant a hundred flags.",
        icon: "star",   tier: "bronze", key: "flags", at: 100 },
      { id: "mines-cells",  name: "Excavator",    hint: "Clear a thousand cells in all.",
        icon: "grid",   tier: "silver", key: "revealed", at: 1000 }
    ],

    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="3">' +
      '<rect x="16" y="10" width="20" height="18" rx="4" opacity=".4"/>' +
      '<rect x="40" y="10" width="20" height="18" rx="4" opacity=".4"/>' +
      '<rect x="16" y="32" width="20" height="18" rx="4" opacity=".4"/>' +
      '<circle cx="70" cy="38" r="9"/>' +
      '<path d="M70 24v5M70 47v5M56 38h5M79 38h5M61 29l4 4M75 43l4 4" stroke-linecap="round"/>' +
      '</svg>',

    play: function (stage, g) {
      var levelId = DS.store.get("games.minesLevel", "medium");
      if (!LEVELS[levelId]) levelId = "medium";
      var L = LEVELS[levelId];

      var cells = [];        // { mine, near, open, flag, el }
      var started = false;
      var over = false;
      var opened = 0;
      var flags = 0;
      var secs = 0;
      var ticker = null;

      var flagEl = h("span.gm-mcount");
      var head = h("div.gm-mhead", {}, [
        DS.ui.segmented(
          Object.keys(LEVELS).map(function (k) {
            return { label: LEVELS[k].label, value: k };
          }),
          levelId,
          function (v) {
            DS.store.set("games.minesLevel", v);
            g.restart();
          }
        ),
        h("div.gm-mflags", {}, [
          h("span", { html: DS.icon("star", 13) }), flagEl
        ])
      ]);

      var board = h("div.gm-mines");
      board.style.setProperty("--cols", L.cols);
      board.style.setProperty("--rows", L.rows);

      /* The board sits in its own sized box rather than stretching to
         fill the stage: a flex `flex: 1` beats `aspect-ratio`, and a
         14x12 field rendered 14x30 is not Minesweeper. */
      stage.appendChild(h("div.gm-mwrap", {}, [
        head, h("div.gm-mfield", {}, [board])
      ]));

      function idx(x, y) { return y * L.cols + x; }

      function around(i, fn) {
        var x = i % L.cols, y = (i / L.cols) | 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= L.cols || ny >= L.rows) continue;
            fn(idx(nx, ny));
          }
        }
      }

      function build() {
        DS.clear(board);
        cells = [];
        for (var i = 0; i < L.cols * L.rows; i++) {
          var el = h("button.gm-cell", { data: { i: i } });
          cells.push({ mine: false, near: 0, open: false, flag: false, el: el });
          board.appendChild(el);
        }
        paintFlags();
      }

      /* Lay the mines anywhere except the first click and its
         neighbours, which guarantees the opening move floods. */
      function lay(safe) {
        var banned = {};
        banned[safe] = true;
        around(safe, function (n) { banned[n] = true; });

        var pool = [];
        for (var i = 0; i < cells.length; i++) if (!banned[i]) pool.push(i);
        for (var j = pool.length - 1; j > 0; j--) {
          var k = (Math.random() * (j + 1)) | 0;
          var t = pool[j]; pool[j] = pool[k]; pool[k] = t;
        }
        pool.slice(0, Math.min(L.mines, pool.length)).forEach(function (i) {
          cells[i].mine = true;
        });
        cells.forEach(function (c, i) {
          if (c.mine) return;
          var n = 0;
          around(i, function (j) { if (cells[j].mine) n++; });
          c.near = n;
        });
      }

      function paintFlags() {
        flagEl.textContent = (L.mines - flags) + "";
      }

      function paint(i) {
        var c = cells[i];
        var el = c.el;
        var mk = g.skin("marker");
        el.className = "gm-cell" + (c.open ? " open" : "") + (c.flag ? " flag" : "");
        el.style.removeProperty("--hue");
        if (c.open && !c.mine && c.near) {
          el.textContent = String(c.near);
          el.dataset.n = c.near;
        } else if (c.flag) {
          el.textContent = mk.glyph;
          if (mk.hue !== undefined) el.style.setProperty("--hue", String(mk.hue));
          delete el.dataset.n;
        } else {
          el.textContent = "";
          delete el.dataset.n;
        }
      }

      function paintAll() { cells.forEach(function (c, j) { paint(j); }); }
      g.on(document, "gm-skin", paintAll);

      /* Iterative flood. `queue` holds cells whose neighbours still
         need visiting; a numbered cell is opened but not expanded. */
      function open(i) {
        if (over) return;
        var c = cells[i];
        if (c.open || c.flag) return;

        if (c.mine) return boom(i);

        var queue = [i];
        var n = 0;
        while (queue.length) {
          var j = queue.pop();
          var cell = cells[j];
          if (cell.open || cell.flag) continue;
          cell.open = true;
          opened++;
          n++;
          paint(j);
          if (cell.near === 0) {
            around(j, function (k) {
              if (!cells[k].open && !cells[k].flag) queue.push(k);
            });
          }
        }
        /* one write for the whole flood — a counter bump is a store
           write and an award sweep, and a big flood is 200 cells */
        if (n) g.stat("revealed", n);
        checkWin();
      }

      /* Click a satisfied number to open everything around it. The
         one convenience the classic game is unplayable without. */
      function chord(i) {
        var c = cells[i];
        if (!c.open || !c.near) return;
        var f = 0;
        around(i, function (n) { if (cells[n].flag) f++; });
        if (f !== c.near) return;
        around(i, function (n) { if (!cells[n].flag && !cells[n].open) open(n); });
      }

      function flag(i) {
        if (over) return;
        var c = cells[i];
        if (c.open) return;
        c.flag = !c.flag;
        if (c.flag) g.stat("flags");
        flags += c.flag ? 1 : -1;
        paintFlags();
        paint(i);
        DS.chime.tick();
      }

      function boom(i) {
        over = true;
        stop();
        g.stat("booms");
        var mn = g.skin("mine");
        cells.forEach(function (c, j) {
          if (c.mine) {
            c.el.classList.add("mine");
            if (mn.icon) c.el.innerHTML = DS.icon(mn.icon, 13);
            else {
              c.el.textContent = mn.glyph;
              c.el.style.setProperty("--hue", String(mn.hue));
            }
            if (j === i) c.el.classList.add("hit");
          } else if (c.flag) {
            c.el.classList.add("wrong");
          }
        });
        DS.chime.back();
        stage.classList.add("gm-shake");
        g.after(function () { stage.classList.remove("gm-shake"); }, 420);
        g.over({
          title: "Boom",
          body: "That one had a mine under it.",
          icon: "bug",
          record: false            // a best time has to be a win
        });
      }

      function checkWin() {
        if (opened < cells.length - L.mines) return;
        over = true;
        stop();
        cells.forEach(function (c) {
          if (c.mine && !c.flag) { c.flag = true; flags++; }
        });
        paintAll();
        paintFlags();
        g.over({
          title: "Field cleared",
          win: true,
          body: L.label + " · " + L.mines + " mines in " + mmss(secs) + ".",
          icon: "check"
        });
      }

      function start() {
        started = true;
        ticker = g.every(function () {
          secs++;
          g.score(secs);
        }, 1000);
      }
      function stop() { if (ticker) { clearInterval(ticker); ticker = null; } }

      /* One listener on the board, not one per cell: a large board is
         280 elements and 840 listeners is silly. */
      g.on(board, "pointerdown", function (e) {
        var el = e.target.closest(".gm-cell");
        if (!el || over) return;
        var i = +el.dataset.i;

        if (e.button === 2) return;         // handled by contextmenu

        /* hold to flag, for touch */
        var held = false;
        var timer = setTimeout(function () {
          held = true;
          flag(i);
          if (navigator.vibrate) navigator.vibrate(12);
        }, 480);

        function up() {
          clearTimeout(timer);
          document.removeEventListener("pointerup", up);
          document.removeEventListener("pointercancel", up);
          if (held || over) return;
          if (!started) { lay(i); start(); }
          if (cells[i].open) chord(i);
          else open(i);
        }
        document.addEventListener("pointerup", up);
        document.addEventListener("pointercancel", up);
      });

      g.on(board, "contextmenu", function (e) {
        var el = e.target.closest(".gm-cell");
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        flag(+el.dataset.i);
      });

      build();
      g.score(0);
      g.status(L.cols + "×" + L.rows + " · " + L.mines + " mines");
    }
  });
})(window.DS);
