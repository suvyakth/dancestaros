/* ═══════════════════════════════════════════════════════════════
   forge.js — Glass Forge

   Falling-sand automaton with one twist that makes it belong in this
   OS: the glass you make is really transparent. The canvas has no
   background, so empty cells and finished glass both let the window's
   own backdrop-filter through — you are melting sand into a pane you
   can then see the desktop through.

   Four states, one rule each:
     SAND    falls, and piles at an angle
     MOLTEN  falls slower, spreads much further, cools with time
     GLASS   holds still, and lets light through
     CRACK   glass that took a hit; shatters back to sand

   Heat sand to melt it. Let it cool. Hit it to break it.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var EMPTY = 0, SAND = 1, MOLTEN = 2, GLASS = 3;
  var CELL = 5;

  DS.apps.register({
    id: "forge",
    name: "Glass Forge",
    icon: "layers",
    w: 720, h: 560, minW: 460, minH: 380,
    flush: true,

    mount: function (body, api) {
      var canvas = h("canvas.fg-canvas");
      var ctx = canvas.getContext("2d");
      var stage = h("div.fg-stage", {}, [canvas]);
      var panel = h("div.lab-panel");
      var status = h("div.app-statusbar");

      var W = 0, H = 0;              // grid size in cells
      var grid = null;               // Uint8Array of states
      var heat = null;               // Uint8Array, how molten a cell still is
      var tool = "sand";
      var brush = 5;
      var pour = true;
      var raf = null;
      var pointer = null;
      var made = 0;

      function resize() {
        /* The grid is measured in layout pixels, because that is what
           the canvas is sized in — so a zoomed window must not be read
           as a bigger stage. */
        var z = DS.zoom ? DS.zoom.of(stage) : 1;
        var r = stage.getBoundingClientRect();
        var cw = Math.max(80, Math.floor(r.width / z / CELL));
        var ch = Math.max(60, Math.floor(r.height / z / CELL));
        var old = grid, oldW = W, oldH = H;

        W = cw; H = ch;
        canvas.width = W * CELL;
        canvas.height = H * CELL;
        canvas.style.width = W * CELL + "px";
        canvas.style.height = H * CELL + "px";

        var ng = new Uint8Array(W * H);
        var nh = new Uint8Array(W * H);
        if (old) {                            // keep what was already built
          for (var y = 0; y < Math.min(oldH, H); y++) {
            for (var x = 0; x < Math.min(oldW, W); x++) {
              ng[y * W + x] = old[y * oldW + x];
              nh[y * W + x] = heat[y * oldW + x];
            }
          }
        }
        grid = ng; heat = nh;
      }

      function at(x, y) {
        if (x < 0 || y < 0 || x >= W || y >= H) return -1;
        return grid[y * W + x];
      }
      function put(x, y, v, hv) {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        grid[y * W + x] = v;
        heat[y * W + x] = hv === undefined ? 0 : hv;
      }
      function swap(a, b) {
        var t = grid[a], th = heat[a];
        grid[a] = grid[b]; heat[a] = heat[b];
        grid[b] = t; heat[b] = th;
      }

      /* ── one step of the world ── */
      function step() {
        // bottom-up so a falling grain cannot fall twice in one frame
        for (var y = H - 2; y >= 0; y--) {
          // alternate scan direction, or piles lean permanently left
          var flip = (y & 1) === 0;
          for (var i = 0; i < W; i++) {
            var x = flip ? i : W - 1 - i;
            var idx = y * W + x;
            var v = grid[idx];
            if (v === EMPTY || v === GLASS) continue;

            if (v === MOLTEN) {
              heat[idx] -= 1;
              if (heat[idx] <= 0) { grid[idx] = GLASS; made += 1; continue; }
            }

            var below = idx + W;
            if (grid[below] === EMPTY) { swap(idx, below); continue; }

            // molten is runnier: it spreads sideways much more readily
            var spread = v === MOLTEN ? 3 : 1;
            var dir = Math.random() < 0.5 ? -1 : 1;
            var moved = false;

            for (var s = 1; s <= spread && !moved; s++) {
              var dl = y + 1 < H ? (y + 1) * W + (x + dir * s) : -1;
              if (dl >= 0 && x + dir * s >= 0 && x + dir * s < W && grid[dl] === EMPTY) {
                swap(idx, dl); moved = true; break;
              }
              var dr = y + 1 < H ? (y + 1) * W + (x - dir * s) : -1;
              if (dr >= 0 && x - dir * s >= 0 && x - dir * s < W && grid[dr] === EMPTY) {
                swap(idx, dr); moved = true; break;
              }
            }
            if (moved) continue;

            // a molten puddle also creeps along a flat floor
            if (v === MOLTEN) {
              var sx = x + dir;
              if (sx >= 0 && sx < W && grid[y * W + sx] === EMPTY) swap(idx, y * W + sx);
            }
          }
        }
      }

      /* ── painting with the current tool ── */
      function apply(cx, cy) {
        for (var dy = -brush; dy <= brush; dy++) {
          for (var dx = -brush; dx <= brush; dx++) {
            if (dx * dx + dy * dy > brush * brush) continue;
            var x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            var idx = y * W + x;

            if (tool === "sand") {
              if (grid[idx] === EMPTY && Math.random() < .55) put(x, y, SAND);
            } else if (tool === "heat") {
              if (grid[idx] === SAND || grid[idx] === GLASS) {
                grid[idx] = MOLTEN;
                heat[idx] = 60 + Math.floor(Math.random() * 50);
              } else if (grid[idx] === MOLTEN) {
                heat[idx] = Math.min(200, heat[idx] + 12);
              }
            } else if (tool === "cool") {
              if (grid[idx] === MOLTEN) { grid[idx] = GLASS; heat[idx] = 0; made += 1; }
            } else if (tool === "hit") {
              if (grid[idx] === GLASS && Math.random() < .7) {
                // broken glass goes back to being sand, which is the truth
                grid[idx] = SAND;
              }
            } else if (tool === "erase") {
              grid[idx] = EMPTY; heat[idx] = 0;
            }
          }
        }
      }

      /* ── drawing ── */
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var idx = y * W + x;
            var v = grid[idx];
            if (v === EMPTY) continue;

            if (v === SAND) {
              // a little grain-to-grain variation, seeded by position
              var n = ((x * 73 + y * 151) % 17) / 17;
              ctx.fillStyle = "rgba(" + (206 + n * 26 | 0) + "," +
                              (176 + n * 24 | 0) + "," + (122 + n * 26 | 0) + ",.92)";
            } else if (v === MOLTEN) {
              var t = Math.min(1, heat[idx] / 110);
              ctx.fillStyle = "rgba(255," + (90 + t * 140 | 0) + "," +
                              (30 + t * 90 | 0) + "," + (0.75 + t * 0.25).toFixed(2) + ")";
            } else {
              // GLASS: barely there, so the window's backdrop shows through it
              ctx.fillStyle = "rgba(215,240,255,.17)";
            }
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

            if (v === GLASS) {
              ctx.fillStyle = "rgba(255,255,255,.30)";
              ctx.fillRect(x * CELL, y * CELL, CELL, 1);        // lit top edge
            } else if (v === MOLTEN && heat[idx] > 70) {
              ctx.fillStyle = "rgba(255,220,150,.35)";
              ctx.fillRect(x * CELL, y * CELL, CELL, 1);
            }
          }
        }
      }

      function loop() {
        if (pointer) apply(pointer.x, pointer.y);
        else if (pour && tool === "sand") {
          // a lazy trickle from above, so it is never empty
          var mid = Math.floor(W / 2 + Math.sin(Date.now() / 1400) * W * 0.3);
          if (Math.random() < .5) put(mid, 0, SAND);
        }
        step();
        draw();
        raf = requestAnimationFrame(loop);
      }

      /* ── input ── */
      function cellFrom(e) {
        var r = canvas.getBoundingClientRect();
        var s = CELL * (DS.zoom ? DS.zoom.of(canvas) : 1);
        return {
          x: Math.floor((e.clientX - r.left) / s),
          y: Math.floor((e.clientY - r.top) / s)
        };
      }
      canvas.addEventListener("pointerdown", function (e) {
        canvas.setPointerCapture(e.pointerId);
        pointer = cellFrom(e);
        if (tool === "hit") {
          DS.glass.crack(e.clientX, e.clientY, { arms: 6, reach: 220, hold: 900 });
        }
      });
      canvas.addEventListener("pointermove", function (e) {
        if (pointer) pointer = cellFrom(e);
      });
      canvas.addEventListener("pointerup", function () { pointer = null; });
      canvas.addEventListener("pointercancel", function () { pointer = null; });

      /* ── controls ── */
      var TOOLS = [
        ["sand", "Sand", "Pour it in"],
        ["heat", "Heat", "1700°C. Sand becomes molten"],
        ["cool", "Cool", "Set it solid, right now"],
        ["hit", "Hit it", "Glass goes back to sand"],
        ["erase", "Clear", "Take it away"]
      ];

      function renderPanel() {
        DS.clear(panel);
        panel.appendChild(h("div.side-label", { text: "Tool" }));
        var tg = h("div.fg-tools");
        TOOLS.forEach(function (t) {
          tg.appendChild(h("button.g-btn" + (t[0] === tool ? ".g-btn-accent" : ""), {
            text: t[1], title: t[2],
            onclick: function () { tool = t[0]; renderPanel(); }
          }));
        });
        panel.appendChild(tg);
        panel.appendChild(h("div.st-hint", {
          text: TOOLS.filter(function (t) { return t[0] === tool; })[0][2]
        }));

        panel.appendChild(h("div.side-label", { text: "Brush" }));
        panel.appendChild(DS.ui.sliderRow({
          label: "Size", min: 1, max: 16, step: 1, value: brush,
          format: function (v) { return v + ""; },
          onInput: function (v) { brush = v; }
        }));

        panel.appendChild(h("div.side-label", { text: "World" }));
        panel.appendChild(DS.ui.row("Trickle", "A slow pour from above.",
          DS.ui.toggle(pour, function (v) { pour = v; })));
        panel.appendChild(h("button.g-btn", {
          html: DS.icon("trash", 14) + "<span>Empty it</span>",
          style: { width: "100%", "margin-top": "10px" },
          onclick: function () {
            grid.fill(EMPTY); heat.fill(0); made = 0;
          }
        }));
        panel.appendChild(h("button.g-btn", {
          html: DS.icon("image", 14) + "<span>Save as picture</span>",
          style: { width: "100%", "margin-top": "6px" },
          onclick: function () {
            canvas.toBlob(function (blob) {
              DS.media.save(blob, "/Users/you/Pictures", "forge.png", "image")
                .then(function (p) {
                  DS.ui.toast({ icon: "image", title: "Saved to Pictures",
                                body: DS.fs.basename(p) });
                });
            }, "image/png");
          }
        }));

        panel.appendChild(h("p.st-hint", {
          style: { "margin-top": "16px" },
          text: "The glass you make is really transparent — the canvas has no " +
                "background, so finished panes let the window's own backdrop " +
                "through. Fill the bottom, melt it, and look at what is behind."
        }));
      }

      body.appendChild(h("div.lab-col", {}, [stage, status]));
      body.appendChild(panel);

      var ro = new ResizeObserver(function () { resize(); });
      ro.observe(stage);

      var statTimer = setInterval(function () {
        var sand = 0, molten = 0, glass = 0;
        for (var i = 0; i < grid.length; i++) {
          if (grid[i] === SAND) sand++;
          else if (grid[i] === MOLTEN) molten++;
          else if (grid[i] === GLASS) glass++;
        }
        DS.clear(status);
        status.appendChild(h("span", { text: "sand " + sand }));
        status.appendChild(h("span", { text: "molten " + molten }));
        status.appendChild(h("span", { text: "glass " + glass }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        status.appendChild(h("span", { text: made + " cells fired" }));
      }, 500);

      api.onClose = function () {
        if (raf) cancelAnimationFrame(raf);
        clearInterval(statTimer);
        ro.disconnect();
      };

      resize();
      renderPanel();
      loop();
    }
  });
})(window.DS);
