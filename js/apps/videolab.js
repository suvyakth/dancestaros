/* ═══════════════════════════════════════════════════════════════
   videolab.js — Video Lab

   Preview is a <video> with a CSS filter on it, which costs nothing.
   Export is the honest version of the same thing: every frame is
   drawn to a canvas with the identical filter string via ctx.filter,
   the canvas is captured with captureStream(), the element's audio
   is routed through a MediaStreamDestination, and the two tracks go
   into a MediaRecorder.

   That means export runs in real time — a 30-second clip takes 30
   seconds. There is no way around it in a browser without shipping
   a WASM encoder, and the point of this project is that it has no
   dependencies.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var ADJ = [
    { k: "brightness", label: "Brightness", min: 0,    max: 200, def: 100, unit: "%" },
    { k: "contrast",   label: "Contrast",   min: 0,    max: 200, def: 100, unit: "%" },
    { k: "saturate",   label: "Saturation", min: 0,    max: 300, def: 100, unit: "%" },
    { k: "hue",        label: "Hue",        min: -180, max: 180, def: 0,   unit: "deg" },
    { k: "sepia",      label: "Sepia",      min: 0,    max: 100, def: 0,   unit: "%" },
    { k: "grayscale",  label: "Mono",       min: 0,    max: 100, def: 0,   unit: "%" },
    { k: "blur",       label: "Blur",       min: 0,    max: 16,  def: 0,   unit: "px" },
    { k: "vignette",   label: "Vignette",   min: 0,    max: 100, def: 0,   unit: "%" }
  ];

  var PRESETS = {
    "None":      {},
    "Cinema":    { contrast: 118, saturate: 88, brightness: 96, vignette: 34 },
    "VHS":       { saturate: 135, contrast: 92, hue: -8, blur: 1, vignette: 22 },
    "Noir":      { grayscale: 100, contrast: 145, brightness: 94, vignette: 46 },
    "Bleach":    { saturate: 42, contrast: 132, brightness: 112 },
    "Dream":     { blur: 2, saturate: 140, brightness: 110, contrast: 88 },
    "Infrared":  { hue: 150, saturate: 190, contrast: 120 }
  };

  function neutral() {
    var o = {};
    ADJ.forEach(function (a) { o[a.k] = a.def; });
    return o;
  }

  DS.apps.register({
    id: "videolab",
    name: "Video Lab",
    icon: "photos",
    w: 920, h: 640, minW: 640, minH: 480,
    flush: true,

    mount: function (body, api) {
      var st = {
        adj: neutral(), rate: 100,
        path: null, name: "", dur: 0,
        inPt: 0, outPt: 0,
        recording: false
      };

      var video = h("video.vl-video", { playsinline: true, preload: "metadata" });
      var vig = h("div.vl-vignette");
      var stage = h("div.lab-stage.vl-stage", {}, [video, vig]);
      var side = h("aside.app-side");
      var panel = h("div.lab-panel");
      var status = h("div.app-statusbar");

      var bar = h("div.vl-bar");
      var band = h("div.vl-band");
      var head = h("div.vl-head");
      bar.appendChild(band);
      bar.appendChild(head);
      var timeLbl = h("span.vl-time", { text: "0:00 / 0:00" });

      var playBtn = h("button.g-btn.g-btn-sq", {
        html: DS.icon("play", 15),
        onclick: function () { video.paused ? video.play() : video.pause(); }
      });

      var transport = h("div.vl-transport", {}, [
        playBtn,
        h("button.g-btn", {
          text: "Set in",
          onclick: function () { st.inPt = video.currentTime; fixPoints(); paintBar(); }
        }),
        h("button.g-btn", {
          text: "Set out",
          onclick: function () { st.outPt = video.currentTime; fixPoints(); paintBar(); }
        }),
        h("button.g-btn", {
          html: DS.icon("x", 14),
          title: "Clear trim",
          onclick: function () { st.inPt = 0; st.outPt = st.dur; paintBar(); }
        }),
        h("div", { style: { flex: "1" } }),
        timeLbl
      ]);

      var toolbar = h("div.app-toolbar", {}, [
        h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Import</span>",
          onclick: function () {
            DS.media.pick("video/*").then(function (made) {
              renderLibrary();
              if (made[0]) load(made[0].path);
            });
          }
        }),
        h("div", { style: { flex: "1" } }),
        h("button.g-btn", {
          html: DS.icon("image", 14) + "<span>Grab frame</span>",
          onclick: grabFrame
        }),
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("save", 14) + "<span>Export clip</span>",
          onclick: exportClip
        })
      ]);

      body.appendChild(side);
      body.appendChild(h("div.lab-col", {}, [toolbar, stage, transport, bar, status]));
      body.appendChild(panel);

      /* ───────────── library ───────────── */
      function renderLibrary() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Movies" }));
        if (!fs.exists("/Users/you/Movies")) fs.mkdir("/Users/you/Movies");
        var items = fs.list("/Users/you/Movies")
          .filter(function (i) { return i.type === "file" && i.media; });
        if (!items.length) {
          side.appendChild(h("div", {
            text: "No video yet. Import one, or drop a file on the preview.",
            style: { padding: "10px 8px", "font-size": "11.5px",
                     color: "var(--text-3)", "line-height": "1.5" }
          }));
        }
        items.forEach(function (item) {
          side.appendChild(h("div.side-item" + (item.path === st.path ? ".on" : ""), {
            onclick: function () { load(item.path); }
          }, [
            h("span", { html: DS.icon("photos", 15), style: { display: "contents" } }),
            h("span", { text: item.name })
          ]));
        });
      }

      /* ───────────── loading ───────────── */
      function load(path) {
        var node = fs.node(path);
        if (!node || !node.media) return;
        st.path = path;
        st.name = node.name;
        api.setTitle(node.name + " — Video Lab");
        DS.media.url(node.media).then(function (u) {
          video.src = u;
          video.load();
          renderLibrary();
        });
      }

      video.addEventListener("loadedmetadata", function () {
        st.dur = video.duration || 0;
        st.inPt = 0;
        st.outPt = st.dur;
        paintBar();
        setStatus();
      });
      video.addEventListener("play", function () {
        playBtn.innerHTML = DS.icon("pause", 15);
      });
      video.addEventListener("pause", function () {
        playBtn.innerHTML = DS.icon("play", 15);
      });
      video.addEventListener("timeupdate", function () {
        // loop inside the trim while previewing
        if (!st.recording && st.outPt > st.inPt && video.currentTime > st.outPt) {
          video.currentTime = st.inPt;
        }
        paintHead();
      });

      function fixPoints() {
        if (st.outPt < st.inPt) { var t = st.inPt; st.inPt = st.outPt; st.outPt = t; }
        if (st.outPt - st.inPt < 0.15) st.outPt = Math.min(st.dur, st.inPt + 0.15);
      }

      function paintBar() {
        if (!st.dur) return;
        band.style.left = (st.inPt / st.dur * 100) + "%";
        band.style.width = ((st.outPt - st.inPt) / st.dur * 100) + "%";
        paintHead();
        setStatus();
      }
      function paintHead() {
        if (!st.dur) return;
        head.style.left = (video.currentTime / st.dur * 100) + "%";
        timeLbl.textContent = DS.hms(video.currentTime * 1000) + " / " + DS.hms(st.dur * 1000);
      }

      bar.addEventListener("pointerdown", function (e) {
        if (!st.dur) return;
        var r = bar.getBoundingClientRect();
        video.currentTime = DS.clamp((e.clientX - r.left) / r.width, 0, 1) * st.dur;
        paintHead();
      });

      /* ───────────── look ───────────── */
      function filterString() {
        var a = st.adj;
        return "brightness(" + a.brightness + "%) contrast(" + a.contrast + "%) " +
               "saturate(" + a.saturate + "%) hue-rotate(" + a.hue + "deg) " +
               "sepia(" + a.sepia + "%) grayscale(" + a.grayscale + "%) " +
               "blur(" + a.blur + "px)";
      }

      function applyLook() {
        video.style.filter = filterString();
        vig.style.opacity = (st.adj.vignette / 100).toFixed(2);
        video.playbackRate = st.rate / 100;
      }

      function drawVignette(ctx, W, H) {
        if (!st.adj.vignette) return;
        var v = st.adj.vignette / 100;
        var g = ctx.createRadialGradient(
          W / 2, H / 2, Math.min(W, H) * (0.62 - v * 0.3),
          W / 2, H / 2, Math.max(W, H) * 0.78);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0," + (v * 0.92).toFixed(3) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      /* ───────────── grab a still ───────────── */
      function grabFrame() {
        if (!video.videoWidth) return DS.ui.toast({ icon: "info", title: "Nothing loaded" });
        var c = document.createElement("canvas");
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        var ctx = c.getContext("2d");
        ctx.filter = filterString();
        ctx.drawImage(video, 0, 0);
        ctx.filter = "none";
        drawVignette(ctx, c.width, c.height);
        c.toBlob(function (blob) {
          DS.media.save(blob, "/Users/you/Pictures",
            DS.media.baseOf(st.name) + " frame.png", "image").then(function (p) {
              DS.ui.toast({
                icon: "image", title: "Frame saved to Pictures", body: fs.basename(p)
              });
            });
        }, "image/png");
      }

      /* ───────────── export ─────────────
         Real-time by necessity: MediaRecorder records a live stream. */
      var audioCtx = null, mediaSrc = null;

      function exportClip() {
        if (!video.videoWidth) return DS.ui.toast({ icon: "info", title: "Nothing loaded" });
        if (st.recording) return;
        if (!window.MediaRecorder) {
          return DS.ui.toast({
            icon: "info", title: "No MediaRecorder",
            body: "This browser cannot record a stream. Grab frames instead."
          });
        }

        var W = video.videoWidth, H = video.videoHeight;
        var c = document.createElement("canvas");
        c.width = W; c.height = H;
        var ctx = c.getContext("2d");

        var stream = c.captureStream(30);

        // route the element's audio into the recording without muting it
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!audioCtx) audioCtx = new AC();
          if (!mediaSrc) mediaSrc = audioCtx.createMediaElementSource(video);
          var dest = audioCtx.createMediaStreamDestination();
          mediaSrc.connect(dest);
          mediaSrc.connect(audioCtx.destination);
          dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
        } catch (e) { /* no audio track, carry on with video only */ }

        var mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
          .filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
        var rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };

        var total = st.outPt - st.inPt;
        st.recording = true;
        video.pause();
        video.currentTime = st.inPt;

        var raf = null;
        function frame() {
          ctx.filter = filterString();
          ctx.drawImage(video, 0, 0, W, H);
          ctx.filter = "none";
          drawVignette(ctx, W, H);

          var done = video.currentTime - st.inPt;
          setStatus("Recording " + DS.hms(done * 1000) + " / " + DS.hms(total * 1000) +
                    "  (real time)");
          if (video.currentTime >= st.outPt || video.ended) { finish(); return; }
          raf = requestAnimationFrame(frame);
        }

        function finish() {
          if (raf) cancelAnimationFrame(raf);
          if (rec.state !== "inactive") rec.stop();
          video.pause();
          st.recording = false;
        }

        rec.onstop = function () {
          var blob = new Blob(chunks, { type: mime || "video/webm" });
          setStatus("Saving…");
          DS.media.save(blob, "/Users/you/Movies",
            DS.media.baseOf(st.name) + " edited.webm", "video").then(function (p) {
              renderLibrary();
              setStatus();
              DS.ui.toast({
                icon: "save", title: "Exported to Movies",
                body: fs.basename(p) + " · " + DS.bytes(blob.size), timeout: 8000
              });
            });
        };

        video.addEventListener("seeked", function once() {
          video.removeEventListener("seeked", once);
          rec.start(200);
          video.play();
          frame();
        });

        DS.ui.toast({
          icon: "photos", title: "Recording " + DS.hms(total * 1000),
          body: "Exports run in real time — leave this window visible.",
          timeout: 6000
        });
      }

      /* ───────────── controls ───────────── */
      function renderPanel() {
        DS.clear(panel);

        panel.appendChild(h("div.side-label", { text: "Looks" }));
        var pg = h("div.lab-presets");
        Object.keys(PRESETS).forEach(function (n) {
          pg.appendChild(h("button.g-btn", {
            text: n,
            onclick: function () {
              st.adj = neutral();
              Object.keys(PRESETS[n]).forEach(function (k) { st.adj[k] = PRESETS[n][k]; });
              renderPanel();
              applyLook();
            }
          }));
        });
        panel.appendChild(pg);

        panel.appendChild(h("div.side-label", { text: "Adjust" }));
        ADJ.forEach(function (a) {
          panel.appendChild(DS.ui.sliderRow({
            label: a.label, min: a.min, max: a.max, step: 1, value: st.adj[a.k],
            format: function (v) { return v + (a.unit === "deg" ? "°" : a.unit); },
            onInput: function (v) { st.adj[a.k] = v; applyLook(); }
          }));
        });

        panel.appendChild(h("div.side-label", { text: "Playback" }));
        panel.appendChild(DS.ui.sliderRow({
          label: "Speed", min: 25, max: 300, step: 5, value: st.rate,
          format: function (v) { return (v / 100).toFixed(2) + "×"; },
          onInput: function (v) { st.rate = v; applyLook(); }
        }));

        panel.appendChild(h("div.st-hint", {
          text: "Export re-renders every frame through the same filter string as " +
                "the preview, so what you see is what lands in Movies. It records " +
                "a live stream, so it takes as long as the clip does."
        }));
      }

      function setStatus(msg) {
        DS.clear(status);
        if (msg) { status.appendChild(h("span", { text: msg })); return; }
        if (!st.dur) {
          status.appendChild(h("span", { text: "Import a video, or drop one on the preview." }));
          return;
        }
        status.appendChild(h("span", { text: st.name }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        status.appendChild(h("span", {
          text: video.videoWidth + " × " + video.videoHeight + " · " + DS.hms(st.dur * 1000)
        }));
        if (st.outPt - st.inPt < st.dur - 0.05) {
          status.appendChild(h("span.g-chip", {
            text: "clip " + DS.hms((st.outPt - st.inPt) * 1000)
          }));
        }
      }

      /* ───────────── drop ───────────── */
      stage.addEventListener("dragover", function (e) {
        e.preventDefault(); stage.classList.add("drop");
      });
      stage.addEventListener("dragleave", function () { stage.classList.remove("drop"); });
      stage.addEventListener("drop", function (e) {
        e.preventDefault(); e.stopPropagation();
        stage.classList.remove("drop");
        DS.media.importFiles(e.dataTransfer.files, "/Users/you/Movies").then(function (made) {
          renderLibrary();
          if (made[0]) load(made[0].path);
        });
      });

      api.onClose = function () {
        video.pause();
        video.src = "";
        if (audioCtx) { try { audioCtx.close(); } catch (e) {} }
      };

      renderLibrary();
      renderPanel();
      applyLook();
      setStatus();

      var first = (api.arg && api.arg.path) ||
        (fs.list("/Users/you/Movies").filter(function (i) { return i.media; })[0] || {}).path;
      if (first) load(first);

      api.openPath = load;
    },

    onArg: function (api, arg) {
      if (arg && arg.path && api.openPath) api.openPath(arg.path);
    }
  });
})(window.DS);
