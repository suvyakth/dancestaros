/* ═══════════════════════════════════════════════════════════════
   time.js — chimes + the alarm daemon

   Two things live here because they belong to the system, not to a
   window: the sound synthesis (there are no audio files in this
   project, so every sound is oscillators) and the alarm checker,
   which must keep running whether or not the Clock app is open.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  /* ───────────────────── CHIMES ───────────────────── */
  var ctx = null;

  function audio() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  /** One bell-ish note: sine fundamental + a quiet fifth, fast decay. */
  function note(freq, when, dur, gain) {
    var c = audio();
    if (!c) return;
    var t = c.currentTime + when;

    [[freq, 1], [freq * 1.5, 0.28], [freq * 2, 0.14]].forEach(function (pair) {
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = "sine";
      osc.frequency.value = pair[0];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * pair[1], t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }

  var chime = {
    /** Soft two-note rise — a session finishing. */
    done: function () {
      note(587.33, 0,    1.5, 0.16);   // D5
      note(880.00, 0.16, 1.9, 0.13);   // A5
    },
    /** Three-note fall — a break finishing, back to work. */
    back: function () {
      note(880.00, 0,    1.0, 0.13);
      note(698.46, 0.14, 1.1, 0.13);
      note(587.33, 0.28, 1.6, 0.15);
    },
    /** Insistent repeating pair — an alarm. */
    alarm: function () {
      for (var i = 0; i < 5; i++) {
        note(987.77, i * 0.62, 0.34, 0.17);
        note(1318.5, i * 0.62 + 0.16, 0.34, 0.14);
      }
    },
    /** Tiny click — a lap, a tick. */
    tick: function () { note(1568, 0, 0.07, 0.05); },

    /** A gesture is needed before audio may start; call from a click. */
    unlock: function () {
      var c = audio();
      if (c && c.state === "suspended") c.resume();
    }
  };

  /* ───────────────────── ALARM DAEMON ─────────────────────
     Checks every 10 seconds. An alarm records the minute it last
     fired so a slow tab cannot double-ring, and so an alarm set for
     a time that has already passed today does not fire immediately. */
  var daemon = null;

  function stamp(d) {
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() +
           "-" + d.getHours() + "-" + d.getMinutes();
  }

  function check() {
    var now = new Date();
    var alarms = DS.store.get("clock.alarms", []);
    var changed = false;

    alarms.forEach(function (a) {
      if (!a.on) return;
      if (a.h !== now.getHours() || a.m !== now.getMinutes()) return;
      if (a.days && a.days.length && a.days.indexOf(now.getDay()) < 0) return;
      var key = stamp(now);
      if (a.lastFired === key) return;

      a.lastFired = key;
      changed = true;
      fire(a);

      // one-shot alarms switch themselves off after ringing
      if (!a.days || !a.days.length) a.on = false;
    });

    if (changed) DS.store.set("clock.alarms", alarms);

    // one clock decides when anything fires, calendar reminders included
    if (DS.calendarCheck) {
      try { DS.calendarCheck(); } catch (e) { console.error(e); }
    }
  }

  function fire(a) {
    chime.alarm();
    var t = pad2(a.h) + ":" + pad2(a.m);
    DS.ui.toast({
      icon: "bell",
      title: a.label || "Alarm",
      body: t + " — " + (a.days && a.days.length ? "repeating" : "one-off"),
      timeout: 12000,
      action: {
        label: "Open Clock",
        run: function () { DS.wm.open("clock", { tab: "alarm" }); }
      }
    });
    // flash the desktop once, so a muted tab still shows something
    var d = DS.qs("#desktop");
    if (d) {
      d.classList.add("alarm-flash");
      setTimeout(function () { d.classList.remove("alarm-flash"); }, 1400);
    }
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var alarms = {
    start: function () {
      if (daemon) return;
      // mark anything already in the past today as fired, so enabling
      // the daemon never rings for a time that has gone by
      var now = new Date();
      var list = DS.store.get("clock.alarms", []);
      list.forEach(function (a) {
        if (a.h < now.getHours() ||
            (a.h === now.getHours() && a.m <= now.getMinutes())) {
          a.lastFired = stamp(now);
        }
      });
      DS.store.set("clock.alarms", list);
      daemon = setInterval(check, 10000);
    },
    stop: function () {
      if (daemon) clearInterval(daemon);
      daemon = null;
    },
    check: check,
    fire: fire,

    /** Next upcoming enabled alarm, or null. Used by the widget. */
    next: function () {
      var list = DS.store.get("clock.alarms", []).filter(function (a) { return a.on; });
      if (!list.length) return null;
      var now = new Date();
      var best = null, bestDelta = Infinity;
      list.forEach(function (a) {
        for (var d = 0; d < 8; d++) {
          var when = new Date(now);
          when.setDate(now.getDate() + d);
          when.setHours(a.h, a.m, 0, 0);
          if (when <= now) continue;
          if (a.days && a.days.length && a.days.indexOf(when.getDay()) < 0) continue;
          var delta = when - now;
          if (delta < bestDelta) { bestDelta = delta; best = { alarm: a, at: when }; }
          break;
        }
      });
      return best;
    },

    pad2: pad2
  };

  /** "in 3h 12m" */
  DS.until = function (ms) {
    var mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return "in " + mins + "m";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return "in " + hrs + "h " + (mins % 60) + "m";
    return "in " + Math.floor(hrs / 24) + "d " + (hrs % 24) + "h";
  };

  /** mm:ss or h:mm:ss */
  DS.hms = function (ms, withHours) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var s = t % 60, m = Math.floor(t / 60) % 60, hr = Math.floor(t / 3600);
    if (hr || withHours) return hr + ":" + pad2(m) + ":" + pad2(s);
    return m + ":" + pad2(s);
  };

  DS.chime = chime;
  DS.alarms = alarms;
})(window.DS);
