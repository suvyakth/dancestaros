/* ═══════════════════════════════════════════════════════════════
   prism.js — Prism

   Breakout, but the ball is a bead of light and the bricks are panes
   of coloured glass: each row is a band of the spectrum, and a pane
   shatters into shards that fall and fade. The paddle is a lens.

   The one piece of real physics: the bounce off the paddle is not a
   mirror. Where the ball lands across the paddle's width sets the
   outgoing angle, which is what turns the game from waiting into
   aiming.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var COLS = 9, ROWS = 5;
  var LIVES = 3;

  function bandSwatch(base, step) {
    var s = '<svg viewBox="0 0 20 20">';
    for (var i = 0; i < 4; i++) {
      s += '<rect x="2" y="' + (2 + i * 4.4) + '" width="16" height="3.4" rx="1.4" ' +
           'fill="hsl(' + (base + i * step) + ' 90% 64%)"/>';
    }
    return s + '</svg>';
  }
  function beadSwatch(fill) {
    return '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="' +
      fill + '"/></svg>';
  }

  DS.games.register({
    id: "prism",
    name: "Prism",
    tag: "Arcade",
    blurb: "Bounce a bead of light through the spectrum.",
    keys: "Move the mouse, or Arrow keys · Space to launch",

    counters: [
      { key: "bricks", label: "Panes broken" },
      { key: "levels", label: "Deepest level" },
      { key: "runs",   label: "Runs" }
    ],

    skins: [
      {
        key: "band", label: "Spectrum",
        items: [
          { id: "prism",  label: "Prism",  base: 222, step: -45,
            swatch: bandSwatch(222, -45) },
          { id: "sunset", label: "Sunset", base: 44,  step: -12,
            swatch: bandSwatch(44, -12), note: "Break 120 panes in all",
            need: { key: "bricks", at: 120 } },
          { id: "ice",    label: "Ice",    base: 210, step: -14,
            swatch: bandSwatch(210, -14), note: "Reach level 3",
            need: { key: "levels", at: 3 } },
          { id: "bloom",  label: "Bloom",  base: 320, step: 20,
            swatch: bandSwatch(320, 20), note: "Score 900 in one run",
            need: { key: "best", at: 900 } }
        ]
      },
      {
        key: "bead", label: "Bead",
        items: [
          { id: "light",   label: "Light",   hue: null,
            swatch: beadSwatch("#ffffff") },
          { id: "ember",   label: "Ember",   hue: 26,
            swatch: beadSwatch("#fb923c"), note: "Break 60 panes in all",
            need: { key: "bricks", at: 60 } },
          { id: "verdant", label: "Verdant", hue: 148,
            swatch: beadSwatch("#34d399"), note: "Score 500 in one run",
            need: { key: "best", at: 500 } },
          { id: "violet",  label: "Violet",  hue: 282,
            swatch: beadSwatch("#c084fc"), note: "Reach level 4",
            need: { key: "levels", at: 4 } }
        ]
      }
    ],

    awards: [
      { id: "prism-first", name: "First Pane", hint: "Break a single pane.",
        icon: "layers", tier: "bronze", key: "bricks", at: 1 },
      { id: "prism-clear", name: "Full Board", hint: "Clear every pane and reach level 2.",
        icon: "check",  tier: "silver", key: "levels", at: 2 },
      { id: "prism-deep",  name: "Four Deep",  hint: "Reach level 4.",
        icon: "wave",   tier: "gold",   key: "levels", at: 4 },
      { id: "prism-1000",  name: "Thousand",   hint: "Score a thousand in a single run.",
        icon: "star",   tier: "silver", key: "best",   at: 1000 },
      { id: "prism-300",   name: "Glazier",    hint: "Break three hundred panes in all.",
        icon: "grid",   tier: "silver", key: "bricks", at: 300 }
    ],

    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="3">' +
      '<rect x="14" y="8" width="16" height="8" rx="3" opacity=".8"/>' +
      '<rect x="34" y="8" width="16" height="8" rx="3" opacity=".55"/>' +
      '<rect x="54" y="8" width="16" height="8" rx="3" opacity=".8"/>' +
      '<rect x="24" y="20" width="16" height="8" rx="3" opacity=".4"/>' +
      '<rect x="44" y="20" width="16" height="8" rx="3" opacity=".65"/>' +
      '<circle cx="52" cy="38" r="4" fill="currentColor" stroke="none"/>' +
      '<rect x="34" y="48" width="30" height="6" rx="3"/>' +
      '</svg>',

    play: function (stage, g) {
      /* Everything is computed in a fixed 100x100 space and scaled to
         the canvas at draw time, so resizing the window never changes
         the difficulty — only how big it looks. */
      var W = 100, H = 100;
      var PAD_W = 15, PAD_H = 2.2, PAD_Y = 92;
      var R = 1.5;

      var cv = g.canvas();
      var ctx = cv.ctx;

      var padX = W / 2;
      var padTarget = padX;
      var ball = null;
      var stuck = true;        // sitting on the paddle, waiting to launch
      var bricks = [];
      var shards = [];
      var lives = LIVES;
      var level = 1;
      var over = false;
      var keyL = false, keyR = false;

      function scale() {
        /* letterbox the field into whatever shape the window is */
        var s = Math.min(cv.w / W, cv.h / H);
        return { s: s, ox: (cv.w - W * s) / 2, oy: (cv.h - H * s) / 2 };
      }

      function build() {
        bricks = [];
        var bw = (W - 8) / COLS;
        var bh = 4.6;
        for (var r = 0; r < ROWS; r++) {
          for (var c = 0; c < COLS; c++) {
            bricks.push({
              x: 4 + c * bw, y: 12 + r * (bh + 1.4),
              w: bw - 1.2, h: bh,
              row: r,                     // a band of the spectrum per row
              points: (ROWS - r) * 10,
              alive: true
            });
          }
        }
      }

      /* Read live rather than baked into the brick, so a band picked
         in the locker lands on the next frame and not the next level. */
      function hueOf(row) {
        var band = g.skin("band");
        return band.base + row * band.step;
      }

      function reseat() {
        stuck = true;
        ball = { x: padX, y: PAD_Y - R - PAD_H / 2, vx: 0, vy: 0 };
        g.status("Space to launch");
      }

      function launch() {
        if (!stuck || over) return;
        stuck = false;
        var sp = 52 + level * 4;
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        ball.vx = Math.cos(a) * sp;
        ball.vy = Math.sin(a) * sp;
        g.status("");
        DS.chime.tick();
      }

      function shatter(b) {
        for (var i = 0; i < 7; i++) {
          shards.push({
            x: b.x + Math.random() * b.w,
            y: b.y + Math.random() * b.h,
            vx: (Math.random() - 0.5) * 34,
            vy: -6 - Math.random() * 18,
            r: 0.5 + Math.random() * 1.1,
            hue: hueOf(b.row),
            life: 1
          });
        }
      }

      function lose() {
        lives--;
        if (lives <= 0) {
          over = true;
          DS.chime.back();
          stage.classList.add("gm-shake");
          g.after(function () { stage.classList.remove("gm-shake"); }, 420);
          g.over({
            title: "Out of light",
            body: "Three beads lost. Level " + level + ".",
            icon: "x"
          });
          return;
        }
        DS.chime.back();
        reseat();
      }

      function cleared() {
        level++;
        g.peak("levels", level);
        build();
        reseat();
        g.status("Level " + level);
        DS.chime.done();
      }

      function tick(dt) {
        if (over) return;

        /* the paddle chases its target, which is either the pointer or
           wherever the arrow keys have pushed it */
        if (keyL) padTarget -= 130 * dt;
        if (keyR) padTarget += 130 * dt;
        padTarget = DS.clamp(padTarget, PAD_W / 2, W - PAD_W / 2);
        padX += (padTarget - padX) * Math.min(1, dt * 22);

        if (stuck) { ball.x = padX; return; }

        /* Step in slices, so a fast bead cannot tunnel through a brick
           between two frames. */
        var steps = Math.max(1, Math.ceil(Math.abs(ball.vy * dt) / 1.2));
        for (var s = 0; s < steps && !over && !stuck; s++) advance(dt / steps);
      }

      function advance(dt) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
        if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
        if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }

        if (ball.y > H + 4) return lose();

        /* paddle: position across its face sets the angle */
        var top = PAD_Y - PAD_H / 2;
        if (ball.vy > 0 && ball.y + R >= top && ball.y - R <= PAD_Y + PAD_H / 2 &&
            ball.x >= padX - PAD_W / 2 - R && ball.x <= padX + PAD_W / 2 + R) {
          var rel = DS.clamp((ball.x - padX) / (PAD_W / 2), -1, 1);
          var sp = Math.min(96, Math.hypot(ball.vx, ball.vy) * 1.012);
          var ang = -Math.PI / 2 + rel * 1.05;
          ball.vx = Math.cos(ang) * sp;
          ball.vy = Math.sin(ang) * sp;
          ball.y = top - R;
          DS.chime.tick();
        }

        for (var i = 0; i < bricks.length; i++) {
          var b = bricks[i];
          if (!b.alive) continue;
          if (ball.x + R < b.x || ball.x - R > b.x + b.w ||
              ball.y + R < b.y || ball.y - R > b.y + b.h) continue;

          /* bounce off whichever face was the shallower overlap */
          var ox = Math.min(ball.x + R - b.x, b.x + b.w - (ball.x - R));
          var oy = Math.min(ball.y + R - b.y, b.y + b.h - (ball.y - R));
          if (ox < oy) ball.vx = -ball.vx; else ball.vy = -ball.vy;

          b.alive = false;
          shatter(b);
          g.bump(b.points);
          g.stat("bricks");
          DS.chime.tick();

          if (!bricks.some(function (x) { return x.alive; })) cleared();
          break;
        }
      }

      function draw(dt) {
        if (!cv.w) return;
        var p = g.palette();
        var S = scale();
        ctx.clearRect(0, 0, cv.w, cv.h);

        ctx.save();
        ctx.translate(S.ox, S.oy);
        ctx.scale(S.s, S.s);

        /* the well */
        ctx.fillStyle = p.lo(0.2);
        rr(0, 0, W, H, 3);
        ctx.fill();
        ctx.lineWidth = 0.4;
        ctx.strokeStyle = p.hi(0.16);
        ctx.stroke();

        ctx.save();
        rr(0, 0, W, H, 3);
        ctx.clip();

        bricks.forEach(function (b) {
          if (!b.alive) return;
          var bhue = hueOf(b.row);
          rr(b.x, b.y, b.w, b.h, 1.1);
          var grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
          grad.addColorStop(0, p.hue(bhue, 0.82, 90, 70));
          grad.addColorStop(1, p.hue(bhue, 0.42, 90, 58));
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.lineWidth = 0.28;
          ctx.strokeStyle = p.hi(0.42);
          ctx.stroke();
          /* the highlight that makes it a pane and not a rectangle */
          ctx.fillStyle = p.hi(0.24);
          rr(b.x + 0.6, b.y + 0.5, b.w - 1.2, b.h * 0.34, 0.7);
          ctx.fill();
        });

        shards.forEach(function (s) {
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.fillStyle = p.hue(s.hue, 0.9, 90, 70);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;

        /* the lens */
        var lg = ctx.createLinearGradient(padX - PAD_W / 2, 0, padX + PAD_W / 2, 0);
        lg.addColorStop(0, p.accent(0.55));
        lg.addColorStop(0.5, p.hi(0.9));
        lg.addColorStop(1, p.accent2(0.55));
        rr(padX - PAD_W / 2, PAD_Y - PAD_H / 2, PAD_W, PAD_H, PAD_H / 2);
        ctx.fillStyle = lg;
        ctx.fill();

        /* the bead */
        var bs = g.skin("bead");
        var plain = bs.hue === null || bs.hue === undefined;
        ctx.save();
        ctx.shadowColor = plain ? p.accent2(0.95) : p.hue(bs.hue, 0.95, 92, 62);
        ctx.shadowBlur = 12;
        ctx.fillStyle = plain ? p.hi(0.98) : p.hue(bs.hue, 0.98, 92, 74);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();

        /* lives, as beads in the corner */
        for (var i = 0; i < lives; i++) {
          ctx.fillStyle = p.hi(0.55);
          ctx.beginPath();
          ctx.arc(4 + i * 3.6, 5, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        shards = shards.filter(function (s) {
          s.life -= dt * 1.6;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 90 * dt;
          return s.life > 0;
        });
      }

      function rr(x, y, w, hh, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + hh, r);
        ctx.arcTo(x + w, y + hh, x, y + hh, r);
        ctx.arcTo(x, y + hh, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }

      /* ── input ── */
      g.on(cv.el, "pointermove", function (e) {
        var S = scale();
        if (!S.s) return;
        var r = cv.el.getBoundingClientRect();
        /* the desktop may be zoomed, so the rect is in scaled pixels;
           divide by the ratio the rect itself reveals */
        var k = r.width / (cv.el.clientWidth || 1);
        padTarget = DS.clamp(((e.clientX - r.left) / k - S.ox) / S.s, PAD_W / 2, W - PAD_W / 2);
      });
      g.on(cv.el, "pointerdown", function () { launch(); });

      g.key(function (e) {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keyL = true;
        else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keyR = true;
        else if (e.key === " " || e.key === "Spacebar") launch();
        else return;
        e.preventDefault();
      });
      g.on(document, "keyup", function (e) {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keyL = false;
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keyR = false;
      });

      build();
      reseat();
      g.score(0);
      g.loop(function (dt) { tick(dt); draw(dt); });
    }
  });
})(window.DS);
