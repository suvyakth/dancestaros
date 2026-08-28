/* ═══════════════════════════════════════════════════════════════
   music.js — ambient generator

   There are no audio files anywhere in this project. Each "track"
   is a chord synthesised with Web Audio oscillators through a
   slowly sweeping low-pass filter. The level meter is driven by a
   real AnalyserNode, so the glass bars are showing actual output.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  // frequencies in Hz — voiced low and wide so the pads stay soft
  var TRACKS = [
    { name: "Refraction",      artist: "Index of 1.52", notes: [130.81, 196.00, 246.94, 329.63, 493.88], cut: 900 },
    { name: "Total Internal",  artist: "Critical Angle", notes: [110.00, 164.81, 220.00, 261.63, 392.00], cut: 700 },
    { name: "Annealing",       artist: "Slow Cooling",   notes: [146.83, 220.00, 293.66, 349.23, 440.00], cut: 1100 },
    { name: "Dispersion",      artist: "Prism Split",    notes: [123.47, 185.00, 246.94, 311.13, 466.16], cut: 820 },
    { name: "Frosted",         artist: "Ground Surface", notes: [98.00,  146.83, 196.00, 293.66, 392.00], cut: 620 },
    { name: "First Light",     artist: "Dancestar",      notes: [174.61, 261.63, 329.63, 415.30, 523.25], cut: 1300 }
  ];

  DS.apps.register({
    id: "music",
    name: "Music",
    icon: "music",
    w: 640, h: 480, minW: 460, minH: 400,
    flush: true,

    mount: function (body, api) {
      var idx = 0;
      var playing = false;
      var elapsed = 0;
      var ticker = null;
      var raf = null;

      var ctx = null, master = null, filter = null, analyser = null, voices = [], lfo = null;
      var freqData = null;

      /* ── layout ── */
      var side = h("aside.app-side.mu-side");
      var art = h("div.mu-art");
      var titleEl = h("div.mu-title", { text: TRACKS[0].name });
      var artistEl = h("div.mu-artist", { text: TRACKS[0].artist });
      var meter = h("div.mu-meter");
      var bars = [];
      for (var i = 0; i < 28; i++) {
        var b = h("i");
        bars.push(b);
        meter.appendChild(b);
      }
      var timeEl = h("span.mu-time", { text: "0:00" });
      var seek = h("div.g-progress.mu-seek", {}, [h("i", { style: { width: "0%" } })]);

      var btnPlay = h("button.g-btn.mu-play", {
        html: DS.icon("play", 20),
        onclick: toggle
      });
      var btnPrev = h("button.g-btn.g-btn-sq", {
        html: DS.icon("prev", 15), onclick: function () { select(idx - 1); }
      });
      var btnNext = h("button.g-btn.g-btn-sq", {
        html: DS.icon("next", 15), onclick: function () { select(idx + 1); }
      });

      var vol = DS.ui.slider({
        min: 0, max: 100, step: 1, value: DS.store.get("volume", 65),
        onInput: function (v) {
          DS.store.set("volume", v);
          if (master) master.gain.setTargetAtTime(gainFor(v), ctx.currentTime, .05);
        }
      });

      body.appendChild(side);
      body.appendChild(h("div.mu-main", {}, [
        art,
        h("div.mu-info", {}, [titleEl, artistEl]),
        meter,
        h("div.mu-seekrow", {}, [seek, timeEl]),
        h("div.mu-controls", {}, [btnPrev, btnPlay, btnNext]),
        h("div.mu-volrow", {}, [
          h("span", { html: DS.icon("volume", 14), style: { display: "contents" } }),
          h("div", { style: { flex: "1" } }, [vol])
        ]),
        h("div.mu-note", {
          text: "Synthesised live with Web Audio — no audio files in this project."
        })
      ]));

      /* ── audio graph ── */
      function gainFor(v) { return Math.pow(v / 100, 2) * 0.22; }

      function buildAudio() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0;

        filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = TRACKS[idx].cut;
        filter.Q.value = 0.9;

        analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        freqData = new Uint8Array(analyser.frequencyBinCount);

        filter.connect(master);
        master.connect(analyser);
        analyser.connect(ctx.destination);

        // slow filter sweep, so the pad breathes
        lfo = ctx.createOscillator();
        var lfoGain = ctx.createGain();
        lfo.frequency.value = 0.045;
        lfoGain.gain.value = 260;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        return true;
      }

      function killVoices() {
        voices.forEach(function (v) {
          try {
            v.gain.gain.setTargetAtTime(0, ctx.currentTime, .12);
            v.osc.stop(ctx.currentTime + 0.6);
          } catch (e) {}
        });
        voices = [];
      }

      function startVoices() {
        var t = TRACKS[idx];
        killVoices();
        filter.frequency.setTargetAtTime(t.cut, ctx.currentTime, .4);

        t.notes.forEach(function (freq, i) {
          // two slightly detuned oscillators per note gives the pad movement
          [-1, 1].forEach(function (dir) {
            var osc = ctx.createOscillator();
            osc.type = i === 0 ? "sine" : "triangle";
            osc.frequency.value = freq * (1 + dir * 0.0016);
            var g = ctx.createGain();
            g.gain.value = 0;
            osc.connect(g);
            g.connect(filter);
            osc.start();
            // fade the voice in, quieter as it climbs the chord
            g.gain.setTargetAtTime(0.5 / (i + 1.6), ctx.currentTime, 1.1 + i * 0.3);
            voices.push({ osc: osc, gain: g });
          });
        });
      }

      /* ── transport ── */
      function toggle() {
        if (!ctx && !buildAudio()) {
          DS.ui.toast({ icon: "info", title: "No audio", body: "Web Audio is unavailable in this browser." });
          return;
        }
        if (ctx.state === "suspended") ctx.resume();
        playing = !playing;
        if (playing) {
          startVoices();
          master.gain.setTargetAtTime(gainFor(parseFloat(vol.value)), ctx.currentTime, .8);
          ticker = setInterval(function () {
            elapsed += 1;
            paintTime();
          }, 1000);
          loopMeter();
        } else {
          master.gain.setTargetAtTime(0, ctx.currentTime, .35);
          setTimeout(killVoices, 500);
          if (ticker) { clearInterval(ticker); ticker = null; }
        }
        paintControls();
      }

      function select(n) {
        idx = (n + TRACKS.length) % TRACKS.length;
        elapsed = 0;
        renderList();
        paintTrack();
        paintTime();
        if (playing) startVoices();
      }

      /* ── painting ── */
      function paintTrack() {
        publish();
        var t = TRACKS[idx];
        titleEl.textContent = t.name;
        artistEl.textContent = t.artist;
        art.style.background = artFor(idx);
        api.setTitle(t.name + " — Music");
      }

      function artFor(i) {
        var g = [
          "linear-gradient(135deg,#22d3ee,#a855f7 55%,#1e1b4b)",
          "linear-gradient(150deg,#f43f5e,#fbbf24 55%,#7c2d12)",
          "linear-gradient(120deg,#34d399,#0ea5e9 55%,#064e3b)",
          "linear-gradient(160deg,#c084fc,#6366f1 55%,#1e1b4b)",
          "linear-gradient(140deg,#94a3b8,#0f172a 60%,#020617)",
          "linear-gradient(135deg,#fcd34d,#f472b6 55%,#4c1d95)"
        ];
        return g[i % g.length];
      }

      function publish() {
        // the desktop widget is a view onto this, not a second player
        DS.nowPlaying = {
          title: TRACKS[idx].name,
          artist: TRACKS[idx].artist,
          art: artFor(idx),
          playing: playing,
          toggle: toggle,
          next: function () { select(idx + 1); },
          prev: function () { select(idx - 1); }
        };
      }

      function paintControls() {
        publish();
        btnPlay.innerHTML = DS.icon(playing ? "pause" : "play", 20);
        btnPlay.classList.toggle("on", playing);
        DS.qsa(".mu-item", side).forEach(function (n, i) {
          n.classList.toggle("playing", i === idx && playing);
        });
      }

      function paintTime() {
        var m = Math.floor(elapsed / 60);
        var s = elapsed % 60;
        timeEl.textContent = m + ":" + (s < 10 ? "0" : "") + s;
        // pads are endless, so the bar cycles every four minutes
        seek.firstChild.style.width = ((elapsed % 240) / 240 * 100).toFixed(1) + "%";
      }

      function loopMeter() {
        if (raf) cancelAnimationFrame(raf);
        (function tick() {
          if (!playing) {
            bars.forEach(function (b) { b.style.transform = "scaleY(0.04)"; });
            return;
          }
          analyser.getByteFrequencyData(freqData);
          for (var i = 0; i < bars.length; i++) {
            // low bins carry the pad, so compress the useful range
            var v = freqData[Math.floor(i * 1.45) + 1] / 255;
            bars[i].style.transform = "scaleY(" + Math.max(0.04, Math.pow(v, 0.8) * 1.05).toFixed(3) + ")";
          }
          raf = requestAnimationFrame(tick);
        })();
      }

      function renderList() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Ambient" }));
        TRACKS.forEach(function (t, i) {
          side.appendChild(h("div.mu-item" + (i === idx ? ".on" : "") +
            (i === idx && playing ? ".playing" : ""), {
            onclick: function () { select(i); if (!playing) toggle(); }
          }, [
            h("span.mu-dot", { style: { background: artFor(i) } }),
            h("span.mu-it", {}, [
              h("b", { text: t.name }),
              h("i", { text: t.artist })
            ])
          ]));
        });
      }

      api.onClose = function () {
        DS.nowPlaying = null;
        playing = false;
        if (ticker) clearInterval(ticker);
        if (raf) cancelAnimationFrame(raf);
        try {
          killVoices();
          if (lfo) lfo.stop();
          if (ctx) ctx.close();
        } catch (e) {}
      };

      renderList();
      paintTrack();
      paintTime();
      paintControls();
      loopMeter();
    }
  });
})(window.DS);
