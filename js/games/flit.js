/* ═══════════════════════════════════════════════════════════════
   flit.js — Flit

   Flappy Bird, except the obstacles are panes of glass and the bird
   is a bead of light with a wing. Two things make it read as glass
   rather than as pipes:

   the panes are lit on the rim and carry a vertical highlight, so
   the gap between them is legible as a gap in a *surface*; and the
   bead leaves a short trail of its own colour, which is the only
   thing on screen that behaves like light rather than like an
   object.

   The world is 100 units tall and between 90 and 150 wide, and it is
   letterboxed into whatever shape the window is. Both halves of that
   matter: following the window's aspect exactly would hand a wide
   monitor a field three panes deep and a phone a field one pane deep,
   which is two different games; pinning it to one width would leave a
   phone squinting at a strip.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var H = 100;              // world height
  var W_MIN = 90, W_MAX = 150;   // and the range it is allowed to be wide
  var GRAVITY = 178;
  var FLAP = -62;
  var SPEED = 34;           // units per second the world moves left
  var R = 2.4;              // the bead
  var PANE_W = 11;
  var GAP0 = 30;            // opening at score 0
  var GAP_MIN = 20;
  var FLOOR = 6;            // the glass shelf along the bottom

  function beadSwatch(fill) {
    return '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="' + fill +
      '"/><circle cx="7.6" cy="7.6" r="2" fill="#fff" opacity=".55"/></svg>';
  }
  function paneSwatch(hue) {
    return '<svg viewBox="0 0 20 20">' +
      '<rect x="3.5" y="1" width="5" height="7" rx="1.6" fill="hsl(' + hue + ' 88% 62%)"/>' +
      '<rect x="3.5" y="12" width="5" height="7" rx="1.6" fill="hsl(' + hue + ' 88% 62%)"/>' +
      '<rect x="11.5" y="1" width="5" height="10" rx="1.6" fill="hsl(' +
        (hue + 40) + ' 88% 62%)" opacity=".8"/>' +
      '<rect x="11.5" y="15" width="5" height="4" rx="1.6" fill="hsl(' +
        (hue + 40) + ' 88% 62%)" opacity=".8"/></svg>';
  }

  DS.games.register({
    id: "flit",
    name: "Flit",
    tag: "Arcade",
    blurb: "Flap a bead of light through the panes.",
    keys: "Space, click or tap to flap",
    scoreLabel: "Gates",

    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="3">' +
      '<rect x="16" y="4" width="13" height="17" rx="3.5" opacity=".55"/>' +
      '<rect x="16" y="37" width="13" height="19" rx="3.5" opacity=".55"/>' +
      '<rect x="64" y="4" width="13" height="24" rx="3.5" opacity=".8"/>' +
      '<rect x="64" y="44" width="13" height="12" rx="3.5" opacity=".8"/>' +
      '<circle cx="46" cy="27" r="6" fill="currentColor" stroke="none"/>' +
      '<path d="M38 33c-3 2-6 2.6-8 2.4" stroke-linecap="round" opacity=".7"/>' +
      '</svg>',

    counters: [
      { key: "gates",  label: "Gates passed" },
      { key: "flaps",  label: "Flaps" },
      { key: "runs",   label: "Runs" },
      { key: "clips",  label: "Panes clipped" }
    ],

    skins: [
      {
        key: "bead", label: "Bead",
        items: [
          { id: "wisp",    label: "Wisp",    hue: null,
            swatch: beadSwatch("#e0f2fe") },
          { id: "ember",   label: "Ember",   hue: 26,
            swatch: beadSwatch("#fb923c"), note: "Pass 40 gates in all",
            need: { key: "gates", at: 40 } },
          { id: "verdant", label: "Verdant", hue: 148,
            swatch: beadSwatch("#34d399"), note: "Pass 12 gates in one run",
            need: { key: "best", at: 12 } },
          { id: "violet",  label: "Violet",  hue: 282,
            swatch: beadSwatch("#c084fc"), note: "Pass 150 gates in all",
            need: { key: "gates", at: 150 } },
          { id: "gold",    label: "Gold",    hue: 44,
            swatch: beadSwatch("#fcd34d"), note: "Pass 25 gates in one run",
            need: { key: "best", at: 25 } }
        ]
      },
      {
        key: "panes", label: "Panes",
        items: [
          { id: "aqua",   label: "Aqua",   hue: 196, spread: 26,
            swatch: paneSwatch(196) },
          { id: "sunset", label: "Sunset", hue: 32,  spread: -18,
            swatch: paneSwatch(32), note: "Pass 8 gates in one run",
            need: { key: "best", at: 8 } },
          { id: "orchid", label: "Orchid", hue: 296, spread: 22,
            swatch: paneSwatch(296), note: "Clip a pane 15 times",
            need: { key: "clips", at: 15 } },
          { id: "ice",    label: "Ice",    hue: 210, spread: 8,
            swatch: paneSwatch(210), note: "Flap 500 times in all",
            need: { key: "flaps", at: 500 } }
        ]
      }
    ],

    awards: [
      { id: "flit-first",  name: "Airborne",   hint: "Pass your first gate.",
        icon: "wave",   tier: "bronze", key: "gates", at: 1 },
      { id: "flit-ten",    name: "Ten Gates",  hint: "Pass ten gates in a single run.",
        icon: "layers", tier: "bronze", key: "best",  at: 10 },
      { id: "flit-twenty", name: "Twenty Gates", hint: "Pass twenty gates in a single run.",
        icon: "grid",   tier: "silver", key: "best",  at: 20 },
      { id: "flit-forty",  name: "Forty Gates", hint: "Pass forty gates in a single run.",
        icon: "star",   tier: "gold",   key: "best",  at: 40 },
      { id: "flit-flaps",  name: "Thousand Flaps", hint: "Flap a thousand times in all.",
        icon: "shuffle", tier: "silver", key: "flaps", at: 1000 }
    ],

    play: function (stage, g) {
      var cv = g.canvas();
      var ctx = cv.ctx;

      var W = 140;             // recomputed from the canvas each frame
      var ox = 0, oy = 0;      // letterbox offset
      var birdX = 0;
      var nextX = 0;           // where the next pane will enter
      var y = H / 2;
      var vy = 0;
      var tilt = 0;
      var wing = 0;            // 1 at the moment of a flap, decays
      var panes = [];          // { x, gapY, gap, passed }
      var trail = [];
      var started = false;     // waiting for the first flap
      var over = false;

      reset();

      function reset() {
        y = H / 2;
        vy = 0;
        tilt = 0;
        panes = [];
        trail = [];
        nextX = 0;
        started = false;
        g.status("Flap to start");
      }

      function gapFor(score) {
        return Math.max(GAP_MIN, GAP0 - score * 0.55);
      }

      /* The first pane is placed a comfortable distance ahead and every
         later one relative to the last, so a wide window does not deal
         you a wall the instant you start. */
      function spawn() {
        var gap = gapFor(g.value());
        var margin = 10;
        var lo = margin + gap / 2;
        var hi = H - FLOOR - margin - gap / 2;
        var gapY = lo + Math.random() * Math.max(0, hi - lo);
        /* The opening gate of a run is always dead centre. Being dealt
           a corner gap before you have felt the weight of the thing is
           not difficulty, it is a coin toss. */
        if (!panes.length && !g.value()) gapY = (H - FLOOR) / 2;
        panes.push({ x: nextX, gapY: gapY, gap: gap, passed: false });
        nextX += 44 + Math.random() * 12;
      }

      function flap() {
        if (over) return;
        if (!started) {
          started = true;
          nextX = W + 14;
          g.status("");
        }
        vy = FLAP;
        wing = 1;
        g.stat("flaps");
        DS.chime.tick();
      }

      function die(why) {
        over = true;
        g.status("");
        DS.chime.back();
        stage.classList.add("gm-shake");
        g.after(function () { stage.classList.remove("gm-shake"); }, 420);
        g.over({ title: "Down", body: why, icon: "x" });
      }

      g.key(function (e) {
        if (e.key === " " || e.key === "Spacebar" || e.key === "ArrowUp" ||
            e.key === "w" || e.key === "W") {
          e.preventDefault();
          flap();
        }
      });
      g.on(cv.el, "pointerdown", function (e) { e.preventDefault(); flap(); });
      g.swipe(function () { flap(); });

      /* ── one step ── */
      function tick(dt) {
        if (over) return;

        wing = Math.max(0, wing - dt * 5);

        if (!started) {
          /* it bobs on the spot until you commit */
          y = H / 2 + Math.sin(performance.now() / 380) * 3.2;
          tilt = 0;
          return;
        }

        vy += GRAVITY * dt;
        y += vy * dt;
        tilt = DS.clamp(vy / 150, -0.55, 1.15);

        /* The trail is laid down in world space and then scrolls with
           everything else. Pinning each point to the bird's x — which
           never moves — stood it up as a vertical spike instead of
           leaving it behind. */
        trail.push({ x: birdX, y: y, life: 1 });
        if (trail.length > 30) trail.shift();

        var move = SPEED * dt;
        for (var t = 0; t < trail.length; t++) {
          trail[t].x -= move;
          trail[t].life -= dt * 1.9;
        }
        trail = trail.filter(function (q) { return q.life > 0; });

        for (var i = 0; i < panes.length; i++) panes[i].x -= move;
        nextX -= move;

        /* keep the level laid out a little beyond the right edge */
        while (nextX < W + 24) spawn();
        panes = panes.filter(function (p) { return p.x + PANE_W > -6; });

        if (y - R < 0) { y = R; vy = 0; }
        if (y + R > H - FLOOR) return die("Into the floor.");

        for (var j = 0; j < panes.length; j++) {
          var p = panes[j];
          if (!p.passed && p.x + PANE_W < birdX - R) {
            p.passed = true;
            g.bump(1);
            g.stat("gates");
            DS.chime.tone(660 + Math.min(g.value(), 12) * 24, 0.16, 0.09);
          }
          /* a circle against two rectangles: horizontal overlap first,
             then the two vertical bands */
          if (birdX + R < p.x || birdX - R > p.x + PANE_W) continue;
          if (y - R < p.gapY - p.gap / 2 || y + R > p.gapY + p.gap / 2) {
            g.stat("clips");
            return die("Clipped a pane.");
          }
        }
      }

      /* ── drawing ── */
      function beadColour(pal, sk, a) {
        return sk.hue === null || sk.hue === undefined
          ? pal.hi(a) : pal.hue(sk.hue, a, 92, 72);
      }

      function draw() {
        if (!cv.w) return;
        var pal = g.palette();
        var skB = g.skin("bead");
        var skP = g.skin("panes");

        /* pick a width that suits the window, then letterbox it */
        W = DS.clamp(H * cv.w / cv.h, W_MIN, W_MAX);
        var sc = Math.min(cv.w / W, cv.h / H);
        ox = (cv.w - W * sc) / 2;
        oy = (cv.h - H * sc) / 2;
        birdX = W * 0.28;

        ctx.clearRect(0, 0, cv.w, cv.h);
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(sc, sc);

        /* the well */
        ctx.fillStyle = pal.lo(0.2);
        rr(0, 0, W, H, 2.6);
        ctx.fill();
        ctx.save();
        rr(0, 0, W, H, 2.6);
        ctx.clip();

        /* a couple of soft lights behind the glass, drifting slower
           than the panes — the only depth cue in the scene */
        var now = performance.now() / 1000;
        [[0.22, 26, 200], [0.13, 62, 300]].forEach(function (o, k) {
          var gx = ((now * SPEED * o[0] * -1) % (W + 80) + W + 80) % (W + 80);
          var grad = ctx.createRadialGradient(W - gx, o[1], 0, W - gx, o[1], 34);
          grad.addColorStop(0, pal.hue(o[2], 0.16));
          grad.addColorStop(1, pal.hue(o[2], 0));
          ctx.fillStyle = grad;
          ctx.fillRect(W - gx - 34, o[1] - 34, 68, 68);
        });

        /* the panes */
        panes.forEach(function (p) {
          drawPane(pal, skP, p.x, 0, p.gapY - p.gap / 2, false);
          drawPane(pal, skP, p.x, p.gapY + p.gap / 2, H - FLOOR - (p.gapY + p.gap / 2), true);
        });

        /* the floor: one long lit shelf */
        var fg = ctx.createLinearGradient(0, H - FLOOR, 0, H);
        fg.addColorStop(0, pal.hi(0.16));
        fg.addColorStop(1, pal.hi(0.04));
        ctx.fillStyle = fg;
        ctx.fillRect(0, H - FLOOR, W, FLOOR);
        ctx.strokeStyle = pal.hi(0.3);
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.moveTo(0, H - FLOOR + 0.2);
        ctx.lineTo(W, H - FLOOR + 0.2);
        ctx.stroke();

        /* the trail */
        trail.forEach(function (t) {
          ctx.globalAlpha = t.life * 0.4;
          ctx.fillStyle = beadColour(pal, skB, 1);
          ctx.beginPath();
          ctx.arc(t.x, t.y, R * 0.7 * t.life, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;

        /* the bead, and its wing */
        ctx.save();
        ctx.translate(birdX, y);
        ctx.rotate(tilt * 0.5);

        ctx.fillStyle = beadColour(pal, skB, 0.5);
        ctx.beginPath();
        ctx.ellipse(-R * 0.72, R * 0.2, R * (0.62 + wing * 0.3),
                    R * (0.3 - wing * 0.1), -0.35 + wing * 1.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = beadColour(pal, skB, 0.95);
        ctx.shadowBlur = 12;
        ctx.fillStyle = beadColour(pal, skB, 0.98);
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = pal.hi(0.85);
        ctx.beginPath();
        ctx.arc(-R * 0.3, -R * 0.34, R * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = pal.lo(0.7);
        ctx.beginPath();
        ctx.arc(R * 0.38, -R * 0.28, R * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
        ctx.restore();
      }

      function drawPane(pal, sk, x, top, hgt, lower) {
        if (hgt <= 0.4) return;
        var hue = sk.hue + (lower ? sk.spread : 0);
        var grad = ctx.createLinearGradient(x, 0, x + PANE_W, 0);
        grad.addColorStop(0, pal.hue(hue, 0.5, 90, 54));
        grad.addColorStop(0.3, pal.hue(hue, 0.74, 90, 64));
        grad.addColorStop(1, pal.hue(hue, 0.46, 90, 48));

        rr(x, top, PANE_W, hgt, 1.6);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 0.32;
        ctx.strokeStyle = pal.hi(0.4);
        ctx.stroke();

        /* the vertical highlight that makes it a sheet, not a bar */
        ctx.fillStyle = pal.hi(0.22);
        rr(x + 1.4, top + 1, 2.1, hgt - 2, 1);
        ctx.fill();

        /* a brighter lip at the mouth of the gap */
        ctx.fillStyle = pal.hi(0.5);
        var lipY = lower ? top : top + hgt - 1.1;
        rr(x - 0.5, lipY, PANE_W + 1, 1.1, 0.5);
        ctx.fill();
      }

      function rr(x, yy, w, hh, r) {
        r = Math.min(r, Math.abs(w) / 2, Math.abs(hh) / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, yy);
        ctx.arcTo(x + w, yy, x + w, yy + hh, r);
        ctx.arcTo(x + w, yy + hh, x, yy + hh, r);
        ctx.arcTo(x, yy + hh, x, yy, r);
        ctx.arcTo(x, yy, x + w, yy, r);
        ctx.closePath();
      }

      g.score(0);
      g.loop(function (dt) { tick(dt); draw(); });
    }
  });
})(window.DS);
