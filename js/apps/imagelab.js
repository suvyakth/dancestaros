/* ═══════════════════════════════════════════════════════════════
   imagelab.js — Image Lab

   Non-destructive: the adjustments are a filter string plus a
   transform, applied at draw time to an untouched source image.
   Nothing is baked in until you export, so you can slide anything
   back to neutral at any point.

   Canvas has ctx.filter, which takes the same syntax as the CSS
   filter property — so the live preview and the exported pixels go
   through exactly the same code path.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var ADJ = [
    { k: "brightness", label: "Brightness", min: 0,   max: 200, def: 100, unit: "%" },
    { k: "contrast",   label: "Contrast",   min: 0,   max: 200, def: 100, unit: "%" },
    { k: "saturate",   label: "Saturation", min: 0,   max: 300, def: 100, unit: "%" },
    { k: "hue",        label: "Hue",        min: -180, max: 180, def: 0,  unit: "deg" },
    { k: "sepia",      label: "Sepia",      min: 0,   max: 100, def: 0,   unit: "%" },
    { k: "grayscale",  label: "Mono",       min: 0,   max: 100, def: 0,   unit: "%" },
    { k: "invert",     label: "Invert",     min: 0,   max: 100, def: 0,   unit: "%" },
    { k: "blur",       label: "Blur",       min: 0,   max: 24,  def: 0,   unit: "px" },
    { k: "vignette",   label: "Vignette",   min: 0,   max: 100, def: 0,   unit: "%" }
  ];

  var PRESETS = {
    "Prism":   { saturate: 165, contrast: 112, hue: -12, brightness: 104 },
    "Frost":   { saturate: 72,  brightness: 116, contrast: 92, blur: 1 },
    "Noir":    { grayscale: 100, contrast: 140, brightness: 96, vignette: 45 },
    "Faded":   { saturate: 70, contrast: 84, brightness: 112, sepia: 18 },
    "Vivid":   { saturate: 190, contrast: 122, brightness: 102 },
    "Dusk":    { hue: -28, saturate: 130, brightness: 88, vignette: 30 },
    "Xray":    { invert: 100, grayscale: 60, contrast: 130 }
  };

  function neutral() {
    var o = {};
    ADJ.forEach(function (a) { o[a.k] = a.def; });
    return o;
  }

  /* ── the seed "images" are CSS gradients, so they need rasterising
        before the editor can touch them. Handles the three gradient
        forms the seed actually uses. ── */
  function parseStops(str) {
    var out = [];
    (str.match(/#[0-9a-f]{3,8}(\s+[\d.]+%)?/gi) || []).forEach(function (s) {
      var bits = s.trim().split(/\s+/);
      out.push({ color: bits[0], at: bits[1] ? parseFloat(bits[1]) / 100 : null });
    });
    out.forEach(function (s, i) {
      if (s.at === null) s.at = out.length === 1 ? 0 : i / (out.length - 1);
    });
    return out;
  }

  function drawGradient(ctx, css, w, hgt) {
    var stops = parseStops(css);
    if (!stops.length) { ctx.fillStyle = "#334155"; ctx.fillRect(0, 0, w, hgt); return; }
    var g;

    if (/^conic/i.test(css)) {
      var from = (parseFloat((css.match(/from\s+(-?[\d.]+)deg/i) || [])[1]) || 0) * Math.PI / 180;
      if (ctx.createConicGradient) g = ctx.createConicGradient(from, w / 2, hgt / 2);
      else g = ctx.createLinearGradient(0, 0, w, hgt);
    } else if (/^radial/i.test(css)) {
      var at = css.match(/at\s+([\d.]+)%\s+([\d.]+)%/i);
      var cx = at ? parseFloat(at[1]) / 100 * w : w / 2;
      var cy = at ? parseFloat(at[2]) / 100 * hgt : hgt / 2;
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, hgt) * 0.85);
    } else {
      var deg = parseFloat((css.match(/(-?[\d.]+)deg/) || [])[1]);
      if (isNaN(deg)) deg = 180;
      var rad = (deg - 90) * Math.PI / 180;
      var len = Math.abs(w * Math.cos(rad)) + Math.abs(hgt * Math.sin(rad));
      g = ctx.createLinearGradient(
        w / 2 - Math.cos(rad) * len / 2, hgt / 2 - Math.sin(rad) * len / 2,
        w / 2 + Math.cos(rad) * len / 2, hgt / 2 + Math.sin(rad) * len / 2);
    }
    stops.forEach(function (s) { g.addColorStop(DS.clamp(s.at, 0, 1), s.color); });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
  }

  /* Photos needs this to turn a seeded gradient into real pixels. */
  DS.imageTools = {
    rasterise: function (node, w, hgt) {
      var c = document.createElement("canvas");
      c.width = w; c.height = hgt;
      drawGradient(c.getContext("2d"), node.content, w, hgt);
      return c;
    },
    drawGradient: drawGradient
  };

  DS.apps.register({
    id: "imagelab",
    name: "Image Lab",
    icon: "image",
    w: 900, h: 600, minW: 620, minH: 440,
    flush: true,

    mount: function (body, api) {
      var st = {
        adj: neutral(),
        rot: 0,
        flipH: false,
        flipV: false,
        source: null,       // HTMLImageElement or {gradient, w, h}
        path: null,
        name: "untitled.png"
      };

      var side = h("aside.app-side");
      var canvas = h("canvas.lab-canvas");
      var ctx = canvas.getContext("2d");
      var stage = h("div.lab-stage.il-stage", {}, [canvas]);
      var panel = h("div.lab-panel");
      var status = h("div.app-statusbar");

      /* declared up here because the stage is assembled below, and a
         `var` further down would still be undefined at that point */
      var cropBox = h("div.il-crop", { hidden: true });
      var cropBar = h("div.il-cropbar", { hidden: true }, [
        h("span.il-cropdim"),
        h("button.g-btn", {
          text: "Cancel",
          onclick: function () { crop = null; paintCrop(); }
        }),
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("check", 14) + "<span>Crop</span>",
          onclick: function () { applyCrop(); }
        })
      ]);

      var toolbar = h("div.app-toolbar", {}, [
        h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Import</span>",
          onclick: function () {
            DS.media.pick("image/*").then(function (made) {
              renderLibrary();
              if (made[0]) load(made[0].path);
            });
          }
        }),
        h("div", { style: { flex: "1" } }),
        h("button.g-btn", {
          html: DS.icon("refresh", 14) + "<span>Reset</span>",
          onclick: function () {
            st.adj = neutral(); st.rot = 0; st.flipH = false; st.flipV = false;
            renderPanel(); draw();
          }
        }),
        h("button.g-btn", {
          html: DS.icon("save", 14) + "<span>Save a copy</span>",
          onclick: saveCopy
        }),
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("download", 14) + "<span>Download</span>",
          onclick: download
        })
      ]);

      stage.appendChild(cropBox);
      stage.appendChild(cropBar);
      body.appendChild(side);
      body.appendChild(h("div.lab-col", {}, [toolbar, stage, status]));
      body.appendChild(panel);

      /* ───────────── library ───────────── */
      function renderLibrary() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Pictures" }));
        var items = fs.list("/Users/you/Pictures")
          .filter(function (i) { return i.type === "file" && i.kind === "image"; });
        if (!items.length) {
          side.appendChild(h("div", {
            text: "Nothing here yet. Import an image.",
            style: { padding: "10px 8px", "font-size": "11.5px", color: "var(--text-3)" }
          }));
        }
        items.forEach(function (item) {
          var thumb = h("span.lab-th");
          if (item.media) {
            DS.media.url(item.media).then(function (u) {
              if (u) thumb.style.backgroundImage = "url(" + u + ")";
            });
          } else {
            thumb.style.background = item.node.content;
          }
          side.appendChild(h("div.side-item" + (item.path === st.path ? ".on" : ""), {
            onclick: function () { load(item.path); }
          }, [thumb, h("span", { text: item.name })]));
        });
      }

      /* ───────────── loading ───────────── */
      function load(path) {
        var node = fs.node(path);
        if (!node) return;
        st.path = path;
        st.name = node.name;
        api.setTitle(node.name + " — Image Lab");

        if (node.media) {
          DS.media.url(node.media).then(function (u) {
            var img = new Image();
            img.onload = function () {
              st.source = img;
              fit();
              draw();
              renderLibrary();
            };
            img.onerror = function () {
              DS.ui.toast({ icon: "info", title: "Could not decode", body: node.name });
            };
            img.src = u;
          });
        } else {
          st.source = { gradient: node.content, w: 1200, h: 900 };
          fit();
          draw();
          renderLibrary();
        }
      }

      function srcSize() {
        if (!st.source) return { w: 0, h: 0 };
        if (st.source.gradient) return { w: st.source.w, h: st.source.h };
        return {
          w: st.source.naturalWidth || st.source.width,
          h: st.source.naturalHeight || st.source.height
        };
      }

      /* ── CROP ────────────────────────────────────────────────────
         Drag a box on the canvas, then bake it. The crop is applied to
         the *source*, not to the filtered output, so every adjustment
         stays live and undoable afterwards. */
      var crop = null;

      function paintCrop() {
        if (!crop || crop.w < 4 || crop.h < 4) {
          cropBox.hidden = true;
          cropBar.hidden = true;
          return;
        }
        var r = canvas.getBoundingClientRect();
        var sr = stage.getBoundingClientRect();
        var sx = r.width / canvas.width;
        var sy = r.height / canvas.height;
        cropBox.hidden = false;
        cropBar.hidden = false;
        cropBox.style.left = (r.left - sr.left + crop.x * sx) + "px";
        cropBox.style.top = (r.top - sr.top + crop.y * sy) + "px";
        cropBox.style.width = (crop.w * sx) + "px";
        cropBox.style.height = (crop.h * sy) + "px";
        DS.qs(".il-cropdim", cropBar).textContent =
          Math.round(crop.w) + " × " + Math.round(crop.h);
      }

      function applyCrop() {
        if (!crop || !st.source) return;
        var s2 = srcSize();
        var off = document.createElement("canvas");
        off.width = Math.round(crop.w);
        off.height = Math.round(crop.h);
        var octx = off.getContext("2d");

        // redraw the untouched source, offset so the crop lands at 0,0
        octx.save();
        octx.translate(-crop.x, -crop.y);
        octx.translate(canvas.width / 2, canvas.height / 2);
        octx.rotate(st.rot * Math.PI / 180);
        octx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
        var src = st.source.gradient
          ? DS.imageTools.rasterise({ content: st.source.gradient }, s2.w, s2.h)
          : st.source;
        octx.drawImage(src, -s2.w / 2, -s2.h / 2);
        octx.restore();

        st.source = off;          // a canvas is a perfectly good image source
        st.rot = 0;
        st.flipH = false;
        st.flipV = false;
        crop = null;
        paintCrop();
        draw();
        DS.ui.toast({ icon: "image", title: "Cropped",
                      body: off.width + " × " + off.height });
      }

      /* drag on the canvas to mark a crop */
      canvas.addEventListener("pointerdown", function (e) {
        if (!st.source) return;
        var r = canvas.getBoundingClientRect();
        var sx = canvas.width / r.width, sy = canvas.height / r.height;
        var ox = (e.clientX - r.left) * sx, oy = (e.clientY - r.top) * sy;
        canvas.setPointerCapture(e.pointerId);

        function move(ev) {
          var cx = DS.clamp((ev.clientX - r.left) * sx, 0, canvas.width);
          var cy = DS.clamp((ev.clientY - r.top) * sy, 0, canvas.height);
          crop = {
            x: Math.min(ox, cx), y: Math.min(oy, cy),
            w: Math.abs(cx - ox), h: Math.abs(cy - oy)
          };
          paintCrop();
        }
        function up() {
          canvas.removeEventListener("pointermove", move);
          canvas.removeEventListener("pointerup", up);
        }
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
      });

      function fit() {
        var s = srcSize();
        var swapped = st.rot % 180 !== 0;
        canvas.width = swapped ? s.h : s.w;
        canvas.height = swapped ? s.w : s.h;
      }

      /* ───────────── drawing ───────────── */
      function filterString() {
        var a = st.adj;
        return "brightness(" + a.brightness + "%) contrast(" + a.contrast + "%) " +
               "saturate(" + a.saturate + "%) hue-rotate(" + a.hue + "deg) " +
               "sepia(" + a.sepia + "%) grayscale(" + a.grayscale + "%) " +
               "invert(" + a.invert + "%) blur(" + a.blur + "px)";
      }

      function draw() {
        if (!st.source) return;
        var s = srcSize();
        fit();
        var W = canvas.width, H = canvas.height;

        ctx.save();
        ctx.clearRect(0, 0, W, H);
        ctx.translate(W / 2, H / 2);
        ctx.rotate(st.rot * Math.PI / 180);
        ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
        ctx.filter = filterString();

        if (st.source.gradient) {
          // rasterise into a scratch canvas first so ctx.filter applies
          var tmp = document.createElement("canvas");
          tmp.width = s.w; tmp.height = s.h;
          drawGradient(tmp.getContext("2d"), st.source.gradient, s.w, s.h);
          ctx.drawImage(tmp, -s.w / 2, -s.h / 2);
        } else {
          ctx.drawImage(st.source, -s.w / 2, -s.h / 2);
        }
        ctx.restore();

        if (st.adj.vignette > 0) {
          var v = st.adj.vignette / 100;
          var g = ctx.createRadialGradient(
            W / 2, H / 2, Math.min(W, H) * (0.62 - v * 0.3),
            W / 2, H / 2, Math.max(W, H) * 0.78);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, "rgba(0,0,0," + (v * 0.92).toFixed(3) + ")");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }

        paintCrop();
        DS.clear(status);
        status.appendChild(h("span", { text: st.name }));
        status.appendChild(h("span.g-chip", { text: "drag to crop" }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        status.appendChild(h("span", { text: W + " × " + H + " px" }));
        if (st.rot) status.appendChild(h("span.g-chip", { text: st.rot + "°" }));
      }

      /* ───────────── controls ───────────── */
      var rows = {};
      function renderPanel() {
        DS.clear(panel);
        rows = {};

        panel.appendChild(h("div.side-label", { text: "Presets" }));
        var pg = h("div.lab-presets");
        Object.keys(PRESETS).forEach(function (name) {
          pg.appendChild(h("button.g-btn", {
            text: name,
            onclick: function () {
              st.adj = neutral();
              Object.keys(PRESETS[name]).forEach(function (k) {
                st.adj[k] = PRESETS[name][k];
              });
              renderPanel();
              draw();
            }
          }));
        });
        panel.appendChild(pg);

        panel.appendChild(h("div.side-label", { text: "Transform" }));
        panel.appendChild(h("div.lab-presets", {}, [
          h("button.g-btn", {
            html: DS.icon("refresh", 14) + "<span>Rotate</span>",
            onclick: function () { st.rot = (st.rot + 90) % 360; crop = null; draw(); }
          }),
          h("button.g-btn", {
            text: "Flip H",
            onclick: function () { st.flipH = !st.flipH; draw(); }
          }),
          h("button.g-btn", {
            text: "Flip V",
            onclick: function () { st.flipV = !st.flipV; draw(); }
          })
        ]));

        panel.appendChild(h("div.side-label", { text: "Adjust" }));
        ADJ.forEach(function (a) {
          var row = DS.ui.sliderRow({
            label: a.label, min: a.min, max: a.max, step: a.unit === "px" ? 1 : 1,
            value: st.adj[a.k],
            format: function (v) { return v + (a.unit === "deg" ? "°" : a.unit); },
            onInput: function (v) { st.adj[a.k] = v; draw(); }
          });
          rows[a.k] = row;
          panel.appendChild(row);
        });
      }

      /* ───────────── export ───────────── */
      function toBlob() {
        return new Promise(function (resolve) {
          canvas.toBlob(function (b) { resolve(b); }, "image/png");
        });
      }

      function saveCopy() {
        if (!st.source) return DS.ui.toast({ icon: "info", title: "Nothing open" });
        toBlob().then(function (blob) {
          var base = DS.media.baseOf(st.name);
          return DS.media.save(blob, "/Users/you/Pictures", base + " edited.png", "image");
        }).then(function (path) {
          renderLibrary();
          DS.ui.toast({
            icon: "save", title: "Saved to Pictures", body: fs.basename(path),
            action: { label: "Open it", run: function () { DS.openPath(path); } }
          });
        });
      }

      function download() {
        if (!st.source) return DS.ui.toast({ icon: "info", title: "Nothing open" });
        toBlob().then(function (blob) {
          DS.media.download(blob, DS.media.baseOf(st.name) + " edited.png");
        });
      }

      /* ───────────── drop to open ───────────── */
      stage.addEventListener("dragover", function (e) {
        e.preventDefault();
        stage.classList.add("drop");
      });
      stage.addEventListener("dragleave", function () { stage.classList.remove("drop"); });
      stage.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        stage.classList.remove("drop");
        DS.media.importFiles(e.dataTransfer.files, "/Users/you/Pictures")
          .then(function (made) {
            renderLibrary();
            if (made[0]) load(made[0].path);
          });
      });

      renderLibrary();
      renderPanel();

      var first = (api.arg && api.arg.path) ||
        (fs.list("/Users/you/Pictures").filter(function (i) {
          return i.kind === "image";
        })[0] || {}).path;
      if (first) load(first);
      else {
        DS.clear(status);
        status.appendChild(h("span", { text: "Import an image, or drop one here." }));
      }

      api.openPath = load;
    },

    onArg: function (api, arg) {
      if (arg && arg.path && api.openPath) api.openPath(arg.path);
    }
  });
})(window.DS);
