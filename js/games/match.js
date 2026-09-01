/* ═══════════════════════════════════════════════════════════════
   match.js — Facets

   A memory game where the cards are panes of glass. Each pair gets
   its own hue, so a matched pair leaves two lit beads of the same
   colour on the board and the state of the game is readable at a
   glance without a single number.

   The flip is a real 3D rotation on a preserve-3d parent, which is
   the one place in this system where glass gets to show you its
   back.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var COLS = 6, ROWS = 4;                 // 24 cards, 12 pairs

  function faceSwatch(a, b) {
    return '<svg viewBox="0 0 20 20"><text x="6" y="14" text-anchor="middle" ' +
      'font-size="11" fill="hsl(196 90% 74%)">' + a + '</text>' +
      '<text x="14" y="14" text-anchor="middle" font-size="11" ' +
      'fill="hsl(300 90% 76%)">' + b + '</text></svg>';
  }

  DS.games.register({
    id: "match",
    name: "Facets",
    tag: "Memory",
    blurb: "Twelve pairs, face down. Fewest turns wins.",
    keys: "Click a pane to turn it over",
    scoreLabel: "Turns",
    low: true,

    counters: [
      { key: "pairs", label: "Pairs found" },
      { key: "wins",  label: "Boards cleared" },
      { key: "runs",  label: "Runs" }
    ],

    skins: [
      {
        key: "faces", label: "Faces",
        items: [
          { id: "marks", label: "Marks",
            glyphs: ["✦", "◈", "❖", "▲", "●", "♢",
                     "✷", "☾", "✺", "⬡", "✧", "◆"],
            swatch: faceSwatch("✦", "◈") },
          { id: "suits", label: "Suits",
            glyphs: ["♠", "♥", "♦", "♣", "♤", "♡",
                     "♧", "♨", "★", "☆", "✚", "✜"],
            swatch: faceSwatch("♠", "♥"), note: "Clear one board",
            need: { key: "wins", at: 1 } },
          { id: "sky", label: "Sky",
            glyphs: ["☀", "☾", "★", "☁", "❄", "☄",
                     "✵", "✶", "✹", "✻", "✽", "❂"],
            swatch: faceSwatch("☀", "❄"), note: "Find 80 pairs in all",
            need: { key: "pairs", at: 80 } },
          { id: "runes", label: "Runes",
            glyphs: ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ",
                     "ᚷ", "ᚹ", "ᚻ", "ᚾ", "ᛁ", "ᛃ"],
            swatch: faceSwatch("ᚠ", "ᚱ"), note: "Clear a board in 16 turns",
            need: { key: "best", at: 16, cmp: "lte" } }
        ]
      }
    ],

    awards: [
      { id: "facets-first", name: "Matched",     hint: "Clear the board once.",
        icon: "check",  tier: "bronze", key: "wins",  at: 1 },
      { id: "facets-ten",   name: "Ten Boards",  hint: "Clear the board ten times.",
        icon: "layers", tier: "silver", key: "wins",  at: 10 },
      { id: "facets-18",    name: "Sharp",       hint: "Clear a board in 18 turns or fewer.",
        icon: "eye",    tier: "silver", key: "best",  at: 18, cmp: "lte" },
      { id: "facets-15",    name: "Photographic", hint: "Clear a board in 15 turns or fewer.",
        icon: "star",   tier: "gold",   key: "best",  at: 15, cmp: "lte" },
      { id: "facets-pairs", name: "Hundred Pairs", hint: "Find a hundred pairs in all.",
        icon: "grid",   tier: "silver", key: "pairs", at: 100 }
    ],

    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="3">' +
      '<rect x="12" y="8" width="20" height="20" rx="5"/>' +
      '<rect x="38" y="8" width="20" height="20" rx="5" opacity=".35"/>' +
      '<rect x="64" y="8" width="20" height="20" rx="5" opacity=".35"/>' +
      '<rect x="12" y="34" width="20" height="20" rx="5" opacity=".35"/>' +
      '<rect x="38" y="34" width="20" height="20" rx="5"/>' +
      '<rect x="64" y="34" width="20" height="20" rx="5" opacity=".35"/>' +
      '<path d="M18 18l4 4 6-8M44 44l4 4 6-8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',

    play: function (stage, g) {
      var cards = [];
      var flipped = [];      // at most two face-up, unmatched
      var solved = 0;
      var turns = 0;
      var locked = false;

      var board = h("div.gm-match");
      board.style.setProperty("--cols", COLS);
      stage.appendChild(h("div.gm-matchwrap", {}, [board]));

      /* one hue per pair, spread evenly round the wheel */
      var GLYPHS = g.skin("faces").glyphs;
      var deck = [];
      for (var p = 0; p < (COLS * ROWS) / 2; p++) {
        var face = { glyph: GLYPHS[p % GLYPHS.length], hue: Math.round((p * 360) / 12), pair: p };
        deck.push(face, face);
      }
      for (var i = deck.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }

      deck.forEach(function (face, n) {
        var el = h("button.gm-card", { data: { n: n } }, [
          h("div.gm-face.gm-back", {}, [
            h("span.gm-mark", { html: DS.icon("layers", 18) })
          ]),
          h("div.gm-face.gm-front", {
            style: { "--hue": String(face.hue) }
          }, [h("span", { text: face.glyph })])
        ]);
        board.appendChild(el);
        cards.push({ face: face, el: el, up: false, done: false });
      });

      function turn(n) {
        var c = cards[n];
        if (locked || c.up || c.done) return;

        c.up = true;
        c.el.classList.add("up");
        DS.chime.tick();
        flipped.push(n);

        if (flipped.length < 2) return;

        turns++;
        g.score(turns);
        var a = cards[flipped[0]], b = cards[flipped[1]];
        flipped = [];

        if (a.face.pair === b.face.pair) {
          a.done = b.done = true;
          solved++;
          g.stat("pairs");
          g.after(function () {
            a.el.classList.add("done");
            b.el.classList.add("done");
          }, 180);
          if (solved === cards.length / 2) {
            locked = true;
            g.after(function () {
              g.over({
                title: "All twelve",
                win: true,
                body: "Cleared in " + turns + " turns.",
                icon: "check",
                score: turns
              });
            }, 600);
          }
          return;
        }

        /* A wrong pair stays up long enough to be memorised — that is
           the whole game — but not so long that it feels like a wait. */
        locked = true;
        g.after(function () {
          a.up = b.up = false;
          a.el.classList.remove("up");
          b.el.classList.remove("up");
          locked = false;
        }, 760);
      }

      g.on(document, "gm-skin", function () {
        var set = g.skin("faces").glyphs;
        cards.forEach(function (c) {
          c.face.glyph = set[c.face.pair % set.length];
          c.el.querySelector(".gm-front span").textContent = c.face.glyph;
        });
      });

      g.on(board, "click", function (e) {
        var el = e.target.closest(".gm-card");
        if (el) turn(+el.dataset.n);
      });

      g.score(0);
      g.status("12 pairs");
    }
  });
})(window.DS);
