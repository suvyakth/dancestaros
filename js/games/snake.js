/* ═══════════════════════════════════════════════════════════════
   snake.js — Serpent

   The snake is drawn as one stroked polyline through the cell
   centres rather than as a row of squares, which is what lets it
   move smoothly: the head is lerped out of its old cell and the tail
   lerped into its new one across the tick, so at 60fps you see a
   gliding ribbon and not a slideshow at 8 frames a second.

   Both the fruit and the body are skinned. A skin is data, never a
   branch in the draw code: the fruit carries a hue and a shape name,
   the body carries two hues and a couple of flags, and one drawing
   routine reads whichever is current on every frame.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var COLS = 19, ROWS = 19;
  var START_MS = 132;      // one step
  var FLOOR_MS = 62;       // as fast as it is ever allowed to get

  /* a tiny inline swatch for the locker */
  function dot(fill) {
    return '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="' + fill + '"/></svg>';
  }
  function ribbon(a, b) {
    /* the id has to survive being written into url(#...), so the
       hashes come out of the colours first */
    var id = "sn" + (a + b).replace(/[^a-z0-9]/gi, "");
    return '<svg viewBox="0 0 20 20"><defs><linearGradient id="' + id +
      '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a +
      '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>' +
      '<path d="M3 14h6V6h8" fill="none" stroke="url(#' + id +
      ')" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  DS.games.register({
    id: "snake",
    name: "Serpent",
    tag: "Arcade",
    blurb: "Eat the beads. Do not eat yourself.",
    keys: "Arrow keys or WASD to steer · Space to pause",
    scoreLabel: "Beads",
    art:
      '<svg viewBox="0 0 96 60" fill="none" stroke="currentColor" stroke-width="5" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 44h16V30h16V16h14" opacity=".85"/>' +
      '<circle cx="78" cy="16" r="5" fill="currentColor" stroke="none" opacity=".6"/>' +
      '</svg>',

    counters: [
      { key: "beads", label: "Beads eaten" },
      { key: "runs",  label: "Runs" },
      { key: "walls", label: "Walls hit" },
      { key: "self",  label: "Times self-eaten" },
      { key: "longest", label: "Longest body" }
    ],

    /* ── what you can unlock ── */
    skins: [
      {
        key: "fruit", label: "Bead",
        items: [
          { id: "bead",   label: "Bead",       shape: "bead",   hue: null,
            swatch: dot("#7dd3fc") },
          { id: "orange", label: "Orange",     shape: "citrus", hue: 28,
            swatch: dot("#fb923c"), note: "Eat 25 beads in all",
            need: { key: "beads", at: 25 } },
          { id: "plum",   label: "Plum",       shape: "citrus", hue: 300,
            swatch: dot("#c084fc"), note: "Eat 75 beads in all",
            need: { key: "beads", at: 75 } },
          { id: "star",   label: "Star fruit", shape: "star",   hue: 52,
            swatch: dot("#fcd34d"), note: "Reach 14 in one run",
            need: { key: "best", at: 14 } },
          { id: "prism",  label: "Prism",      shape: "prism",  hue: null,
            swatch: dot("#f0abfc"), note: "Reach 24 in one run",
            need: { key: "best", at: 24 } }
        ]
      },
      {
        key: "body", label: "Body",
        items: [
          { id: "serpent", label: "Serpent", a: null, b: null, glow: 1,
            swatch: ribbon("#38bdf8", "#c084fc") },
          { id: "worm",    label: "Worm",    a: 8,  b: 342, glow: .6, ridges: true,
            swatch: ribbon("#fb7185", "#f472b6"), note: "Play 5 runs",
            need: { key: "runs", at: 5 } },
          { id: "neon",    label: "Neon",    a: 150, b: 168, glow: 2.4,
            swatch: ribbon("#34d399", "#a3e635"), note: "Eat 50 beads in all",
            need: { key: "beads", at: 50 } },
          { id: "glass",   label: "Glass",   a: null, b: null, glow: .4, clear: true,
            swatch: ribbon("#e0f2fe", "#ffffff"), note: "Reach 18 in one run",
            need: { key: "best", at: 18 } },
          { id: "ember",   label: "Ember",   a: 18, b: 44, glow: 1.8, ridges: true,
            swatch: ribbon("#f97316", "#fbbf24"), note: "Grow a body of 26",
            need: { key: "longest", at: 26 } }
        ]
      }
    ],

    awards: [
      { id: "snake-first",  name: "First Bead",     hint: "Eat one bead.",
        icon: "star",   tier: "bronze", key: "beads", at: 1 },
      { id: "snake-ten",    name: "Ten Long",       hint: "Reach ten beads in a single run.",
        icon: "wave",   tier: "bronze", key: "best",  at: 10 },
      { id: "snake-twenty", name: "Long Serpent",   hint: "Reach twenty beads in a single run.",
        icon: "layers", tier: "silver", key: "best",  at: 20 },
      { id: "snake-hundred", name: "Century",       hint: "Eat a hundred beads across all runs.",
        icon: "grid",   tier: "silver", key: "beads", at: 100 },
      { id: "snake-walls",  name: "Wall Enthusiast", hint: "Drive into the wall ten times. It happens.",
        icon: "x",      tier: "bronze", key: "walls", at: 10 }
    ],

    play: function (stage, g) {
      var cv = g.canvas(function () { draw(1); });
      var ctx = cv.ctx;

      var body = [];        // head first
      var tailPrev = null;  // the cell vacated by the last tick
      var dir = { x: 1, y: 0 };
      var queue = [];       // buffered turns, so a fast double-tap lands
      var food = null;
      var acc = 0;          // ms since the last step
      var speed = START_MS;
      var paused = false;
      var over = false;
      var glow = 0;         // decays after each bead, for a flash

      reset();

      function reset() {
        var cy = (ROWS / 2) | 0;
        body = [{ x: 6, y: cy }, { x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }];
        dir = { x: 1, y: 0 };
        queue = [];
        tailPrev = null;
        speed = START_MS;
        acc = 0;
        placeFood();
      }

      function occupied(x, y) {
        for (var i = 0; i < body.length; i++) {
          if (body[i].x === x && body[i].y === y) return true;
        }
        return false;
      }

      function placeFood() {
        var free = [];
        for (var y = 0; y < ROWS; y++) {
          for (var x = 0; x < COLS; x++) if (!occupied(x, y)) free.push({ x: x, y: y });
        }
        food = free.length ? free[(Math.random() * free.length) | 0] : null;
      }

      /* ── steering ──
         A turn is refused only against the *current* heading, and the
         rest are queued: pressing up-then-left inside one tick used to
         throw the second press away, which felt like a dropped input
         rather than a rule. */
      function steer(nx, ny) {
        var last = queue.length ? queue[queue.length - 1] : dir;
        if (last.x === -nx && last.y === -ny) return;
        if (last.x === nx && last.y === ny) return;
        if (queue.length < 2) queue.push({ x: nx, y: ny });
      }

      g.key(function (e) {
        var k = e.key;
        if (k === "ArrowUp" || k === "w" || k === "W") steer(0, -1);
        else if (k === "ArrowDown" || k === "s" || k === "S") steer(0, 1);
        else if (k === "ArrowLeft" || k === "a" || k === "A") steer(-1, 0);
        else if (k === "ArrowRight" || k === "d" || k === "D") steer(1, 0);
        else if (k === " " || k === "Spacebar") {
          if (over) return;
          paused = !paused;
          g.status(paused ? "Paused" : "");
        } else return;
        e.preventDefault();
      });

      g.swipe(function (d) {
        if (d === "up") steer(0, -1);
        else if (d === "down") steer(0, 1);
        else if (d === "left") steer(-1, 0);
        else steer(1, 0);
      });

      function step() {
        if (queue.length) dir = queue.shift();

        var nx = body[0].x + dir.x;
        var ny = body[0].y + dir.y;

        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
          g.stat("walls");
          return die("Into the wall.");
        }

        /* The tail cell is about to be vacated, so running into it is
           legal — the classic rule, and the one that makes tight
           corners survivable. */
        for (var i = 0; i < body.length - 1; i++) {
          if (body[i].x === nx && body[i].y === ny) {
            g.stat("self");
            return die("You ate yourself.");
          }
        }

        body.unshift({ x: nx, y: ny });

        if (food && nx === food.x && ny === food.y) {
          tailPrev = null;                    // grew: nothing was vacated
          g.bump(1);
          g.stat("beads");
          g.peak("longest", body.length);
          glow = 1;
          DS.chime.tick();
          speed = Math.max(FLOOR_MS, START_MS - g.value() * 3.2);
          placeFood();
          if (!food) return win();
        } else {
          tailPrev = body.pop();
        }
      }

      function die(why) {
        over = true;
        g.status("");
        DS.chime.back();
        stage.classList.add("gm-shake");
        g.after(function () { stage.classList.remove("gm-shake"); }, 420);
        g.over({ title: "Game over", body: why, icon: "x" });
      }

      function win() {
        over = true;
        g.over({ title: "The whole board", win: true,
                 body: "There was nowhere left to put a bead.", icon: "star" });
      }

      /* ── skins ── */
      function fruitColour(p, sk) {
        return sk.hue === null || sk.hue === undefined
          ? p.accent2(0.95) : p.hue(sk.hue, 0.95, 92, 62);
      }

      function drawFruit(p, sk, x, y, r, pulse) {
        var col = fruitColour(p, sk);
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 16 + pulse * 10;
        ctx.fillStyle = col;

        if (sk.shape === "star") {
          ctx.beginPath();
          for (var i = 0; i < 10; i++) {
            var a = -Math.PI / 2 + (i * Math.PI) / 5;
            var rr = i % 2 ? r * 0.44 : r * 1.18;
            ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        } else if (sk.shape === "prism") {
          var grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
          grad.addColorStop(0, p.hue(196, 0.95));
          grad.addColorStop(0.5, p.hue(292, 0.95));
          grad.addColorStop(1, p.hue(38, 0.95));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(x, y - r * 1.15);
          ctx.lineTo(x + r, y + r * 0.75);
          ctx.lineTo(x - r, y + r * 0.75);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          if (sk.shape === "citrus") {
            /* one leaf, and the dimple it grows out of */
            ctx.shadowBlur = 0;
            ctx.fillStyle = p.hue(132, 0.9, 70, 52);
            ctx.beginPath();
            ctx.ellipse(x + r * 0.5, y - r * 0.95, r * 0.5, r * 0.24,
                        -0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();

        if (sk.shape !== "prism") {
          ctx.fillStyle = p.hi(0.7);
          ctx.beginPath();
          ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.26, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      function bodyEnds(p, sk) {
        if (sk.a === null || sk.a === undefined) {
          return sk.clear
            ? [p.hi(0.5), p.hi(0.22)]
            : [p.accent(0.95), p.accent2(0.6)];
        }
        return [p.hue(sk.a, 0.95, 90, 62), p.hue(sk.b, 0.75, 90, 58)];
      }

      /* ── drawing ── */
      function geom() {
        var cell = Math.max(6, Math.floor(Math.min(cv.w / COLS, cv.h / ROWS)));
        return {
          c: cell,
          ox: Math.round((cv.w - cell * COLS) / 2),
          oy: Math.round((cv.h - cell * ROWS) / 2)
        };
      }

      function draw(t) {
        if (!cv.w) return;
        var p = g.palette();
        var skF = g.skin("fruit");
        var skB = g.skin("body");
        var G = geom();
        var c = G.c;
        function cx(x) { return G.ox + x * c + c / 2; }
        function cy(y) { return G.oy + y * c + c / 2; }

        ctx.clearRect(0, 0, cv.w, cv.h);

        /* the board: a dark well with a lit rim, so the play area
           reads as a recess in the glass rather than a flat rectangle */
        var bw = c * COLS, bh = c * ROWS;
        var r = 14;
        roundRect(G.ox, G.oy, bw, bh, r);
        ctx.fillStyle = p.lo(0.22);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = p.hi(0.16);
        ctx.stroke();

        ctx.save();
        roundRect(G.ox, G.oy, bw, bh, r);
        ctx.clip();

        ctx.strokeStyle = p.hi(0.045);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 1; i < COLS; i++) {
          ctx.moveTo(G.ox + i * c + 0.5, G.oy);
          ctx.lineTo(G.ox + i * c + 0.5, G.oy + bh);
        }
        for (var j = 1; j < ROWS; j++) {
          ctx.moveTo(G.ox, G.oy + j * c + 0.5);
          ctx.lineTo(G.ox + bw, G.oy + j * c + 0.5);
        }
        ctx.stroke();

        if (food) {
          var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
          drawFruit(p, skF, cx(food.x), cy(food.y),
                    c * (0.3 + pulse * 0.05), pulse);
        }

        /* the snake, as one rounded stroke */
        var pts = [];
        var hx, hy;
        if (body.length > 1) {
          hx = cx(body[1].x) + (cx(body[0].x) - cx(body[1].x)) * t;
          hy = cy(body[1].y) + (cy(body[0].y) - cy(body[1].y)) * t;
        } else {
          hx = cx(body[0].x); hy = cy(body[0].y);
        }
        pts.push([hx, hy]);
        for (var k = 1; k < body.length; k++) pts.push([cx(body[k].x), cy(body[k].y)]);
        if (tailPrev) {
          var last = body[body.length - 1];
          pts[pts.length - 1] = [
            cx(tailPrev.x) + (cx(last.x) - cx(tailPrev.x)) * t,
            cy(tailPrev.y) + (cy(last.y) - cy(tailPrev.y)) * t
          ];
        }

        var ends = bodyEnds(p, skB);
        var grad = ctx.createLinearGradient(
          pts[0][0], pts[0][1],
          pts[pts.length - 1][0], pts[pts.length - 1][1]);
        grad.addColorStop(0, ends[0]);
        grad.addColorStop(1, ends[1]);

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.strokeStyle = p.lo(skB.clear ? 0.16 : 0.3);
        ctx.lineWidth = c * 0.78;
        trace(pts);
        ctx.stroke();

        ctx.save();
        ctx.shadowColor = ends[0];
        ctx.shadowBlur = (12 + glow * 22) * (skB.glow === undefined ? 1 : skB.glow);
        ctx.strokeStyle = grad;
        ctx.lineWidth = c * 0.66;
        trace(pts);
        ctx.stroke();
        ctx.restore();

        /* the specular line down the back — the thing that makes it
           look like glass rather than a coloured worm */
        ctx.strokeStyle = p.hi(skB.clear ? 0.5 : 0.3);
        ctx.lineWidth = Math.max(1, c * (skB.clear ? 0.2 : 0.14));
        trace(pts);
        ctx.stroke();

        /* a segmented body gets bands at each joint */
        if (skB.ridges) {
          ctx.strokeStyle = p.lo(0.22);
          ctx.lineWidth = Math.max(1, c * 0.08);
          ctx.beginPath();
          for (var q = 1; q < pts.length - 1; q++) {
            var ax = pts[q][0], ay = pts[q][1];
            ctx.moveTo(ax - c * 0.26, ay - c * 0.26);
            ctx.lineTo(ax + c * 0.26, ay + c * 0.26);
          }
          ctx.stroke();
        }

        /* eyes */
        var ang = Math.atan2(dir.y, dir.x);
        [-1, 1].forEach(function (side) {
          var ex = hx + Math.cos(ang) * c * 0.14 - Math.sin(ang) * side * c * 0.15;
          var ey = hy + Math.sin(ang) * c * 0.14 + Math.cos(ang) * side * c * 0.15;
          ctx.fillStyle = p.lo(0.75);
          ctx.beginPath();
          ctx.arc(ex, ey, Math.max(1.2, c * 0.075), 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.restore();
        glow *= 0.9;
      }

      function trace(pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      }

      function roundRect(x, y, w, hh, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + hh, r);
        ctx.arcTo(x + w, y + hh, x, y + hh, r);
        ctx.arcTo(x, y + hh, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }

      g.loop(function (dt) {
        if (!over && !paused) {
          acc += dt * 1000;
          while (acc >= speed && !over) { acc -= speed; step(); }
        }
        draw(over || paused ? 1 : Math.min(1, acc / speed));
      });
    }
  });
})(window.DS);
