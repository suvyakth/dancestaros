/* ═══════════════════════════════════════════════════════════════
   audiolab.js — Audio Lab

   Import a file, see its waveform, run it through a five-band EQ
   and a small effects rack, trim it, and render the result back out
   as a WAV.

   The important detail: buildChain() is called twice — once against
   the live AudioContext for monitoring, and once against an
   OfflineAudioContext for the export. One function, so what you
   hear is provably what you get. Exports render faster than
   real time because OfflineAudioContext is not bound to the clock.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var BANDS = [
    { f: 80,    label: "80",   type: "lowshelf" },
    { f: 250,   label: "250",  type: "peaking" },
    { f: 1000,  label: "1k",   type: "peaking" },
    { f: 4000,  label: "4k",   type: "peaking" },
    { f: 10000, label: "10k",  type: "highshelf" }
  ];

  var PRESETS = {
    "Flat":     [0, 0, 0, 0, 0],
    "Warm":     [4, 2, 0, -2, -3],
    "Bright":   [-2, -1, 0, 3, 5],
    "Radio":    [-12, -4, 4, 3, -8],
    "Loudness": [6, 0, -3, 1, 5],
    "Scoop":    [4, -1, -6, -1, 4]
  };

  function distortionCurve(amount) {
    var n = 1024, curve = new Float32Array(n);
    var k = amount * 3;
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return curve;
  }

  /** A decaying noise burst makes a serviceable reverb impulse. */
  function impulse(ctx, seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Float samples to a 16-bit PCM WAV blob. */
  function toWav(buffer) {
    var chans = Math.min(2, buffer.numberOfChannels);
    var len = buffer.length;
    var rate = buffer.sampleRate;
    var bytes = 44 + len * chans * 2;
    var ab = new ArrayBuffer(bytes);
    var view = new DataView(ab);
    var pos = 0;

    function s(str) { for (var i = 0; i < str.length; i++) view.setUint8(pos++, str.charCodeAt(i)); }
    function u32(v) { view.setUint32(pos, v, true); pos += 4; }
    function u16(v) { view.setUint16(pos, v, true); pos += 2; }

    s("RIFF"); u32(bytes - 8); s("WAVE");
    s("fmt "); u32(16); u16(1); u16(chans);
    u32(rate); u32(rate * chans * 2); u16(chans * 2); u16(16);
    s("data"); u32(len * chans * 2);

    var data = [];
    for (var c = 0; c < chans; c++) data.push(buffer.getChannelData(c));
    for (var i = 0; i < len; i++) {
      for (var ch = 0; ch < chans; ch++) {
        var v = Math.max(-1, Math.min(1, data[ch][i]));
        view.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        pos += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }

  DS.apps.register({
    id: "audiolab",
    name: "Audio Lab",
    icon: "music",
    w: 880, h: 620, minW: 620, minH: 480,
    flush: true,

    mount: function (body, api) {
      var st = {
        buffer: null, path: null, name: "",
        eq: [0, 0, 0, 0, 0],
        gain: 100, rate: 100, lowpass: 20000, highpass: 20,
        drive: 0, reverb: 0, delay: 0, feedback: 30,
        selStart: 0, selEnd: 1,
        playing: false
      };

      var ctx = null, src = null, chain = null, startedAt = 0, startOffset = 0, raf = null;

      var side = h("aside.app-side");
      var wave = h("canvas.lab-wave");
      var wctx = wave.getContext("2d");
      var waveWrap = h("div.al-wave", {}, [wave, h("div.al-play")]);
      var panel = h("div.lab-panel");
      var status = h("div.app-statusbar");

      var playBtn = h("button.g-btn.g-btn-accent.g-btn-lg", {
        html: DS.icon("play", 16) + "<span>Play</span>",
        onclick: toggle
      });

      var toolbar = h("div.app-toolbar", {}, [
        h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Import</span>",
          onclick: function () {
            DS.media.pick("audio/*").then(function (made) {
              renderLibrary();
              if (made[0]) load(made[0].path);
            });
          }
        }),
        playBtn,
        h("button.g-btn", {
          html: DS.icon("x", 14) + "<span>Full</span>",
          title: "Clear the trim selection",
          onclick: function () { st.selStart = 0; st.selEnd = 1; drawWave(); }
        }),
        h("div", { style: { flex: "1" } }),
        h("button.g-btn", {
          html: DS.icon("save", 14) + "<span>Render to Music</span>",
          onclick: function () { render(false); }
        }),
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("download", 14) + "<span>Download WAV</span>",
          onclick: function () { render(true); }
        })
      ]);

      body.appendChild(side);
      body.appendChild(h("div.lab-col", {}, [toolbar, waveWrap, status]));
      body.appendChild(panel);

      /* ───────────── library ───────────── */
      function renderLibrary() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Music" }));
        var items = fs.list("/Users/you/Music")
          .filter(function (i) { return i.type === "file" && i.media; });
        if (!items.length) {
          side.appendChild(h("div", {
            text: "No audio yet. Import a file, or drop one on the waveform.",
            style: { padding: "10px 8px", "font-size": "11.5px",
                     color: "var(--text-3)", "line-height": "1.5" }
          }));
        }
        items.forEach(function (item) {
          side.appendChild(h("div.side-item" + (item.path === st.path ? ".on" : ""), {
            onclick: function () { load(item.path); }
          }, [
            h("span", { html: DS.icon("music", 15), style: { display: "contents" } }),
            h("span", { text: item.name })
          ]));
        });
      }

      /* ───────────── loading ───────────── */
      function audio() {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          ctx = new AC();
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      }

      function load(path) {
        var node = fs.node(path);
        if (!node || !node.media) return;
        stop();
        st.path = path;
        st.name = node.name;
        api.setTitle(node.name + " — Audio Lab");
        setStatus("Decoding " + node.name + "…");

        DS.media.blob(node.media).then(function (b) {
          return b.arrayBuffer();
        }).then(function (ab) {
          return audio().decodeAudioData(ab);
        }).then(function (buf) {
          st.buffer = buf;
          st.selStart = 0;
          st.selEnd = 1;
          drawWave();
          renderLibrary();
          setStatus();
        }).catch(function (e) {
          setStatus("Could not decode this file.");
          DS.ui.toast({ icon: "info", title: "Decode failed", body: String(e.message || e) });
        });
      }

      function setStatus(msg) {
        DS.clear(status);
        if (msg) { status.appendChild(h("span", { text: msg })); return; }
        if (!st.buffer) {
          status.appendChild(h("span", { text: "Import an audio file to begin." }));
          return;
        }
        var b = st.buffer;
        var sel = (st.selEnd - st.selStart) * b.duration;
        status.appendChild(h("span", { text: st.name }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        status.appendChild(h("span", {
          text: DS.hms(b.duration * 1000) + " · " + b.sampleRate + " Hz · " +
                (b.numberOfChannels > 1 ? "stereo" : "mono")
        }));
        if (sel < b.duration - 0.01) {
          status.appendChild(h("span.g-chip", { text: "trim " + DS.hms(sel * 1000) }));
        }
      }

      /* ───────────── waveform ───────────── */
      function drawWave() {
        var r = waveWrap.getBoundingClientRect();
        var W = Math.max(200, Math.floor(r.width));
        var H = Math.max(90, Math.floor(r.height));
        var dpr = window.devicePixelRatio || 1;
        wave.width = W * dpr;
        wave.height = H * dpr;
        wave.style.width = W + "px";
        wave.style.height = H + "px";
        wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        wctx.clearRect(0, 0, W, H);

        if (!st.buffer) return;
        var data = st.buffer.getChannelData(0);
        var step = Math.max(1, Math.floor(data.length / W));
        var mid = H / 2;

        var cs = getComputedStyle(document.documentElement);
        var accent = "hsl(" + cs.getPropertyValue("--accent").trim() + ")";

        // unselected region sits behind, dimmed
        for (var pass = 0; pass < 2; pass++) {
          wctx.beginPath();
          for (var x = 0; x < W; x++) {
            var frac = x / W;
            var inSel = frac >= st.selStart && frac <= st.selEnd;
            if ((pass === 0) === inSel) continue;
            var min = 1, max = -1;
            for (var j = 0; j < step; j++) {
              var v = data[x * step + j] || 0;
              if (v < min) min = v;
              if (v > max) max = v;
            }
            wctx.moveTo(x + 0.5, mid + min * mid * 0.94);
            wctx.lineTo(x + 0.5, mid + max * mid * 0.94);
          }
          wctx.strokeStyle = pass === 0
            ? "rgba(255,255,255,.16)"
            : accent;
          wctx.lineWidth = 1;
          wctx.globalAlpha = pass === 0 ? 1 : .85;
          wctx.stroke();
        }
        wctx.globalAlpha = 1;

        // centre line
        wctx.strokeStyle = "rgba(255,255,255,.14)";
        wctx.beginPath();
        wctx.moveTo(0, mid);
        wctx.lineTo(W, mid);
        wctx.stroke();
      }

      /* drag across the waveform to trim */
      var dragging = false;
      wave.addEventListener("pointerdown", function (e) {
        if (!st.buffer) return;
        var r = wave.getBoundingClientRect();
        dragging = true;
        st.selStart = DS.clamp((e.clientX - r.left) / r.width, 0, 1);
        st.selEnd = st.selStart;
        wave.setPointerCapture(e.pointerId);
      });
      wave.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var r = wave.getBoundingClientRect();
        st.selEnd = DS.clamp((e.clientX - r.left) / r.width, 0, 1);
        drawWave();
      });
      wave.addEventListener("pointerup", function () {
        if (!dragging) return;
        dragging = false;
        if (st.selEnd < st.selStart) {
          var t = st.selStart; st.selStart = st.selEnd; st.selEnd = t;
        }
        if (st.selEnd - st.selStart < 0.01) { st.selStart = 0; st.selEnd = 1; }
        drawWave();
        setStatus();
      });

      /* ───────────── the graph, shared by preview and render ───────────── */
      function buildChain(c, sourceNode, destination) {
        var nodes = [];
        var last = sourceNode;

        BANDS.forEach(function (b, i) {
          var f = c.createBiquadFilter();
          f.type = b.type;
          f.frequency.value = b.f;
          if (b.type === "peaking") f.Q.value = 1.1;
          f.gain.value = st.eq[i];
          last.connect(f);
          last = f;
          nodes.push(f);
        });

        var hp = c.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = st.highpass;
        last.connect(hp); last = hp;

        var lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = st.lowpass;
        last.connect(lp); last = lp;

        if (st.drive > 0) {
          var ws = c.createWaveShaper();
          ws.curve = distortionCurve(st.drive / 100);
          ws.oversample = "2x";
          last.connect(ws);
          last = ws;
        }

        var master = c.createGain();
        master.gain.value = Math.pow(st.gain / 100, 1.6);

        var dry = c.createGain();
        dry.gain.value = 1 - (st.reverb / 100) * 0.6;
        last.connect(dry);
        dry.connect(master);

        if (st.reverb > 0) {
          var conv = c.createConvolver();
          conv.buffer = impulse(c, 1.2 + (st.reverb / 100) * 2.4, 2.6);
          var wet = c.createGain();
          wet.gain.value = (st.reverb / 100) * 0.9;
          last.connect(conv);
          conv.connect(wet);
          wet.connect(master);
        }

        if (st.delay > 0) {
          var dl = c.createDelay(2);
          dl.delayTime.value = 0.06 + (st.delay / 100) * 0.5;
          var fb = c.createGain();
          fb.gain.value = (st.feedback / 100) * 0.8;
          var dw = c.createGain();
          dw.gain.value = (st.delay / 100) * 0.6;
          last.connect(dl);
          dl.connect(fb);
          fb.connect(dl);
          dl.connect(dw);
          dw.connect(master);
        }

        master.connect(destination);
        return { master: master, bands: nodes, lp: lp, hp: hp };
      }

      /* ───────────── transport ───────────── */
      function selTimes() {
        var d = st.buffer.duration;
        return { off: st.selStart * d, dur: (st.selEnd - st.selStart) * d };
      }

      function toggle() {
        if (!st.buffer) return DS.ui.toast({ icon: "info", title: "Nothing loaded" });
        if (st.playing) stop();
        else play();
      }

      function play() {
        var c = audio();
        var t = selTimes();
        src = c.createBufferSource();
        src.buffer = st.buffer;
        src.playbackRate.value = st.rate / 100;
        chain = buildChain(c, src, c.destination);
        src.start(0, t.off, t.dur);
        startedAt = c.currentTime;
        startOffset = t.off;
        st.playing = true;
        playBtn.innerHTML = DS.icon("pause", 16) + "<span>Stop</span>";
        src.onended = function () { if (st.playing) stop(); };
        tickPlayhead();
      }

      function stop() {
        st.playing = false;
        if (src) { try { src.stop(); } catch (e) {} src.disconnect(); src = null; }
        if (raf) cancelAnimationFrame(raf);
        playBtn.innerHTML = DS.icon("play", 16) + "<span>Play</span>";
        DS.qs(".al-play", waveWrap).style.opacity = "0";
      }

      function tickPlayhead() {
        var line = DS.qs(".al-play", waveWrap);
        line.style.opacity = "1";
        (function step() {
          if (!st.playing || !ctx) return;
          var t = selTimes();
          var elapsed = (ctx.currentTime - startedAt) * (st.rate / 100);
          var frac = (startOffset + elapsed) / st.buffer.duration;
          line.style.left = (DS.clamp(frac, 0, 1) * 100) + "%";
          raf = requestAnimationFrame(step);
        })();
      }

      /* live parameter updates while playing */
      function push() {
        if (!chain) return;
        chain.bands.forEach(function (f, i) { f.gain.value = st.eq[i]; });
        chain.lp.frequency.value = st.lowpass;
        chain.hp.frequency.value = st.highpass;
        chain.master.gain.value = Math.pow(st.gain / 100, 1.6);
        if (src) src.playbackRate.value = st.rate / 100;
      }

      /* ───────────── render ───────────── */
      function render(asDownload) {
        if (!st.buffer) return DS.ui.toast({ icon: "info", title: "Nothing loaded" });
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) return DS.ui.toast({ icon: "info", title: "Offline rendering unavailable" });

        var t = selTimes();
        var rate = st.buffer.sampleRate;
        var outLen = Math.ceil((t.dur / (st.rate / 100)) * rate) + Math.ceil(rate * 2.5);
        var oc = new OAC(Math.min(2, st.buffer.numberOfChannels), outLen, rate);

        var osrc = oc.createBufferSource();
        osrc.buffer = st.buffer;
        osrc.playbackRate.value = st.rate / 100;
        buildChain(oc, osrc, oc.destination);
        osrc.start(0, t.off, t.dur);

        setStatus("Rendering…");
        oc.startRendering().then(function (out) {
          var blob = toWav(out);
          var base = DS.media.baseOf(st.name || "audio");
          if (asDownload) {
            DS.media.download(blob, base + " edited.wav");
            setStatus();
            return;
          }
          return DS.media.save(blob, "/Users/you/Music", base + " edited.wav", "audio")
            .then(function (p) {
              renderLibrary();
              setStatus();
              DS.ui.toast({
                icon: "save", title: "Rendered to Music",
                body: fs.basename(p) + " · " + DS.bytes(blob.size)
              });
            });
        }).catch(function (e) {
          setStatus();
          DS.ui.toast({ icon: "info", title: "Render failed", body: String(e.message || e) });
        });
      }

      /* ───────────── controls ───────────── */
      function renderPanel() {
        DS.clear(panel);

        panel.appendChild(h("div.side-label", { text: "EQ presets" }));
        var pg = h("div.lab-presets");
        Object.keys(PRESETS).forEach(function (n) {
          pg.appendChild(h("button.g-btn", {
            text: n,
            onclick: function () {
              st.eq = PRESETS[n].slice();
              renderPanel();
              push();
            }
          }));
        });
        panel.appendChild(pg);

        panel.appendChild(h("div.side-label", { text: "Five-band EQ" }));
        var eq = h("div.al-eq");
        BANDS.forEach(function (b, i) {
          var read = h("i", { text: (st.eq[i] > 0 ? "+" : "") + st.eq[i] });
          var sl = h("input.al-vert", {
            type: "range", min: -18, max: 18, step: 1, value: st.eq[i],
            oninput: function () {
              st.eq[i] = parseFloat(sl.value);
              read.textContent = (st.eq[i] > 0 ? "+" : "") + st.eq[i];
              push();
            }
          });
          eq.appendChild(h("div.al-band", {}, [read, sl, h("span", { text: b.label })]));
        });
        panel.appendChild(eq);

        panel.appendChild(h("div.side-label", { text: "Rack" }));
        [
          ["gain", "Level", 0, 200, 1, "%"],
          ["rate", "Speed", 25, 250, 5, "%"],
          ["highpass", "High-pass", 20, 2000, 10, "Hz"],
          ["lowpass", "Low-pass", 400, 20000, 100, "Hz"],
          ["drive", "Drive", 0, 100, 1, "%"],
          ["reverb", "Reverb", 0, 100, 1, "%"],
          ["delay", "Delay", 0, 100, 1, "%"],
          ["feedback", "Feedback", 0, 90, 1, "%"]
        ].forEach(function (r) {
          panel.appendChild(DS.ui.sliderRow({
            label: r[1], min: r[2], max: r[3], step: r[4], value: st[r[0]],
            format: function (v) { return v + r[5]; },
            onInput: function (v) { st[r[0]] = v; push(); }
          }));
        });

        panel.appendChild(h("div.st-hint", {
          text: "Reverb, delay and drive rebuild the graph, so they apply from " +
                "the next Play. Everything else is live."
        }));
      }

      /* ───────────── drop + resize ───────────── */
      waveWrap.addEventListener("dragover", function (e) {
        e.preventDefault(); waveWrap.classList.add("drop");
      });
      waveWrap.addEventListener("dragleave", function () { waveWrap.classList.remove("drop"); });
      waveWrap.addEventListener("drop", function (e) {
        e.preventDefault(); e.stopPropagation();
        waveWrap.classList.remove("drop");
        DS.media.importFiles(e.dataTransfer.files, "/Users/you/Music").then(function (made) {
          renderLibrary();
          if (made[0]) load(made[0].path);
        });
      });

      var ro = new ResizeObserver(function () { drawWave(); });
      ro.observe(waveWrap);

      api.onClose = function () {
        stop();
        ro.disconnect();
        if (ctx) { try { ctx.close(); } catch (e) {} }
      };

      renderLibrary();
      renderPanel();
      setStatus();
      var first = (api.arg && api.arg.path) ||
        (fs.list("/Users/you/Music").filter(function (i) { return i.media; })[0] || {}).path;
      if (first) load(first);

      api.openPath = load;
    },

    onArg: function (api, arg) {
      if (arg && arg.path && api.openPath) api.openPath(arg.path);
    }
  });
})(window.DS);
