/* ═══════════════════════════════════════════════════════════════
   finder.js — file browser over DS.fs
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var PLACES = [
    { label: "Home",      path: "/Users/you",           icon: "home" },
    { label: "Desktop",   path: "/Users/you/Desktop",   icon: "desktop" },
    { label: "Documents", path: "/Users/you/Documents",  icon: "doc" },
    { label: "Notes",     path: "/Users/you/Notes",      icon: "notes" },
    { label: "Pictures",  path: "/Users/you/Pictures",   icon: "image" },
    { label: "Music",     path: "/Users/you/Music",      icon: "music" },
    { label: "System",    path: "/System",               icon: "cpu" }
  ];

  function kindIcon(entry) {
    if (entry.type === "dir") return "folder";
    if (entry.kind === "image") return "image";
    if (/\.md$/i.test(entry.name)) return "notes";
    if (/\.(conf|cfg|ini)$/i.test(entry.name)) return "sliders";
    return "doc";
  }

  DS.apps.register({
    id: "finder",
    name: "Finder",
    icon: "finder",
    w: 800, h: 520, minW: 520, minH: 320,
    flush: true,

    mount: function (body, api) {
      var state = {
        path: (api.arg && api.arg.path) || "/Users/you",
        view: "grid",
        sel: null,
        back: [],
        fwd: []
      };

      var side = h("aside.app-side");
      var crumbs = h("div.fx-crumbs");
      var main = h("div.app-main.fx-main");
      var status = h("div.app-statusbar");

      var btnBack = h("button.g-btn.g-btn-sq", {
        html: DS.icon("chevL", 15), title: "Back",
        onclick: function () {
          if (!state.back.length) return;
          state.fwd.push(state.path);
          state.path = state.back.pop();
          render();
        }
      });
      var btnFwd = h("button.g-btn.g-btn-sq", {
        html: DS.icon("chevR", 15), title: "Forward",
        onclick: function () {
          if (!state.fwd.length) return;
          state.back.push(state.path);
          state.path = state.fwd.pop();
          render();
        }
      });
      var viewSeg = DS.ui.segmented(
        [{ label: "Grid", value: "grid" }, { label: "List", value: "list" }],
        state.view,
        function (v) { state.view = v; render(); }
      );

      var toolbar = h("div.app-toolbar", {}, [
        btnBack, btnFwd, crumbs,
        h("div", { style: { flex: "1" } }),
        viewSeg,
        h("button.g-btn.g-btn-sq", {
          html: DS.icon("plus", 15), title: "New folder",
          onclick: newFolder
        })
      ]);

      body.appendChild(side);
      body.appendChild(h("div.fx-col", {}, [toolbar, main, status]));

      /* ── navigation ── */
      function go(path, pushHistory) {
        if (!fs.exists(path)) return;
        if (pushHistory !== false && path !== state.path) {
          state.back.push(state.path);
          state.fwd.length = 0;
        }
        state.path = path;
        state.sel = null;
        render();
      }

      function open(entry) {
        if (entry.type === "dir") go(entry.path);
        else DS.openPath(entry.path);
      }

      /* ── file operations ── */
      function newFolder() {
        DS.ui.prompt("New Folder", "Create a folder in " + state.path, "untitled folder")
          .then(function (name) {
            if (!name) return;
            if (!fs.mkdir(fs.join(state.path, name))) {
              DS.ui.toast({ icon: "info", title: "Could not create folder", body: name + " already exists." });
              return;
            }
            render();
          });
      }

      function newFile() {
        DS.ui.prompt("New File", "Create a text file in " + state.path, "untitled.txt")
          .then(function (name) {
            if (!name) return;
            fs.write(fs.join(state.path, name), "");
            render();
          });
      }

      function rename(entry) {
        DS.ui.prompt("Rename", "Rename " + entry.name, entry.name).then(function (name) {
          if (!name || name === entry.name) return;
          if (!fs.rename(entry.path, name)) {
            DS.ui.toast({ icon: "info", title: "Rename failed", body: "That name is taken." });
            return;
          }
          render();
        });
      }

      function remove(entry) {
        DS.ui.confirm("Move to Trash?", "“" + entry.name + "” will be deleted permanently.",
          { ok: "Delete", danger: true }).then(function (yes) {
            if (!yes) return;
            fs.remove(entry.path);
            DS.ui.toast({ icon: "trash", title: "Deleted", body: entry.name });
            render();
          });
      }

      function entryMenu(e, entry) {
        e.preventDefault();
        e.stopPropagation();
        DS.ui.ctx(e.clientX, e.clientY, [
          { label: entry.type === "dir" ? "Open" : "Open", icon: "eye", action: function () { open(entry); } },
          { sep: true },
          { label: "Rename…", icon: "notes", action: function () { rename(entry); } },
          { label: "Duplicate", icon: "layers", action: function () {
              if (entry.type !== "file") {
                DS.ui.toast({ icon: "info", title: "Folders cannot be duplicated yet" });
                return;
              }
              var dot = entry.name.lastIndexOf(".");
              var base = dot > 0 ? entry.name.slice(0, dot) : entry.name;
              var ext = dot > 0 ? entry.name.slice(dot) : "";
              var name = fs.freeName(state.path, base + " copy", ext);
              fs.write(fs.join(state.path, name), fs.read(entry.path), entry.kind);
              render();
            } },
          { sep: true },
          { label: "Delete", icon: "trash", action: function () { remove(entry); } }
        ]);
      }

      function bgMenu(e) {
        if (e.target.closest(".fx-item")) return;
        e.preventDefault();
        DS.ui.ctx(e.clientX, e.clientY, [
          { label: "New Folder", icon: "folder", action: newFolder },
          { label: "New File", icon: "file", action: newFile },
          { sep: true },
          { label: "Refresh", icon: "refresh", action: render }
        ]);
      }
      main.addEventListener("contextmenu", bgMenu);

      /* ── render ── */
      function renderSide() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Places" }));
        PLACES.forEach(function (p) {
          if (!fs.exists(p.path)) return;
          var on = state.path === p.path;
          side.appendChild(h("div.side-item" + (on ? ".on" : ""), {
            onclick: function () { go(p.path); }
          }, [
            h("span", { html: DS.icon(p.icon, 15), style: { display: "contents" } }),
            h("span", { text: p.label })
          ]));
        });
      }

      function renderCrumbs() {
        DS.clear(crumbs);
        var segs = fs.split(state.path);
        var acc = "";
        crumbs.appendChild(h("button.fx-crumb", {
          html: DS.icon("home", 13), onclick: function () { go("/"); }
        }));
        segs.forEach(function (s, i) {
          acc += "/" + s;
          var target = acc;
          crumbs.appendChild(h("span.fx-sep", { html: DS.icon("chevR", 11) }));
          crumbs.appendChild(h("button.fx-crumb" + (i === segs.length - 1 ? ".on" : ""), {
            text: s, onclick: function () { go(target); }
          }));
        });
      }

      function render() {
        renderSide();
        renderCrumbs();
        api.setTitle(fs.basename(state.path) === "/" ? "Finder" : fs.basename(state.path));
        btnBack.disabled = !state.back.length;
        btnFwd.disabled = !state.fwd.length;

        var items = fs.list(state.path);
        DS.clear(main);
        main.className = "app-main fx-main " + (state.view === "grid" ? "fx-grid" : "fx-list");

        if (!items.length) {
          main.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("folder", 34) }),
            h("div", { text: "This folder is empty" }),
            h("button.g-btn", { text: "New File", onclick: newFile,
              style: { "margin-top": "4px" } })
          ]));
        }

        items.forEach(function (entry) {
          var node;
          if (state.view === "grid") {
            var thumb = entry.kind === "image"
              ? h("div.fx-thumb", { style: { background: entry.node.content } })
              : h("div.fx-glyph", { html: DS.icon(kindIcon(entry), 22) });
            node = h("div.fx-item", {}, [
              thumb,
              h("div.fx-name", { text: entry.name })
            ]);
          } else {
            node = h("div.fx-item", {}, [
              h("span.fx-li-ico", { html: DS.icon(kindIcon(entry), 16) }),
              h("span.fx-li-name", { text: entry.name }),
              h("span.fx-li-meta", {
                text: entry.type === "dir" ? entry.size + " items" : DS.bytes(entry.size)
              }),
              h("span.fx-li-meta", { text: DS.when(entry.mtime) })
            ]);
          }
          node.addEventListener("click", function () {
            DS.qsa(".fx-item.sel", main).forEach(function (n) { n.classList.remove("sel"); });
            node.classList.add("sel");
            state.sel = entry;
            renderStatus(items, entry);
          });
          node.addEventListener("dblclick", function () { open(entry); });
          node.addEventListener("contextmenu", function (e) { entryMenu(e, entry); });
          main.appendChild(node);
        });

        renderStatus(items, null);
      }

      function renderStatus(items, sel) {
        DS.clear(status);
        var dirs = items.filter(function (i) { return i.type === "dir"; }).length;
        status.appendChild(h("span", {
          text: items.length + " item" + (items.length === 1 ? "" : "s") +
                (dirs ? " · " + dirs + " folder" + (dirs === 1 ? "" : "s") : "")
        }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        if (sel) {
          status.appendChild(h("span", {
            text: sel.name + (sel.type === "file" ? " · " + DS.bytes(sel.size) : "")
          }));
        } else {
          status.appendChild(h("span", { text: state.path }));
        }
      }

      render();
      api.refresh = render;
      api.goTo = go;
    },

    onArg: function (api, arg) {
      if (arg && arg.path && api.goTo) api.goTo(arg.path);
    }
  });
})(window.DS);
