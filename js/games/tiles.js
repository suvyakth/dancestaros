/* ═══════════════════════════════════════════════════════════════
   tiles.js — Fuse (2048)

   DOM rather than canvas, on purpose: these tiles want the real
   backdrop-filter, so the wallpaper bends through every one of them
   and a stack of sixteen panes looks like sixteen panes of glass.
   A tile is one element that lives for as long as its number does —
   it is moved by writing a transform, never re-created — so the
   browser's own transition does all the sliding.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var N = 4;
  var SLIDE = 130;    // ms, must match .gm-ftile's transition

  /* A palette is a starting hue and a step per doubling, so the whole
     ladder falls out of two numbers and a new one costs one line. */
  function swatch(base, step, sat) {
    var s = '<svg viewBox="0 0 20 20">';
    for (var i = 0; i < 4; i++) {
      s += '<rect x="' + (1 + (i % 2) * 9) + '" y="' + (1 + ((i / 2) | 0) * 9) +
           '" width="9" height="9" rx="2" fill="hsl(' + (base + i * step) + ' ' +
           (sat === undefined ? 88 : sat) + '% 62%)"/>';
    }
    return s + '</svg>';
  }

  DS.games.register({
    id: "tiles",
    name: "Fuse",
    tag: "Puzzle",
    blurb: "Slide, collide, double. Reach 2048.",
    keys: "Arrow keys or WASD to slide · swipe on a touch screen",

    counters: [
      { key: "merges",   label: "Tiles fused" },
      { key: "moves",    label: "Moves made" },
      { key: "bestTile", label: "Highest tile" },
      { key: "runs",     label: "Runs" }
    ],

    skins: [
      {
        key: "palette", label: "Palette",
        items: [
          { id: "spectrum", label: "Spectrum",  base: 196, step: -22,
            swatch: swatch(196, -22) },
          { id: "ember",    label: "Ember",     base: 44,  step: -9,
            swatch: swatch(44, -9), note: "Fuse a 64",
            need: { key: "bestTile", at: 64 } },
          { id: "verdant",  label: "Verdant",   base: 156, step: -13,
            swatch: swatch(156, -13), note: "Fuse 200 tiles in all",
            need: { key: "merges", at: 200 } },
          { id: "aurora",   label: "Aurora",    base: 272, step: 17,
            swatch: swatch(272, 17), note: "Fuse a 256",
            need: { key: "bestTile", at: 256 } },
          { id: "slate",    label: "Slate",     base: 210, step: 4, sat: 8,
            swatch: swatch(210, 4, 8), note: "Score 1500 in one run",
            need: { key: "best", at: 1500 } }
        ]
      }
    ],

    awards: [
      { id: "fuse-64",    name: "Sixty-Four",  hint: "Fuse two tiles into a 64.",
        icon: "layers", tier: "bronze", key: "bestTile", at: 64 },
      { id: "fuse-256",   name: "Two Fifty-Six", hint: "Fuse two tiles into a 256.",
        icon: "grid",   tier: "silver", key: "bestTile", at: 256 },
      { id: "fuse-2048",  name: "Fuse",        hint: "Reach 2048. The whole point.",
        icon: "star",   tier: "gold",   key: "bestTile", at: 2048 },
      { id: "fuse-moves", name: "Thousand Moves", hint: "Make a thousand moves in all.",
        icon: "shuffle", tier: "silver", key: "moves", at: 1000 },
      { id: "fuse-score", name: "Three Thousand", hint: "Score 3000 in a single run.",
        icon: "wave",   tier: "silver", key: "best", at: 3000 }
    ],

    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="3">' +
      '<rect x="14" y="10" width="20" height="18" rx="4" opacity=".45"/>' +
      '<rect x="38" y="10" width="20" height="18" rx="4" opacity=".7"/>' +
      '<rect x="62" y="10" width="20" height="18" rx="4"/>' +
      '<rect x="26" y="32" width="20" height="18" rx="4" opacity=".55"/>' +
      '<rect x="50" y="32" width="20" height="18" rx="4" opacity=".3"/>' +
      '</svg>',

    play: function (stage, g) {
      /* grid[r][c] holds { v, el } or null */
      var grid = [];
      var busy = false;
      var over = false;
      var reached = false;

      var board = h("div.gm-board");
      var wrap = h("div.gm-boardwrap", {}, [board]);
      stage.appendChild(wrap);

      /* the sunken wells the tiles sit in */
      for (var i = 0; i < N * N; i++) board.appendChild(h("div.gm-well"));
      var layer = h("div.gm-tiles");
      board.appendChild(layer);

      function place(el, r, c) {
        el.style.setProperty("--r", r);
        el.style.setProperty("--c", c);
      }

      /* Colour is computed, not written into a stylesheet, so a
         palette unlocked in the locker repaints the board live. */
      function tint(el, v) {
        var sk = g.skin("palette");
        var rung = Math.round(Math.log(v) / Math.LN2) - 1;   // 2 is rung 0
        el.style.setProperty("--th", String(sk.base + rung * sk.step));
        el.style.setProperty("--sa", (sk.sat === undefined ? 92 : sk.sat) + "%");
      }

      function makeTile(v, r, c, fresh) {
        var el = h("div.gm-ftile", { data: { v: v <= 2048 ? v : "big" } }, [
          h("span", { text: String(v) })
        ]);
        tint(el, v);
        place(el, r, c);
        if (fresh) el.classList.add("pop-in");
        layer.appendChild(el);
        return el;
      }

      function empties() {
        var out = [];
        for (var r = 0; r < N; r++) {
          for (var c = 0; c < N; c++) if (!grid[r][c]) out.push([r, c]);
        }
        return out;
      }

      function spawn() {
        var free = empties();
        if (!free.length) return null;
        var at = free[(Math.random() * free.length) | 0];
        var v = Math.random() < 0.9 ? 2 : 4;
        var t = { v: v, el: makeTile(v, at[0], at[1], true) };
        grid[at[0]][at[1]] = t;
        return t;
      }

      function reset() {
        DS.clear(layer);
        grid = [];
        for (var r = 0; r < N; r++) {
          grid[r] = [];
          for (var c = 0; c < N; c++) grid[r][c] = null;
        }
        over = false;
        reached = false;
        spawn();
        spawn();
        g.score(0);
        g.status("");
      }

      /* ── one move ──
         Read the four lines in the direction of travel, compact each,
         and record what has to happen. Nothing touches the DOM until
         the whole board has been decided, so a move is atomic. */
      function move(dir) {
        if (busy || over) return;

        var dr = dir === "up" ? -1 : dir === "down" ? 1 : 0;
        var dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;

        /* traverse away from the wall we are sliding into */
        var rows = [], cols = [];
        for (var i = 0; i < N; i++) { rows.push(i); cols.push(i); }
        if (dr > 0) rows.reverse();
        if (dc > 0) cols.reverse();

        var moved = false;
        var gained = 0;
        var merges = [];   // { survivor, absorbed, r, c, v }
        var mergedAt = {}; // "r,c" of tiles already fused this move

        rows.forEach(function (r) {
          cols.forEach(function (c) {
            var t = grid[r][c];
            if (!t) return;

            var nr = r, nc = c;
            while (true) {
              var tr = nr + dr, tc = nc + dc;
              if (tr < 0 || tc < 0 || tr >= N || tc >= N) break;
              var into = grid[tr][tc];
              if (!into) { nr = tr; nc = tc; continue; }
              if (into.v === t.v && !mergedAt[tr + "," + tc]) {
                grid[r][c] = null;
                grid[tr][tc] = into;
                mergedAt[tr + "," + tc] = true;
                merges.push({ survivor: into, absorbed: t, r: tr, c: tc, v: t.v * 2 });
                gained += t.v * 2;
                place(t.el, tr, tc);
                moved = true;
                nr = -1;              // consumed
              }
              break;
            }

            if (nr === -1) return;
            if (nr !== r || nc !== c) {
              grid[r][c] = null;
              grid[nr][nc] = t;
              place(t.el, nr, nc);
              moved = true;
            }
          });
        });

        if (!moved) {
          board.classList.add("nudge-" + dir);
          g.after(function () { board.classList.remove("nudge-" + dir); }, 200);
          return;
        }

        busy = true;
        g.stat("moves");
        if (gained) g.bump(gained);

        /* Let the transform transition run, then collapse the pairs.
           Doing it any earlier makes the absorbed tile vanish before
           it has arrived, which reads as a bug even though the score
           is right. */
        g.after(function () {
          merges.forEach(function (m) {
            if (m.absorbed.el.parentNode) m.absorbed.el.parentNode.removeChild(m.absorbed.el);
            m.survivor.v = m.v;
            m.survivor.el.dataset.v = m.v <= 2048 ? m.v : "big";
            m.survivor.el.firstChild.textContent = String(m.v);
            tint(m.survivor.el, m.v);
            g.stat("merges");
            g.peak("bestTile", m.v);
            m.survivor.el.classList.remove("pop");
            void m.survivor.el.offsetWidth;
            m.survivor.el.classList.add("pop");
          });

          if (merges.length) DS.chime.tick();
          spawn();
          busy = false;

          if (!reached && highest() >= 2048) {
            reached = true;
            g.status("2048 — keep going for a bigger number.");
            DS.chime.done();
          }
          if (stuck()) {
            over = true;
            g.over({
              title: "No moves left",
              body: "The board is full and nothing else fuses.",
              icon: "x"
            });
          }
        }, SLIDE);
      }

      function highest() {
        var m = 0;
        for (var r = 0; r < N; r++) {
          for (var c = 0; c < N; c++) if (grid[r][c] && grid[r][c].v > m) m = grid[r][c].v;
        }
        return m;
      }

      function stuck() {
        if (empties().length) return false;
        for (var r = 0; r < N; r++) {
          for (var c = 0; c < N; c++) {
            var v = grid[r][c].v;
            if (c + 1 < N && grid[r][c + 1].v === v) return false;
            if (r + 1 < N && grid[r + 1][c].v === v) return false;
          }
        }
        return true;
      }

      var KEYS = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right"
      };

      /* the locker is open behind nothing — repaint on a change */
      g.on(document, "gm-skin", function () {
        for (var r = 0; r < N; r++) {
          for (var c = 0; c < N; c++) if (grid[r][c]) tint(grid[r][c].el, grid[r][c].v);
        }
      });

      g.key(function (e) {
        var dir = KEYS[e.key];
        if (!dir) return;
        e.preventDefault();
        move(dir);
      });
      g.swipe(move);

      reset();
    }
  });
})(window.DS);
