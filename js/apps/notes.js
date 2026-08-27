/* ═══════════════════════════════════════════════════════════════
   notes.js — editor over /Users/you/Notes
   Autosaves into the shared file system, so anything written here
   is immediately readable from Finder and `cat` in Terminal.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;
  var DIR = "/Users/you/Notes";

  function preview(text) {
    var body = String(text || "").split("\n").slice(1).join(" ").trim();
    return body ? body.slice(0, 60) : "No additional text";
  }
  function titleOf(name, text) {
    var first = String(text || "").split("\n")[0].replace(/^#+\s*/, "").trim();
    return first || name.replace(/\.(md|txt)$/i, "");
  }

  DS.apps.register({
    id: "notes",
    name: "Notes",
    icon: "notes",
    w: 760, h: 500, minW: 480, minH: 300,
    flush: true,

    mount: function (body, api) {
      if (!fs.exists(DIR)) fs.mkdir(DIR);

      var state = { path: null, dirty: false };
      var side = h("aside.app-side");
      var editor = h("textarea.nt-editor", {
        spellcheck: "false",
        placeholder: "Start writing…"
      });
      var meta = h("div.app-statusbar");

      var toolbar = h("div.app-toolbar", {}, [
        h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>New</span>",
          onclick: create
        }),
        h("div", { style: { flex: "1" } }),
        h("button.g-btn.g-btn-sq", {
          html: DS.icon("trash", 14), title: "Delete note",
          onclick: function () { if (state.path) destroy(state.path); }
        })
      ]);

      body.appendChild(side);
      body.appendChild(h("div.nt-col", {}, [toolbar, editor, meta]));

      /* ── persistence ── */
      var saveTimer = null;
      function scheduleSave() {
        state.dirty = true;
        renderMeta();
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(commit, 500);
      }
      function commit() {
        if (!state.path || !state.dirty) return;
        fs.write(state.path, editor.value);
        state.dirty = false;
        renderList();
        renderMeta();
      }
      editor.addEventListener("input", scheduleSave);
      editor.addEventListener("blur", commit);

      function load(path) {
        commit();
        state.path = path;
        editor.value = fs.read(path) || "";
        state.dirty = false;
        api.setTitle(titleOf(fs.basename(path), editor.value));
        renderList();
        renderMeta();
        editor.disabled = false;
      }

      function create() {
        var name = fs.freeName(DIR, "untitled", ".md");
        fs.write(fs.join(DIR, name), "");
        load(fs.join(DIR, name));
        setTimeout(function () { editor.focus(); }, 40);
      }

      function destroy(path) {
        var name = fs.basename(path);
        DS.ui.confirm("Delete note?", "“" + name + "” cannot be recovered.",
          { ok: "Delete", danger: true }).then(function (yes) {
            if (!yes) return;
            fs.remove(path);
            state.path = null;
            editor.value = "";
            var rest = fs.list(DIR);
            if (rest.length) load(rest[0].path);
            else { renderList(); renderMeta(); editor.disabled = true; }
          });
      }

      /* ── render ── */
      function renderList() {
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Notes" }));
        var items = fs.list(DIR).filter(function (i) { return i.type === "file"; });
        if (!items.length) {
          side.appendChild(h("div", {
            text: "No notes yet",
            style: { padding: "10px 8px", "font-size": "11.5px", color: "var(--text-3)" }
          }));
        }
        items
          .sort(function (a, b) { return b.mtime - a.mtime; })
          .forEach(function (item) {
            var text = fs.read(item.path) || "";
            var row = h("div.nt-item" + (item.path === state.path ? ".on" : ""), {
              onclick: function () { load(item.path); },
              oncontextmenu: function (e) {
                e.preventDefault();
                DS.ui.ctx(e.clientX, e.clientY, [
                  { label: "Open", icon: "eye", action: function () { load(item.path); } },
                  { label: "Rename…", icon: "notes", action: function () {
                      DS.ui.prompt("Rename note", null, item.name).then(function (n) {
                        if (!n) return;
                        fs.rename(item.path, n);
                        if (state.path === item.path) state.path = fs.join(DIR, n);
                        renderList();
                      });
                    } },
                  { sep: true },
                  { label: "Delete", icon: "trash", action: function () { destroy(item.path); } }
                ]);
              }
            }, [
              h("b", { text: titleOf(item.name, text) }),
              h("i", { text: preview(text) }),
              h("u", { text: DS.when(item.mtime) })
            ]);
            side.appendChild(row);
          });
      }

      function renderMeta() {
        DS.clear(meta);
        if (!state.path) {
          meta.appendChild(h("span", { text: "No note selected" }));
          return;
        }
        var words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
        meta.appendChild(h("span", { text: fs.basename(state.path) }));
        meta.appendChild(h("span", { style: { flex: "1" } }));
        meta.appendChild(h("span", { text: words + " words · " + editor.value.length + " chars" }));
        meta.appendChild(h("span.g-chip", {
          text: state.dirty ? "Saving…" : "Saved",
          style: state.dirty ? {} : { color: "hsl(var(--ok))" }
        }));
      }

      var first = fs.list(DIR).filter(function (i) { return i.type === "file"; })[0];
      if (api.arg && api.arg.path && fs.exists(api.arg.path)) load(api.arg.path);
      else if (first) load(first.path);
      else { editor.disabled = true; renderList(); renderMeta(); }

      api.openPath = function (p) { load(p); };
    },

    onArg: function (api, arg) {
      if (arg && arg.path && api.openPath) api.openPath(arg.path);
    }
  });
})(window.DS);
