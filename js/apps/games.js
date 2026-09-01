/* ═══════════════════════════════════════════════════════════════
   games.js — the Games app, and the harness every game runs on

   Seven games in one window rather than seven dock icons. The shelf is
   the app; a game is a module that gets handed a stage and a small
   host object, and never has to think about scores, teardown,
   pausing, the canvas, or the fact that the desktop can be zoomed.

   The harness is the interesting part. Games are the one place in
   this system where a leak really shows: a stray rAF loop or a
   keydown listener that outlives its window keeps running against a
   dead DOM forever. So nothing here registers a timer, a listener or
   a frame loop directly — it all goes through the host, which tears
   the whole lot down on close.

   Progression (stats, achievements, unlockable looks) lives next
   door in js/core/awards.js; this file is its front end.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  /* ───────────────────── REGISTRY ─────────────────────
     Mirrors DS.apps deliberately: same shape, same ordering rule,
     so a game file reads like an app file. */
  var registry = {};
  var order = [];

  DS.games = {
    register: function (def) {
      registry[def.id] = def;
      order.push(def.id);

      if (def.skins) DS.awards.skins(def.id, def.skins);
      if (def.awards) {
        def.awards.forEach(function (a) {
          a.game = def.id;
          DS.awards.achievement(a);
        });
      }

      /* Every game is also an action, which means it is searchable,
         bindable to a key and reachable from `do` in the Terminal,
         for the price of these six lines. */
      if (DS.actions) {
        DS.actions.register({
          id: "game:" + def.id,
          label: "Play " + def.name,
          icon: "gamepad",
          group: "Games",
          run: function () { DS.wm.open("games", def.id); }
        });
      }
      return def;
    },
    get: function (id) { return registry[id]; },
    all: function () { return order.map(function (id) { return registry[id]; }); }
  };

  function fmt(def, v) {
    if (v === null || v === undefined) return "—";
    return def && def.format ? def.format(v) : String(v);
  }

  /* ───────────────────── PALETTE ─────────────────────
     Canvas cannot read a CSS custom property, so the theme has to be
     resolved into real colour strings. Cached, and refreshed when
     the theme or the accent moves under it. */
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    function raw(n, fb) { return (cs.getPropertyValue(n) || "").trim() || fb; }

    var hsl = {
      accent: raw("--accent", "192 100% 66%"),
      accent2: raw("--accent-2", "282 90% 74%"),
      ok: raw("--ok", "150 72% 56%"),
      danger: raw("--danger", "358 88% 66%")
    };
    var hi = raw("--edge-hi", "255 255 255");
    var lo = raw("--edge-lo", "0 0 0");

    var p = {
      hi: function (a) { return "rgb(" + hi + " / " + (a === undefined ? 1 : a) + ")"; },
      lo: function (a) { return "rgb(" + lo + " / " + (a === undefined ? 1 : a) + ")"; },
      /* an arbitrary hue, kept in the same key as the theme colours */
      hue: function (deg, a, sat, lum) {
        return "hsl(" + deg + " " + (sat || 88) + "% " + (lum || 66) + "%" +
               (a === undefined ? "" : " / " + a) + ")";
      }
    };
    Object.keys(hsl).forEach(function (k) {
      p[k] = function (a) {
        return "hsl(" + hsl[k] + (a === undefined ? "" : " / " + a) + ")";
      };
    });
    return p;
  }

  /* ═══════════════════════════════════════════════════
     THE HOST
     Built fresh for each game, torn down completely when the game
     is left. `chrome` is the score bar the app shell owns.
     ═══════════════════════════════════════════════════ */
  function makeHost(def, stage, api, chrome, goBack) {
    var timers = [];
    var frames = [];
    var offs = [];
    var dead = false;
    var score = 0;
    var P = readPalette();
    var skinCache = {};

    /* What you already had when this run started. The end card diffs
       against it, because an achievement usually lands *during* the
       run — Serpent banks "Century" on the bead that killed you — and
       reporting only what the final call happened to trip would leave
       the card blank for the very run that earned it. */
    var hadAwards = {};
    DS.awards.earnedIds().forEach(function (id) { hadAwards[id] = 1; });
    var hadSkins = {};
    DS.awards.skinCats(def.id).forEach(function (cat) {
      cat.items.forEach(function (it) {
        if (DS.awards.skinUnlocked(def.id, it)) hadSkins[cat.key + ":" + it.id] = 1;
      });
    });

    function earnedThisRun() {
      return DS.awards.all().filter(function (a) {
        return !hadAwards[a.id] && DS.awards.isEarned(a.id);
      });
    }
    function unlockedThisRun() {
      var out = [];
      DS.awards.skinCats(def.id).forEach(function (cat) {
        cat.items.forEach(function (it) {
          if (!hadSkins[cat.key + ":" + it.id] && DS.awards.skinUnlocked(def.id, it)) {
            out.push({ cat: cat, item: it });
          }
        });
      });
      return out;
    }

    var storeOff = DS.store.on(function (path) {
      if (/^(theme|accentHue|glass|finish)/.test(path)) {
        P = readPalette();
        if (g.onTheme) { try { g.onTheme(P); } catch (e) { console.error(e); } }
      }
      /* A look chosen in the locker takes effect on the next frame,
         with no restart — the game re-reads it as it draws. Only the
         *choice* triggers a repaint: a stat change can unlock a look
         but never selects one, and firing on every counter bump made
         Minesweeper repaint all 280 cells per revealed cell. */
      if (path === "games.skins") {
        skinCache = {};
        /* DOM games have no frame loop to notice on, so tell them */
        document.dispatchEvent(new CustomEvent("gm-skin"));
      } else if (path === "games.stats") {
        skinCache = {};
      }
    });
    offs.push(storeOff);

    function mine() { return DS.wm.focused() === api.win && !api.win._minimized; }

    var g = {
      stage: stage,
      win: api.win,
      api: api,
      chime: DS.chime,
      def: def,

      /* ── numbers on the bar ── */
      score: function (n) {
        score = n;
        chrome.score.textContent = fmt(def, n);
        return score;
      },
      bump: function (n) { return g.score(score + (n === undefined ? 1 : n)); },
      value: function () { return score; },
      best: function () { return DS.awards.best(def.id); },
      status: function (t) { chrome.status.textContent = t || ""; },

      palette: function () { return P; },

      /* ── progression ──
         A counter a game keeps about itself. Achievements and skins
         are thresholds on these, so bumping one may unlock something
         mid-game, which is exactly when it is most satisfying. */
      stat: function (key, n) {
        var v = DS.awards.stat(def.id, key, n);
        DS.awards.check();
        return v;
      },
      peak: function (key, v, low) {
        if (DS.awards.peak(def.id, key, v, low)) DS.awards.check();
      },
      /** The look to draw with, for one category. Live: change it in
          the locker and the next frame uses it. */
      skin: function (catKey) {
        if (!skinCache[catKey]) skinCache[catKey] = DS.awards.skin(def.id, catKey);
        return skinCache[catKey];
      },

      /* ── time, all of it revocable ── */
      after: function (fn, ms) {
        var t = setTimeout(function () { if (!dead) fn(); }, ms);
        timers.push(t);
        return t;
      },
      every: function (fn, ms) {
        var t = setInterval(function () { if (!dead) fn(); }, ms);
        timers.push(t);
        return t;
      },
      /* A frame loop that pauses itself the moment the window stops
         being the focused one. Nobody wants to come back to a window
         and find the snake has been running into a wall for a minute. */
      loop: function (fn) {
        var last = 0;
        var id = null;
        var wasAway = false;
        function step(t) {
          if (dead) return;
          id = requestAnimationFrame(step);
          if (!mine()) { wasAway = true; last = t; return; }
          if (wasAway) { wasAway = false; last = t; }
          var dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
          last = t;
          try { fn(dt, t); } catch (e) { console.error("[" + def.id + "]", e); }
        }
        id = requestAnimationFrame(step);
        frames.push(function () { cancelAnimationFrame(id); });
      },

      /* ── input ──
         Keyboard is global (nothing else can be listened to for a
         canvas), so every handler is gated on this window having
         focus, exactly as the Calculator does it. */
      key: function (fn) {
        function on(e) {
          if (!mine()) return;
          if (DS.qs(".dlg-veil") || !DS.qs("#launcher").hidden) return;
          if (stage.querySelector(".gm-locker")) return;
          var t = e.target;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
                    t.isContentEditable)) return;
          fn(e);
        }
        document.addEventListener("keydown", on);
        offs.push(function () { document.removeEventListener("keydown", on); });
      },

      /* Touch: one swipe reader for the whole arcade, so Snake and
         2048 are playable on a phone without a fake d-pad. */
      swipe: function (fn) {
        var sx = 0, sy = 0, live = false;
        function down(e) {
          if (e.pointerType === "mouse") return;
          live = true; sx = e.clientX; sy = e.clientY;
        }
        function up(e) {
          if (!live) return;
          live = false;
          var dx = e.clientX - sx, dy = e.clientY - sy;
          if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
          fn(Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? "right" : "left")
            : (dy > 0 ? "down" : "up"));
        }
        stage.addEventListener("pointerdown", down);
        stage.addEventListener("pointerup", up);
        stage.addEventListener("pointercancel", function () { live = false; });
        offs.push(function () {
          stage.removeEventListener("pointerdown", down);
          stage.removeEventListener("pointerup", up);
        });
      },

      on: function (el, type, fn, opts) {
        el.addEventListener(type, fn, opts);
        offs.push(function () { el.removeEventListener(type, fn, opts); });
      },

      /* ── a canvas that fits its box, at the right pixel density ──
         Measured with clientWidth, not a bounding rect: the desktop
         may be zoomed, and a rect would come back scaled. */
      canvas: function (onSize) {
        var cv = h("canvas.gm-canvas");
        stage.appendChild(cv);
        var ctx = cv.getContext("2d");
        var out = { el: cv, ctx: ctx, w: 0, h: 0 };

        function fit() {
          var w = cv.clientWidth, hh = cv.clientHeight;
          if (!w || !hh) return;
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(hh * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          out.w = w; out.h = hh;
          if (onSize) onSize(w, hh);
        }
        out.fit = fit;

        if (window.ResizeObserver) {
          var ro = new ResizeObserver(fit);
          ro.observe(cv);
          offs.push(function () { ro.disconnect(); });
        } else {
          g.on(window, "resize", fit);
        }
        requestAnimationFrame(fit);
        return out;
      },

      /* ── the end of a game ── */
      over: function (opts) {
        var o = typeof opts === "string" ? { title: opts } : (opts || {});
        var val = o.score === undefined ? score : o.score;
        /* A best time means nothing if you lost, so a game may decline
           to file the result: Minesweeper only records a win. */
        var got = DS.awards.finish(def, val, { win: o.win, record: o.record });
        chrome.paintBest();
        var fresh = earnedThisRun();
        var newSkins = unlockedThisRun();

        var card = h("div.gm-over.g", {}, [
          h("div.gm-over-mark", {
            html: got.beat ? DS.icon("star", 26) : DS.icon(o.icon || "gamepad", 26)
          }),
          h("b", { text: o.title || (o.win ? "Cleared" : "Game over") }),
          h("p", { text: o.body || "" }),
          h("div.gm-over-score", {}, [
            h("span", { text: (def.scoreLabel || "Score") + " " }),
            h("b", { text: fmt(def, val) })
          ]),
          /* A first game that scored nothing is not an achievement,
             so the banner waits until there is something to beat. */
          got.beat && (val > 0 || def.low)
            ? h("div.gm-over-new", { text: "A new best." }) : null,

          fresh.length || newSkins.length
            ? h("div.gm-over-earn", {}, [].concat(
                fresh.map(function (a) {
                  return h("div.gm-earn-row", {}, [
                    h("span.gm-earn-ico", { html: DS.icon(a.icon || "star", 13) }),
                    h("span", { text: a.name })
                  ]);
                }),
                newSkins.map(function (sk) {
                  return h("div.gm-earn-row", {}, [
                    h("span.gm-earn-ico", { html: DS.icon("palette", 13) }),
                    h("span", { text: sk.item.label + " unlocked" })
                  ]);
                })
              ))
            : null,

          h("div.gm-over-btns", {}, [
            h("button.g-btn.g-btn-lg", {
              html: DS.icon("chevL", 14) + "<span>Shelf</span>",
              onclick: function () { goBack(); }
            }),
            h("button.g-btn.g-btn-lg.g-btn-accent", {
              html: DS.icon("refresh", 14) + "<span>Play again</span>",
              onclick: function () { g.restart(); }
            })
          ])
        ]);
        stage.appendChild(card);
        DS.glass.dress(card);
        if (o.win) DS.chime.done();
        g.ended = true;
        return card;
      },

      restart: function () { chrome.restart(); },
      ended: false
    };

    g.destroy = function () {
      dead = true;
      timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
      frames.forEach(function (f) { f(); });
      offs.forEach(function (f) { try { f(); } catch (e) {} });
      timers = []; frames = []; offs = [];
    };

    return g;
  }

  /* ═══════════════════════════════════════════════════
     THE APP
     ═══════════════════════════════════════════════════ */
  DS.apps.register({
    id: "games",
    name: "Games",
    icon: "gamepad",
    w: 820, h: 620, minW: 380, minH: 420,
    flush: true,

    mount: function (body, api) {
      var current = null;      // the live host
      var currentId = null;
      var tab = "games";

      /* ── shelf ── */
      var tabsHost = h("div.gm-tabs");
      var newDot = h("span.gm-dot", { hidden: true });

      var grid = h("div.gm-grid");
      var awardsPane = h("div.gm-awards", { hidden: true });
      var scoresPane = h("div.gm-scores", { hidden: true });

      var shelfHead = h("div.gm-head", {}, [
        h("div.gm-headrow", {}, [
          h("div", {}, [
            h("h2", { text: "Games" }),
            h("p", { text: "Seven small games, made of the same glass as everything " +
                           "else. Play them and they give things back." })
          ]),
          tabsHost
        ])
      ]);
      var shelf = h("div.gm-shelf", {}, [shelfHead, grid, awardsPane, scoresPane]);

      /* ── play view ── */
      var titleEl = h("div.gm-title");
      var scoreEl = h("b.gm-num", { text: "0" });
      var bestEl = h("b.gm-num", { text: "—" });
      var scoreLab = h("span.gm-lab", { text: "Score" });
      var statusEl = h("div.gm-status");
      var hintEl = h("div.gm-hint");

      var backBtn = h("button.g-btn.g-btn-sq", {
        html: DS.icon("chevL", 15), title: "Back to the shelf",
        onclick: function () { toShelf(); }
      });
      var lockerBtn = h("button.g-btn.g-btn-sq.gm-lockbtn", {
        html: DS.icon("palette", 15), title: "Looks",
        onclick: function () { toggleLocker(); }
      });
      var againBtn = h("button.g-btn", {
        html: DS.icon("refresh", 14) + "<span>Restart</span>",
        onclick: function () { if (currentId) openGame(currentId); }
      });

      var bar = h("div.app-toolbar.gm-bar", {}, [
        backBtn,
        titleEl,
        h("div", { style: { flex: "1" } }),
        h("div.gm-chip", {}, [scoreLab, scoreEl]),
        h("div.gm-chip", {}, [h("span.gm-lab", { text: "Best" }), bestEl]),
        lockerBtn,
        againBtn
      ]);
      var stage = h("div.gm-stage");
      var foot = h("div.app-statusbar.gm-foot", {}, [hintEl, statusEl]);
      var play = h("div.gm-play", { hidden: true }, [bar, stage, foot]);

      body.appendChild(h("div.gm-root", {}, [shelf, play]));

      var chrome = {
        score: scoreEl,
        best: bestEl,
        status: statusEl,
        restart: function () { if (currentId) openGame(currentId); },
        paintBest: function () {
          var def = DS.games.get(currentId);
          bestEl.textContent = fmt(def, DS.awards.best(currentId));
        }
      };

      /* ───────────── tabs ───────────── */
      function paintTabs() {
        DS.clear(tabsHost);
        var unseen = DS.awards.unseen();
        newDot.hidden = !unseen;
        newDot.textContent = unseen > 9 ? "9+" : String(unseen);

        [["games", "Games"], ["awards", "Achievements"], ["scores", "Scores"]]
          .forEach(function (t) {
            var btn = h("button.gm-tab" + (tab === t[0] ? ".on" : ""), {
              onclick: function () { showTab(t[0]); }
            }, [h("span", { text: t[1] })]);
            if (t[0] === "awards") btn.appendChild(newDot);
            tabsHost.appendChild(btn);
          });
      }

      function showTab(which) {
        tab = which;
        grid.hidden = which !== "games";
        awardsPane.hidden = which !== "awards";
        scoresPane.hidden = which !== "scores";
        if (which === "awards") { paintAwards(); DS.awards.markSeen(); }
        if (which === "scores") paintScores();
        if (which === "games") paintShelf();
        paintTabs();
      }

      /* ───────────── the shelf ───────────── */
      function paintShelf() {
        DS.clear(grid);
        DS.games.all().forEach(function (def) {
          var b = DS.awards.best(def.id);
          var plays = DS.awards.plays(def.id);
          var a = DS.awards.tally(def.id);
          var sk = DS.awards.skinTally(def.id);

          var tile = h("button.gm-tile.g-card", {
            data: { game: def.id },
            onclick: function () { openGame(def.id); }
          }, [
            h("div.gm-art", { html: def.art || "" }),
            h("div.gm-tname", { text: def.name }),
            h("div.gm-tblurb", { text: def.blurb || "" }),
            h("div.gm-tmeta", {}, [
              h("span.gm-tm", { title: "Achievements" }, [
                h("span", { html: DS.icon("star", 11) }),
                h("span", { text: a.got + "/" + a.total })
              ]),
              h("span.gm-tm", { title: "Looks unlocked" }, [
                h("span", { html: DS.icon("palette", 11) }),
                h("span", { text: sk.got + "/" + sk.total })
              ])
            ]),
            h("div.gm-tfoot", {}, [
              h("span.gm-tag", { text: def.tag || "Game" }),
              h("span.gm-tbest", {
                text: b === null
                  ? (plays ? "Unfinished" : "Never played")
                  : (def.scoreLabel || "Best") + " " + fmt(def, b)
              })
            ])
          ]);
          grid.appendChild(tile);
        });
        DS.glass.dress(grid);
      }

      /* ───────────── achievements ───────────── */
      function paintAwards() {
        DS.clear(awardsPane);
        var overall = DS.awards.tally();

        awardsPane.appendChild(h("div.gm-sum.g-card", {}, [
          h("div.gm-sum-n", {}, [
            h("b", { text: String(overall.got) }),
            h("span", { text: " / " + overall.total })
          ]),
          h("div.gm-sum-lab", { text: "achievements earned" }),
          h("div.gm-bar-track", {}, [
            h("i", { style: { width: (overall.total ? overall.got / overall.total * 100 : 0) + "%" } })
          ])
        ]));

        var groups = DS.games.all().map(function (d) {
          return { title: d.name, icon: d.icon, items: DS.awards.forGame(d.id) };
        });
        groups.push({
          title: "Across every game", icon: "gamepad",
          items: DS.awards.all().filter(function (a) { return !a.game; })
        });

        groups.forEach(function (grp) {
          if (!grp.items.length) return;
          var got = grp.items.filter(function (a) { return DS.awards.isEarned(a.id); }).length;
          awardsPane.appendChild(h("div.gm-grouphead", {}, [
            h("span", { text: grp.title }),
            h("span.gm-groupn", { text: got + " of " + grp.items.length })
          ]));

          var row = h("div.gm-awgrid");
          grp.items.forEach(function (a) {
            var earned = DS.awards.isEarned(a.id);
            var prog = earned ? null : DS.awards.progress(a);
            var tier = DS.awards.TIERS[a.tier] || DS.awards.TIERS.bronze;

            row.appendChild(h("div.gm-aw" + (earned ? ".got" : ""), {
              style: { "--hue": String(tier.hue) }
            }, [
              h("div.gm-aw-medal", { html: DS.icon(a.icon || "star", 18) }),
              h("div.gm-aw-txt", {}, [
                h("b", { text: a.name }),
                h("p", { text: a.hint }),
                earned
                  ? h("span.gm-aw-when", {
                      text: "Earned " + DS.when(DS.awards.earnedAt(a.id))
                    })
                  : prog
                    ? h("div.gm-aw-prog", {}, [
                        h("div.gm-bar-track", {}, [
                          h("i", { style: { width: (prog[1] ? prog[0] / prog[1] * 100 : 0) + "%" } })
                        ]),
                        h("span", { text: prog[0] + " / " + prog[1] })
                      ])
                    : h("span.gm-aw-when", { text: "Locked" })
              ])
            ]));
          });
          awardsPane.appendChild(row);
        });
        DS.glass.dress(awardsPane);
      }

      /* ───────────── scores ───────────── */
      function paintScores() {
        DS.clear(scoresPane);
        var table = h("div.gm-table");
        table.appendChild(h("div.gm-tr.gm-th", {}, [
          h("div.gm-td-game", { text: "Game" }),
          h("div", { text: "Best" }),
          h("div", { text: "Runs" }),
          h("div", { text: "Cleared" }),
          h("div.gm-td-when", { text: "Last played" })
        ]));

        DS.games.all().forEach(function (def) {
          var st = DS.awards.stats(def.id);
          var b = DS.awards.best(def.id);
          var last = DS.awards.lastPlayed(def.id);
          table.appendChild(h("div.gm-tr", {
            onclick: function () { openGame(def.id); }
          }, [
            h("div.gm-td-game", {}, [
              h("span.gm-td-ico", { html: DS.icon("gamepad", 14) }),
              h("span", { text: def.name }),
              h("span.gm-td-tag", { text: def.tag || "" })
            ]),
            h("div", {}, [
              h("b", { text: fmt(def, b) }),
              h("span.gm-td-unit", { text: " " + (def.scoreLabel || "").toLowerCase() })
            ]),
            h("div", { text: String(st.runs || 0) }),
            h("div", { text: String(st.wins || 0) }),
            h("div.gm-td-when", { text: last ? DS.when(last) : "—" })
          ]));
        });
        scoresPane.appendChild(table);

        /* the tallies each game keeps about itself */
        var facts = h("div.gm-facts");
        DS.games.all().forEach(function (def) {
          if (!def.counters || !def.counters.length) return;
          var st = DS.awards.stats(def.id);
          facts.appendChild(h("div.gm-fact.g-card", {}, [
            h("b", { text: def.name }),
            h("div.gm-fact-rows", {}, def.counters.map(function (c) {
              return h("div.gm-fact-row", {}, [
                h("span", { text: c.label }),
                h("b", { text: c.format ? c.format(st[c.key] || 0) : String(st[c.key] || 0) })
              ]);
            }))
          ]));
        });
        if (facts.children.length) {
          scoresPane.appendChild(h("div.gm-grouphead", {}, [h("span", { text: "Tallies" })]));
          scoresPane.appendChild(facts);
        }
        DS.glass.dress(scoresPane);
      }

      /* ───────────── the locker ─────────────
         A sheet over the stage rather than a separate screen: you
         pick a look and see it on the board behind you, because the
         host re-reads the choice on the next frame. */
      function closeLocker() {
        var el = DS.qs(".gm-locker", stage);
        if (el && el.parentNode) el.parentNode.removeChild(el);
        lockerBtn.classList.remove("on");
      }

      function toggleLocker() {
        if (DS.qs(".gm-locker", stage)) { closeLocker(); return; }
        if (!currentId) return;
        lockerBtn.classList.add("on");

        var cats = DS.awards.skinCats(currentId);
        var panel = h("div.gm-locker.g", {}, [
          h("div.gm-lk-head", {}, [
            h("b", { text: "Looks" }),
            h("button.g-btn.g-btn-sq", {
              html: DS.icon("x", 14), title: "Close", onclick: closeLocker
            })
          ])
        ]);

        if (!cats.length) {
          panel.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("palette", 26) }),
            h("div", { text: "This one has no looks to unlock." })
          ]));
        }

        cats.forEach(function (cat) {
          panel.appendChild(h("div.gm-lk-cat", { text: cat.label }));
          var row = h("div.gm-lk-row");
          var chosen = DS.awards.skin(currentId, cat.key);

          cat.items.forEach(function (it) {
            var open = DS.awards.skinUnlocked(currentId, it);
            var el = h("button.gm-lk-item" +
                       (it.id === chosen.id ? ".on" : "") + (open ? "" : ".locked"), {
              title: open ? it.label : DS.awards.skinNote(it)
            }, [
              h("span.gm-lk-swatch", {
                html: it.swatch || "",
                style: it.hue === undefined || it.hue === null
                  ? null : { "--hue": String(it.hue) }
              }),
              h("span.gm-lk-name", { text: it.label }),
              h("span.gm-lk-note", { text: open ? "" : DS.awards.skinNote(it) }),
              open ? null : h("span.gm-lk-lock", { html: DS.icon("lock", 12) })
            ]);
            if (open) {
              el.addEventListener("click", function () {
                DS.awards.choose(currentId, cat.key, it.id);
                DS.chime.tick();
                closeLocker();
                toggleLocker();
              });
            }
            row.appendChild(el);
          });
          panel.appendChild(row);
        });

        stage.appendChild(panel);
        DS.glass.dress(panel);
      }

      /* ───────────── switching views ───────────── */
      function teardown() {
        if (current) { current.destroy(); current = null; }
        DS.clear(stage);
        lockerBtn.classList.remove("on");
      }

      function toShelf() {
        teardown();
        currentId = null;
        play.hidden = true;
        shelf.hidden = false;
        api.setTitle("Games");
        showTab(tab);
      }

      function openGame(id) {
        var def = DS.games.get(id);
        if (!def) { toShelf(); return; }

        teardown();
        currentId = id;
        shelf.hidden = true;
        play.hidden = false;

        titleEl.textContent = def.name;
        scoreLab.textContent = def.scoreLabel || "Score";
        hintEl.textContent = def.keys || "";
        statusEl.textContent = "";
        api.setTitle("Games — " + def.name);
        chrome.paintBest();
        lockerBtn.hidden = !DS.awards.skinCats(id).length;

        current = makeHost(def, stage, api, chrome, toShelf);
        current.score(def.start === undefined ? 0 : def.start);

        try {
          def.play(stage, current);
        } catch (e) {
          console.error("[" + id + "] failed to start", e);
          stage.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("info", 30) }),
            h("div", { text: def.name + " failed to start." }),
            h("div", { text: String(e && e.message || e),
                       style: { "font-size": "11px" } })
          ]));
        }
        DS.glass.dress(stage);
      }

      api.onClose = function () { teardown(); };

      /** Used by the notifications awards.js raises, so "Open the
          locker" lands on the right game with the sheet already up. */
      api.showPane = function (pane, gameId) {
        if (pane === "locker" && gameId) {
          openGame(gameId);
          setTimeout(toggleLocker, 60);
          return;
        }
        toShelf();
        showTab(pane === "awards" ? "awards" : pane === "scores" ? "scores" : "games");
      };
      api.openGame = openGame;

      showTab("games");
      if (api.arg && DS.games.get(api.arg)) openGame(api.arg);
    },

    onArg: function (api, arg) {
      if (api.openGame && DS.games.get(arg)) api.openGame(arg);
    }
  });
})(window.DS);
