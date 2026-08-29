/* ═══════════════════════════════════════════════════════════════
   focus.js — the Flowmodoro / Pomodoro engine

   Kept out of the app window on purpose: the timer has to keep
   running when the Focus window is closed, and the desktop widget
   and the app are two views of one clock.

   Flowmodoro  work for as long as the work wants to last — the timer
               counts UP — then take a break of elapsed / ratio.
               (default ratio 5, so 50 minutes of focus earns 10.)
   Pomodoro    the fixed version: 25 up-front, 5 short, 15 long
               after every 4 cycles.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var st = {
    phase: "idle",     // idle | focus | break
    running: false,
    startedAt: 0,      // when the current run segment began
    accrued: 0,        // ms banked in this phase before the last pause
    targetMs: 0,       // 0 means "count up, no target"
    cycle: 0
  };

  var subs = [];
  var loop = null;

  function cfg() { return DS.store.get("focus", {}); }
  function now() { return Date.now(); }

  function emit() {
    subs.forEach(function (fn) {
      try { fn(focus.snapshot()); } catch (e) { console.error(e); }
    });
  }

  function startLoop() {
    if (loop) return;
    loop = setInterval(function () {
      if (st.running && st.targetMs && focus.remaining() <= 0) advance(true);
      emit();
    }, 250);
  }

  function elapsed() {
    return st.accrued + (st.running ? now() - st.startedAt : 0);
  }

  /** How long a break the given amount of focus has earned. */
  function breakFor(ms) {
    var c = cfg();
    var mins = (ms / 60000) / (c.ratio || 5);
    return DS.clamp(mins, c.minBreak || 3, c.maxBreak || 30) * 60000;
  }

  function logSession(ms) {
    if (ms < 30000) return;   // do not clutter the log with false starts
    var list = DS.store.get("focus.sessions", []);
    list.push({ start: now() - ms, ms: ms, mode: cfg().mode });
    // keep a fortnight
    var cutoff = now() - 14 * 86400000;
    DS.store.set("focus.sessions", list.filter(function (s) { return s.start > cutoff; }));
  }

  function enter(phase, targetMs, autoRun) {
    st.phase = phase;
    st.accrued = 0;
    st.targetMs = targetMs || 0;
    st.startedAt = now();
    st.running = !!autoRun;
    if (st.running) startLoop();
    emit();
  }

  /** Move to whatever comes next. `auto` means a countdown ran out. */
  function advance(auto) {
    var c = cfg();
    if (st.phase === "focus") {
      var spent = elapsed();
      logSession(spent);
      if (c.chime !== false) DS.chime.done();
      st.cycle += 1;

      var brk;
      if (c.mode === "pomodoro") {
        var p = c.pomo || {};
        var isLong = st.cycle % (p.cycles || 4) === 0;
        brk = (isLong ? (p.long || 15) : (p.short || 5)) * 60000;
      } else {
        brk = breakFor(spent);
      }
      enter("break", brk, true);
      if (auto) {
        DS.ui.toast({
          icon: "clock",
          title: "Focus complete",
          body: DS.hms(spent) + " of focus. Break: " + DS.hms(brk) + ".",
          timeout: 9000,
          action: { label: "Open Focus", run: function () { DS.wm.open("focus"); } }
        });
      }
      return;
    }

    if (st.phase === "break") {
      if (c.chime !== false) DS.chime.back();
      if (auto) {
        DS.ui.toast({
          icon: "clock",
          title: "Break over",
          body: "Ready when you are.",
          timeout: 8000
        });
      }
      enter("idle", 0, false);
      return;
    }

    focus.start();
  }

  var focus = {
    /* ── transport ── */
    start: function () {
      var c = cfg();
      DS.chime.unlock();
      var target = c.mode === "pomodoro" ? (c.pomo && c.pomo.work || 25) * 60000 : 0;
      enter("focus", target, true);
    },

    pause: function () {
      if (!st.running) return;
      st.accrued = elapsed();
      st.running = false;
      emit();
    },

    resume: function () {
      if (st.running || st.phase === "idle") return;
      st.startedAt = now();
      st.running = true;
      startLoop();
      emit();
    },

    toggle: function () {
      if (st.phase === "idle") focus.start();
      else if (st.running) focus.pause();
      else focus.resume();
    },

    /** End the focus block early and take the break it earned. */
    breakNow: function () {
      if (st.phase !== "focus") return;
      advance(false);
    },

    /** Skip whatever phase is running. */
    skip: function () { advance(false); },

    stop: function () {
      if (st.phase === "focus") logSession(elapsed());
      st.phase = "idle";
      st.running = false;
      st.accrued = 0;
      st.targetMs = 0;
      emit();
    },

    reset: function () {
      focus.stop();
      st.cycle = 0;
      emit();
    },

    /* ── reads ── */
    elapsed: elapsed,
    remaining: function () {
      return st.targetMs ? Math.max(0, st.targetMs - elapsed()) : 0;
    },
    /** 0..1 for countdown phases; for count-up, progress toward the
        next whole "earned break minute" so the ring still moves. */
    progress: function () {
      if (st.targetMs) return DS.clamp(elapsed() / st.targetMs, 0, 1);
      var per = (cfg().ratio || 5) * 60000;
      return (elapsed() % per) / per;
    },
    breakFor: breakFor,

    /** The number a display should show. */
    display: function () {
      return st.targetMs ? DS.hms(focus.remaining()) : DS.hms(elapsed());
    },

    label: function () {
      if (st.phase === "idle") return "Ready";
      if (st.phase === "break") return st.running ? "Break" : "Break paused";
      return st.running ? "Focusing" : "Paused";
    },

    snapshot: function () {
      return {
        phase: st.phase,
        running: st.running,
        cycle: st.cycle,
        elapsed: elapsed(),
        remaining: focus.remaining(),
        progress: focus.progress(),
        display: focus.display(),
        label: focus.label(),
        countingUp: !st.targetMs
      };
    },

    /** Total focused milliseconds since local midnight. */
    todayMs: function () {
      var midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      var live = st.phase === "focus" ? elapsed() : 0;
      return DS.store.get("focus.sessions", []).reduce(function (sum, s) {
        return s.start >= midnight.getTime() ? sum + s.ms : sum;
      }, 0) + live;
    },

    /** [{day: Date, ms}] for the last n days, oldest first. */
    week: function (n) {
      var days = [];
      var sessions = DS.store.get("focus.sessions", []);
      for (var i = (n || 7) - 1; i >= 0; i--) {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        var end = d.getTime() + 86400000;
        days.push({
          day: new Date(d),
          ms: sessions.reduce(function (sum, s) {
            return s.start >= d.getTime() && s.start < end ? sum + s.ms : sum;
          }, 0)
        });
      }
      return days;
    },

    on: function (fn) {
      subs.push(fn);
      fn(focus.snapshot());
      return function () {
        var i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    }
  };

  DS.focus = focus;
})(window.DS);
