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
