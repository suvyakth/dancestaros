/* ═══════════════════════════════════════════════════════════════
   focus.js (app) — a window onto DS.focus

   Flowmodoro is the default because it is the more interesting of
   the two: instead of forcing work into 25-minute boxes, the timer
   counts *up* for as long as the work lasts, and the break you have
   earned is that time divided by a ratio. Fifty minutes of focus
   buys ten minutes off.

   Pomodoro is here too, for when the box helps.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  DS.apps.register({
    id: "focus",
    name: "Focus",
    icon: "star",
    w: 560, h: 580, minW: 420, minH: 460,

    mount: function (body, api) {
      var cfg = function () { return DS.store.get("focus", {}); };

      /* ── mode ── */
      var modeSeg = DS.ui.segmented(
        [{ label: "Flowmodoro", value: "flow" }, { label: "Pomodoro", value: "pomodoro" }],
        cfg().mode,
        function (v) {
          DS.store.set("focus.mode", v);
          DS.focus.reset();
          renderTail();
        }
      );
      body.appendChild(h("div.fo-modes", {}, [modeSeg]));

      /* ── the dial ── */
      var ring = h("div.fo-ring", { html:
        '<svg viewBox="0 0 120 120">' +
        '<circle class="bg" cx="60" cy="60" r="54"/>' +
        '<circle class="fg" cx="60" cy="60" r="54"/></svg>' });
      var fg = DS.qs(".fg", ring);
      var C = 2 * Math.PI * 54;
      fg.style.strokeDasharray = C;

      var big = h("div.fo-time", { text: "0:00" });
      var lab = h("div.fo-label", { text: "Ready" });
      var earn = h("div.fo-earn");

      body.appendChild(h("div.fo-dial", {}, [
        ring, h("div.fo-center", {}, [big, lab, earn])
      ]));

      /* ── transport ── */
      var goBtn = h("button.g-btn.g-btn-accent.fo-go", {
        html: DS.icon("play", 18) + "<span>Start</span>",
        onclick: function () { DS.chime.unlock(); DS.focus.toggle(); }
      });
      var breakBtn = h("button.g-btn.g-btn-lg", {
        html: DS.icon("clock", 15) + "<span>Take break</span>",
        onclick: function () { DS.focus.skip(); }
      });
      var stopBtn = h("button.g-btn.g-btn-lg", {
        html: DS.icon("x", 15) + "<span>End</span>",
        onclick: function () { DS.focus.stop(); }
      });
      body.appendChild(h("div.fo-btns", {}, [breakBtn, goBtn, stopBtn]));

      /* ── today + week ── */
      var todayEl = h("b", { text: "0m" });
      var barsEl = h("div.fo-bars");
      var tail = h("div.fo-tail");
      body.appendChild(tail);

      function renderTail() {
        DS.clear(tail);
        var c = cfg();

        tail.appendChild(h("div.g-card.fo-today", {}, [
          h("span", { text: "Focused today" }), todayEl
        ]));

        tail.appendChild(DS.ui.section("Last 7 days"));
        tail.appendChild(barsEl);
        paintWeek();

        tail.appendChild(DS.ui.section("Settings"));
        if (c.mode === "flow") {
          tail.appendChild(DS.ui.sliderRow({
            label: "Break ratio", min: 2, max: 10, step: 1, value: c.ratio,
            format: function (v) { return "1 : " + v; },
            onInput: function (v) { DS.store.set("focus.ratio", v); paintEarn(); }
          }));
          tail.appendChild(h("div.st-hint", {
            text: "Focus time divided by this is the break you earn. At 1:5, " +
                  "fifty minutes of work buys ten minutes off."
          }));
          tail.appendChild(DS.ui.sliderRow({
            label: "Shortest break", min: 1, max: 15, step: 1, value: c.minBreak,
            format: function (v) { return v + "m"; },
            onInput: function (v) { DS.store.set("focus.minBreak", v); }
          }));
          tail.appendChild(DS.ui.sliderRow({
            label: "Longest break", min: 5, max: 60, step: 5, value: c.maxBreak,
            format: function (v) { return v + "m"; },
            onInput: function (v) { DS.store.set("focus.maxBreak", v); }
          }));
        } else {
          var p = c.pomo || {};
          [["work", "Focus", 5, 60, 5], ["short", "Short break", 1, 20, 1],
           ["long", "Long break", 5, 45, 5]].forEach(function (row) {
            tail.appendChild(DS.ui.sliderRow({
              label: row[1], min: row[2], max: row[3], step: row[4], value: p[row[0]],
              format: function (v) { return v + "m"; },
              onInput: function (v) { DS.store.set("focus.pomo." + row[0], v); }
            }));
          });
          tail.appendChild(DS.ui.sliderRow({
            label: "Long break every", min: 2, max: 8, step: 1, value: p.cycles,
            format: function (v) { return v + " rounds"; },
            onInput: function (v) { DS.store.set("focus.pomo.cycles", v); }
          }));
        }

        tail.appendChild(DS.ui.row("Chime", "A short synthesised bell at each change.",
          DS.ui.toggle(c.chime !== false, function (v) {
            DS.store.set("focus.chime", v);
            if (v) { DS.chime.unlock(); DS.chime.done(); }
          })));

        tail.appendChild(DS.ui.row("Desktop widget", "A small version on the desktop.",
          h("button.g-btn", {
            text: DS.widgets.has("focus") ? "Added" : "Add",
            onclick: function (e) {
              if (DS.widgets.has("focus")) return;
              DS.widgets.add("focus");
              e.target.textContent = "Added";
            }
          })));

        DS.glass.dress(tail);
      }

      function paintWeek() {
        DS.clear(barsEl);
        var week = DS.focus.week(7);
        var max = Math.max(1, Math.max.apply(null, week.map(function (d) { return d.ms; })));
        week.forEach(function (d) {
          var pct = (d.ms / max) * 100;
          barsEl.appendChild(h("div.fo-bar", {
            title: DS.hms(d.ms) + " on " + d.day.toLocaleDateString()
          }, [
            h("div.fo-bt", {}, [h("i", { style: { height: Math.max(2, pct) + "%" } })]),
            h("span", { text: "SMTWTFS".charAt(d.day.getDay()) })
          ]));
        });
      }

      function paintEarn() {
        var s = DS.focus.snapshot();
        earn.textContent = s.phase === "focus" && s.countingUp
          ? "earns " + DS.hms(DS.focus.breakFor(s.elapsed)) + " off"
          : s.phase === "break" ? "enjoy it" : "";
      }

      /* ── live binding ── */
      var unsub = DS.focus.on(function (s) {
        big.textContent = s.display;
        lab.textContent = s.label;
        fg.style.strokeDashoffset = C * (1 - s.progress);
        body.dataset.phase = s.phase;
        goBtn.innerHTML = DS.icon(s.running ? "pause" : "play", 18) +
                          "<span>" + (s.phase === "idle" ? "Start"
                            : s.running ? "Pause" : "Resume") + "</span>";
        breakBtn.disabled = s.phase === "idle";
        stopBtn.disabled = s.phase === "idle";
        todayEl.textContent = DS.hms(DS.focus.todayMs());
        paintEarn();
        api.setTitle(s.phase === "idle" ? "Focus" : s.display + " — " + s.label);
      });

      api.onClose = function () {
        unsub();
        if (DS.focus.snapshot().phase !== "idle") {
          DS.ui.toast({
            icon: "star",
            title: "Still running",
            body: "The timer keeps going. Add the Focus widget to watch it."
          });
        }
      };

      renderTail();
      // refresh the week chart when a session lands
      setInterval(paintWeek, 30000);
    }
  });
})(window.DS);
