/* ═══════════════════════════════════════════════════════════════
   echo.js — Echo

   Simon, played on four panes of coloured glass. The tones are a
   pentatonic set rather than the original's four arbitrary pitches,
   so any sequence you are asked to repeat happens to be a tune —
   which turns out to be a real memory aid, and is the reason this
   version is easier than it should be.

   Nothing here draws: the panes are DOM, so they light up with the
   same glass the rest of the system is made of.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var COUNT = 4;

  function hueSwatch(hues) {
    var out = '<svg viewBox="0 0 20 20">';
    var at = [[1, 1], [10.5, 1], [1, 10.5], [10.5, 10.5]];
    hues.forEach(function (hh, i) {
      out += '<rect x="' + at[i][0] + '" y="' + at[i][1] + '" width="8.5" ' +
        'height="8.5" rx="2.5" fill="hsl(' + hh + ' 88% 62%)"/>';
    });
    return out + '</svg>';
  }
  function toneSwatch(seed) {
    var out = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round">';
    for (var i = 0; i < 4; i++) {
      var tall = 3 + ((i * seed) % 4) * 3.4;
      out += '<path d="M' + (3.5 + i * 4.4) + ' ' + (16 - tall) + 'v' + tall + '"/>';
    }
    return out + '</svg>';
  }

  DS.games.register({
    id: "echo",
    name: "Echo",
    tag: "Memory",
    blurb: "Repeat the sequence. It gets one longer every time.",
    keys: "Click the panes, or press 1 2 3 4",
    scoreLabel: "Length",

    counters: [
      { key: "notes", label: "Notes repeated" },
      { key: "runs",  label: "Runs" }
    ],

    skins: [
      {
        key: "tones", label: "Tuning",
        items: [
          /* D major pentatonic — every sequence comes out a tune */
          { id: "penta", label: "Pentatonic", freqs: [293.66, 369.99, 440.00, 587.33],
            swatch: toneSwatch(1) },
          { id: "bells", label: "Bells", freqs: [523.25, 659.26, 783.99, 1046.50],
            swatch: toneSwatch(2), note: "Reach a length of 6",
            need: { key: "best", at: 6 } },
          { id: "deep",  label: "Deep",  freqs: [146.83, 174.61, 220.00, 293.66],
            swatch: toneSwatch(3), note: "Repeat 120 notes in all",
            need: { key: "notes", at: 120 } },
          { id: "whole", label: "Whole", freqs: [261.63, 293.66, 329.63, 369.99],
            swatch: toneSwatch(5), note: "Reach a length of 11",
            need: { key: "best", at: 11 } }
        ]
      },
      {
        key: "hues", label: "Panes",
        items: [
          { id: "aurora", label: "Aurora", hues: [196, 282, 150, 26],
            swatch: hueSwatch([196, 282, 150, 26]) },
          { id: "citrus", label: "Citrus", hues: [46, 22, 88, 8],
            swatch: hueSwatch([46, 22, 88, 8]), note: "Reach a length of 8",
            need: { key: "best", at: 8 } },
          { id: "ocean",  label: "Ocean",  hues: [186, 210, 168, 250],
            swatch: hueSwatch([186, 210, 168, 250]), note: "Play 8 runs",
            need: { key: "runs", at: 8 } },
          { id: "bloom",  label: "Bloom",  hues: [320, 288, 348, 258],
            swatch: hueSwatch([320, 288, 348, 258]), note: "Repeat 200 notes in all",
            need: { key: "notes", at: 200 } }
        ]
      }
    ],

    awards: [
      { id: "echo-five",    name: "Five Long",  hint: "Repeat a sequence of five.",
        icon: "wave",   tier: "bronze", key: "best",  at: 5 },
      { id: "echo-ten",     name: "Ten Long",   hint: "Repeat a sequence of ten.",
        icon: "layers", tier: "silver", key: "best",  at: 10 },
      { id: "echo-fifteen", name: "Fifteen Long", hint: "Repeat a sequence of fifteen.",
        icon: "star",   tier: "gold",   key: "best",  at: 15 },
      { id: "echo-notes",   name: "Two Hundred Notes",
        hint: "Repeat two hundred notes in all.",
        icon: "music",  tier: "silver", key: "notes", at: 200 }
    ],

    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="3">' +
      '<path d="M46 8H26a8 8 0 0 0-8 8v12h28z" opacity=".8"/>' +
      '<path d="M50 8h20a8 8 0 0 1 8 8v12H50z" opacity=".4"/>' +
      '<path d="M46 32H18v12a8 8 0 0 0 8 8h20z" opacity=".4"/>' +
      '<path d="M50 32h28v12a8 8 0 0 1-8 8H50z" opacity=".8"/>' +
      '</svg>',

    play: function (stage, g) {
      var seq = [];
      var at = 0;              // how far through the sequence the player is
      var playing = false;     // the machine is showing you the sequence
      var over = false;
      var pads = [];

      var rig = h("div.gm-echo");
      for (var n = 0; n < COUNT; n++) {
        rig.appendChild(pads[n] = h("button.gm-pad", { data: { i: n } }));
      }
      function paintHues() {
        var hs = g.skin("hues").hues;
        pads.forEach(function (el, i) { el.style.setProperty("--hue", String(hs[i])); });
      }
      paintHues();
      g.on(document, "gm-skin", paintHues);
      var core = h("div.gm-echo-core", {}, [
        h("b.gm-echo-round", { text: "—" }),
        h("span", { text: "round" })
      ]);
      rig.appendChild(core);
      stage.appendChild(h("div.gm-echowrap", {}, [rig]));

      var roundEl = DS.qs(".gm-echo-round", core);

      function light(i, ms) {
        var el = pads[i];
        el.classList.add("lit");
        DS.chime.tone(g.skin("tones").freqs[i], (ms || 300) / 1000 + 0.2, 0.15);
        g.after(function () { el.classList.remove("lit"); }, ms || 300);
      }

      /* The gap shrinks as the sequence grows — the sequence itself
         getting longer is not enough to keep it hard. */
      function pace() {
        return Math.max(230, 620 - seq.length * 26);
      }

      function show() {
        playing = true;
        at = 0;
        g.status("Watch");
        rig.classList.add("busy");
        var step = pace();
        seq.forEach(function (n, k) {
          g.after(function () { light(n, step * 0.55); }, 420 + k * step);
        });
        g.after(function () {
          playing = false;
          rig.classList.remove("busy");
          g.status("Your turn");
        }, 420 + seq.length * step);
      }

      function nextRound() {
        seq.push((Math.random() * COUNT) | 0);
        g.score(seq.length);
        roundEl.textContent = String(seq.length);
        show();
      }

      function press(i) {
        if (playing || over) return;
        light(i, 240);

        if (seq[at] !== i) {
          over = true;
          g.status("");
          pads[i].classList.add("wrong");
          DS.chime.back();
          stage.classList.add("gm-shake");
          g.after(function () { stage.classList.remove("gm-shake"); }, 420);
          g.after(function () {
            g.over({
              title: "Broken chain",
              /* the score is the length actually repeated, not the
                 length shown — you never completed this one */
              score: seq.length - 1,
              body: "You held " + (seq.length - 1) + " in your head.",
              icon: "x"
            });
          }, 480);
          return;
        }

        at++;
        g.stat("notes");
        if (at === seq.length) {
          if (seq.length >= 24) {
            over = true;
            g.after(function () {
              g.over({ title: "Twenty-four", win: true, score: 24,
                       body: "That is further than anyone needs to go.",
                       icon: "star" });
            }, 500);
            return;
          }
          g.status("Good");
          g.after(nextRound, 620);
        }
      }

      g.on(rig, "pointerdown", function (e) {
        var el = e.target.closest(".gm-pad");
        if (!el) return;
        DS.chime.unlock();
        press(+el.dataset.i);
      });

      g.key(function (e) {
        var n = "1234".indexOf(e.key);
        if (n < 0) return;
        e.preventDefault();
        DS.chime.unlock();
        press(n);
      });

      g.score(0);
      /* Audio needs a gesture before it will make a sound, and opening
         the game was one — but only just, so ask for it politely. */
      var startBtn = h("button.g-btn.g-btn-lg.g-btn-accent.gm-echo-start", {
        html: DS.icon("play", 15) + "<span>Begin</span>",
        onclick: function () {
          DS.chime.unlock();
          if (startBtn.parentNode) startBtn.parentNode.removeChild(startBtn);
          nextRound();
        }
      });
      stage.appendChild(startBtn);
      g.status("Press Begin");
    }
  });
})(window.DS);
