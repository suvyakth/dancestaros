/* ═══════════════════════════════════════════════════════════════
   photos.js — image browser over /Users/you/Pictures

   Two kinds of picture live here. The seeded ones are CSS gradients,
   which keeps a fresh install asset-free and gives the glass viewer
   frame saturated colour to refract. Imported ones are real blobs in
   IndexedDB. Both render onto the same element as a background.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;
  var DIR = "/Users/you/Pictures";

  DS.apps.register({
    id: "photos",
    name: "Photos",
    icon: "photos",
    w: 720, h: 520, minW: 440, minH: 340,
    flush: true,

    mount: function (body, api) {
      var items = [];
      var viewing = -1;
      var size = 3;   // grid columns

      var grid = h("div.ph-grid");
      var stage = h("div.ph-stage", { hidden: true });
      var stageImg = h("div.ph-full");
      var stageCap = h("div.ph-cap");

      var toolbar = h("div.app-toolbar", {}, [
        h("button.g-btn.g-btn-sq", {
          html: DS.icon("chevL", 15), title: "Back to library",
          onclick: closeViewer
        }),
        h("div.ph-tname", { text: "Library" }),
        h("div", { style: { flex: "1" } }),
        DS.ui.segmented(
          [{ label: "S", value: 4 }, { label: "M", value: 3 }, { label: "L", value: 2 }],
          3,
          function (v) { size = v; paintGrid(); }
        ),
        h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Import</span>",
          onclick: function () {
            DS.media.pick("image/*", DIR).then(function () { load(); paintGrid(); });
          }
        })
      ]);
      var backBtn = toolbar.firstChild;
      var tname = DS.qs(".ph-tname", toolbar);

      stage.appendChild(h("button.ph-nav.ph-prev", {
        html: DS.icon("chevL", 22), onclick: function () { show(viewing - 1); }
      }));
      stage.appendChild(h("div.ph-frame.g", {}, [stageImg]));
      stage.appendChild(h("button.ph-nav.ph-next", {
        html: DS.icon("chevR", 22), onclick: function () { show(viewing + 1); }
      }));
      stage.appendChild(stageCap);

      /* ── in-place editing, the way a gallery should have it ──
         Rotate and flip are live on the element. Anything that needs
         real pixels hands off to Image Lab, which already knows how to
         rasterise a seeded gradient. */
      var view = { rot: 0, flipH: false };

      function applyView() {
        stageImg.style.transform =
          "rotate(" + view.rot + "deg) scaleX(" + (view.flipH ? -1 : 1) + ")";
      }

      function editBar() {
        return h("div.ph-edit", {}, [
          h("button.g-btn.g-btn-sq", {
            html: DS.icon("refresh", 14), title: "Rotate left",
            onclick: function () { view.rot = (view.rot + 270) % 360; applyView(); }
          }),
          h("button.g-btn.g-btn-sq", {
            html: DS.icon("refresh", 14, 'style="transform:scaleX(-1)"'),
            title: "Rotate right",
            onclick: function () { view.rot = (view.rot + 90) % 360; applyView(); }
          }),
          h("button.g-btn", {
            text: "Flip",
            onclick: function () { view.flipH = !view.flipH; applyView(); }
          }),
          h("button.g-btn", {
            html: DS.icon("save", 14) + "<span>Save copy</span>",
            title: "Write the rotation out as a new picture",
            onclick: saveRotated
          }),
          h("button.g-btn", {
            html: DS.icon("sliders", 14) + "<span>Crop</span>",
            onclick: function () {
              DS.wm.open("imagelab", { path: items[viewing].path });
              DS.ui.toast({
                icon: "sliders", title: "Image Lab",
                body: "Drag a box on the picture to crop it."
              });
            }
          }),
          h("button.g-btn.g-btn-accent", {
            html: DS.icon("image", 14) + "<span>Edit</span>",
            onclick: function () {
              DS.wm.open("imagelab", { path: items[viewing].path });
            }
          })
        ]);
      }

      function sourceFor(item) {
        if (!item.media) {
          return Promise.resolve(DS.imageTools.rasterise(item.node, 1400, 1050));
        }
        return DS.media.url(item.media).then(function (u) {
          return new Promise(function (res, rej) {
            var img = new Image();
            img.onload = function () { res(img); };
            img.onerror = rej;
            img.src = u;
          });
        });
      }

      function saveRotated() {
        var item = items[viewing];
        if (!item) return;
        if (!view.rot && !view.flipH) {
          return DS.ui.toast({ icon: "info", title: "Nothing changed",
                               body: "Rotate or flip it first." });
        }
        sourceFor(item).then(function (src) {
          var sw = src.naturalWidth || src.width;
          var sh = src.naturalHeight || src.height;
          var swap = view.rot % 180 !== 0;
          var c = document.createElement("canvas");
          c.width = swap ? sh : sw;
          c.height = swap ? sw : sh;
          var cx = c.getContext("2d");
          cx.translate(c.width / 2, c.height / 2);
          cx.rotate(view.rot * Math.PI / 180);
          cx.scale(view.flipH ? -1 : 1, 1);
          cx.drawImage(src, -sw / 2, -sh / 2);
          c.toBlob(function (blob) {
            DS.media.save(blob, DIR,
              DS.media.baseOf(item.name) + " rotated.png", "image")
              .then(function (p) {
                view.rot = 0; view.flipH = false;
                applyView();
                load();
                paintGrid();
                DS.ui.toast({ icon: "image", title: "Saved to Pictures",
                              body: fs.basename(p) });
              });
          }, "image/png");
        });
      }

      stage.appendChild(editBar());

      body.appendChild(h("div.ph-col", {}, [toolbar, grid, stage]));

      function load() {
        items = fs.list(DIR).filter(function (i) {
          return i.type === "file" && i.kind === "image";
        });
      }

      /* A seed picture is a CSS gradient; an imported one is a blob in
         IndexedDB. Both end up as a background on the same element. */
      function paint(el, item) {
        if (item.media) {
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
          DS.media.url(item.media).then(function (u) {
            if (u) el.style.backgroundImage = "url(" + u + ")";
          });
        } else {
          el.style.background = item.node.content;
        }
      }

      function paintGrid() {
        DS.clear(grid);
        grid.style.setProperty("--cols", size);
        if (!items.length) {
          grid.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("image", 34) }),
            h("div", { text: "No pictures in " + DIR })
          ]));
          return;
        }
        items.forEach(function (item, i) {
          var cell = h("div.ph-cell", {
            onclick: function () { show(i); },
            oncontextmenu: function (e) {
              e.preventDefault();
              DS.ui.ctx(e.clientX, e.clientY, [
                { label: "Open", icon: "eye", action: function () { show(i); } },
                { label: "Edit in Image Lab", icon: "sliders", action: function () {
                    DS.wm.open("imagelab", { path: item.path });
                  } },
                { label: "Show in Finder", icon: "finder", action: function () {
                    DS.wm.open("finder", { path: DIR });
                  } },
                { sep: true },
                { label: "Delete", icon: "trash", action: function () {
                    DS.ui.confirm("Delete picture?", item.name, { ok: "Delete", danger: true })
                      .then(function (yes) {
                        if (!yes) return;
                        fs.remove(item.path);
                        load();
                        paintGrid();
                      });
                  } }
              ]);
            }
          }, [
            h("div.ph-thumb"),
            h("div.ph-name", { text: item.name })
          ]);
          paint(DS.qs(".ph-thumb", cell), item);
          grid.appendChild(cell);
        });
      }

      function show(i) {
        if (!items.length) return;
        viewing = (i + items.length) % items.length;
        var item = items[viewing];
        stageImg.style.background = "";
        stageImg.style.backgroundImage = "";
        view.rot = 0; view.flipH = false;
        applyView();
        paint(stageImg, item);
        DS.clear(stageCap);
        stageCap.appendChild(h("b", { text: item.name }));
        stageCap.appendChild(h("span", {
          text: (viewing + 1) + " of " + items.length + " · " + DS.when(item.mtime)
        }));
        grid.hidden = true;
        stage.hidden = false;
        backBtn.style.visibility = "visible";
        tname.textContent = item.name;
        api.setTitle(item.name + " — Photos");
        DS.glass.dress(stage);
      }

      function closeViewer() {
        stage.hidden = true;
        grid.hidden = false;
        viewing = -1;
        backBtn.style.visibility = "hidden";
        tname.textContent = "Library";
        api.setTitle("Photos");
      }

      function onKey(e) {
        if (DS.wm.focused() !== api.win || stage.hidden) return;
        if (e.key === "ArrowRight") { show(viewing + 1); e.preventDefault(); }
        else if (e.key === "ArrowLeft") { show(viewing - 1); e.preventDefault(); }
        else if (e.key === "Escape") { closeViewer(); e.preventDefault(); }
      }
      document.addEventListener("keydown", onKey);
      api.onClose = function () { document.removeEventListener("keydown", onKey); };

      load();
      paintGrid();
      closeViewer();

      if (api.arg && api.arg.path) {
        var target = items.map(function (i) { return i.path; }).indexOf(api.arg.path);
        if (target >= 0) show(target);
      }

      api.openPath = function (p) {
        load();
        paintGrid();
        var t = items.map(function (i) { return i.path; }).indexOf(p);
        if (t >= 0) show(t);
      };
    },

    onArg: function (api, arg) {
      if (arg && arg.path && api.openPath) api.openPath(arg.path);
    }
  });
})(window.DS);
