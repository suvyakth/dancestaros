/* ═══════════════════════════════════════════════════════════════
   fs.js — virtual file system

   One shared tree behind Finder, Notes, Terminal and Photos. Write
   a note in Notes and you can `cat` it in Terminal; that shared
   state is what makes this feel like an OS rather than a page of
   unrelated widgets.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  function dir(name, children) {
    return { type: "dir", name: name, children: children || {}, mtime: Date.now() };
  }
  function file(name, content, kind) {
    return {
      type: "file",
      name: name,
      kind: kind || "text",
      content: content || "",
      mtime: Date.now()
    };
  }

  function seed() {
    var welcome =
      "Welcome to Dancestar OS.\n" +
      "========================\n\n" +
      "Everything you can see is glass. Not a single surface in this\n" +
      "system is opaque: windows, buttons, sliders, switches, menus,\n" +
      "scrollbars, the dock, even the notification cards.\n\n" +
      "Four optical layers make that believable:\n\n" +
      "  1. a very low-alpha tint  (the pane itself)\n" +
      "  2. a blurred backdrop     (light diffusing through)\n" +
      "  3. chromatic dispersion   (cool at the top, warm at the base)\n" +
      "  4. a masked gradient rim  (the thickness of the pane)\n\n" +
      "Layer 3 is the one most glass UIs skip. Without it you get\n" +
      "frosted plastic. Open Settings and drag Dispersion to 0 to\n" +
      "watch the glass turn to plastic in real time.\n\n" +
      "Try this:\n" +
      "  - Ctrl+K            open the launcher\n" +
      "  - drag a window     to a screen edge to snap it\n" +
      "  - right-click       the desktop\n" +
      "  - Settings > Glass  tune the optics live\n";

    var readme =
      "# Notes on building with glass\n\n" +
      "## Contrast is the hard part\n" +
      "Transparent surfaces inherit whatever is behind them, so text\n" +
      "can land on any colour. Fixes used here:\n\n" +
      "- text-shadow on labels that sit over the wallpaper\n" +
      "- brightness() in the backdrop filter to lift dark regions\n" +
      "- a low-alpha tint that never drops below ~7%\n\n" +
      "## Unfocused windows must recede\n" +
      "With everything transparent, ten open windows become soup.\n" +
      "An unfocused window here drops its tint to 5.5% and kills its\n" +
      "specular sheen, so the focused pane always reads as nearest.\n\n" +
      "## Backdrop filters are expensive\n" +
      "Each one forces the compositor to re-sample everything behind\n" +
      "it. Dragging a window over three other panes means four\n" +
      "stacked blurs. The window manager adds .perf-lite to <html>\n" +
      "during drags, which halves every blur radius until release.\n";

    var todo =
      "- [x] design the glass token system\n" +
      "- [x] window manager with edge snapping\n" +
      "- [x] make every control glass\n" +
      "- [ ] add a glass web browser frame\n" +
      "- [ ] multi-user login screen\n" +
      "- [ ] ship it to Hack Club\n";

    var pics = {};
    [
      ["Prism.png",   "linear-gradient(135deg,#22d3ee,#a855f7 50%,#ec4899)"],
      ["Nebula.png",  "radial-gradient(circle at 30% 30%,#f472b6,#7c3aed 45%,#0f172a)"],
      ["Aurora.png",  "linear-gradient(160deg,#34d399,#22d3ee 45%,#3b82f6)"],
      ["Ember.png",   "linear-gradient(200deg,#fbbf24,#f43f5e 60%,#7c2d12)"],
      ["Frost.png",   "linear-gradient(120deg,#e0f2fe,#60a5fa 55%,#1e3a8a)"],
      ["Dusk.png",    "linear-gradient(180deg,#fb923c,#a855f7 55%,#0c1425)"],
      ["Lagoon.png",  "radial-gradient(circle at 70% 20%,#22d3ee,#0e7490 50%,#042f2e)"],
      ["Orchid.png",  "linear-gradient(140deg,#f0abfc,#c026d3 55%,#4a044e)"]
    ].forEach(function (p) {
      pics[p[0]] = file(p[0], p[1], "image");
    });

    return dir("/", {
      Users: dir("Users", {
        you: dir("you", {
          Desktop: dir("Desktop", {
            "Start here.md": file(
              "Start here.md",
              "# Start here\n\n" +
              "1. Right-click the desktop — the context menu is glass too.\n" +
              "2. Press Ctrl+K for the launcher.\n" +
              "3. Drag a window to the top or side edge to snap it.\n" +
              "4. Open Settings > Glass and drag Dispersion to 0.\n" +
              "   That single slider is the difference between glass and\n" +
              "   frosted plastic.\n" +
              "5. Open Terminal and run `neofetch`, then `glass blur 45`.\n"
            ),
            "Glass test.png": file(
              "Glass test.png",
              "conic-gradient(from 210deg,#f43f5e,#fbbf24,#22d3ee,#a855f7,#f43f5e)",
              "image"
            )
          }),
          Documents: dir("Documents", {
            "Welcome.txt": file("Welcome.txt", welcome),
            "Glass Notes.md": file("Glass Notes.md", readme),
            "todo.md": file("todo.md", todo)
          }),
          Notes: dir("Notes", {
            "First light.md": file(
              "First light.md",
              "The trick with glass is restraint.\n\n" +
              "Push the tint alpha past about 15% and the illusion dies: " +
              "you stop reading the surface as glass and start reading it " +
              "as translucent plastic. The depth has to come from the " +
              "edges, not the fill."
            )
          }),
          Pictures: dir("Pictures", pics),
          Music: dir("Music", {}),
          Movies: dir("Movies", {})
        })
      }),
      System: dir("System", {
        "glass.conf": file(
          "glass.conf",
          "# Dancestar OS optical configuration\n" +
          "# Live values live in Settings > Glass; this file documents them.\n\n" +
          "blur       = 20px    # backdrop diffusion\n" +
          "alpha      = 0.085   # pane tint (keep under 0.15)\n" +
          "saturate   = 185%    # glass concentrates colour\n" +
          "brightness = 1.06    # light gathered by the pane\n" +
          "thickness  = 1.3px   # rim width, reads as physical depth\n" +
          "dispersion = 0.60    # prismatic split at the edges\n" +
          "sheen      = 0.50    # cursor-tracked specular highlight\n"
        ),
        "release.txt": file(
          "release.txt",
          "Dancestar OS 1.0 \"First Light\"\n" +
          "Built for the Hack Club webOS challenge.\n" +
          "No frameworks. No build step. No opaque pixels.\n"
        )
      })
    });
  }

  /* ── path helpers ───────────────────────────────────────────── */
  function split(path) {
    return String(path).split("/").filter(function (s) { return s.length; });
  }
  function join() {
    var parts = Array.prototype.slice.call(arguments).join("/");
    return "/" + split(parts).join("/");
  }

  var fs = {
    root: null,

    init: function () {
      var saved = DS.store.get("fs", null);
      fs.root = saved && saved.children ? saved : seed();
      fs.flush();
      return fs.root;
    },

    flush: function () { DS.store.set("fs", fs.root); },

    /** Resolve a path to its node, or null. */
    node: function (path) {
      var segs = split(path);
      var cur = fs.root;
      for (var i = 0; i < segs.length; i++) {
        if (!cur || cur.type !== "dir" || !cur.children[segs[i]]) return null;
        cur = cur.children[segs[i]];
      }
      return cur;
    },

    parent: function (path) {
      var segs = split(path);
      segs.pop();
      return fs.node("/" + segs.join("/"));
    },

    dirname: function (path) {
      var segs = split(path);
      segs.pop();
      return "/" + segs.join("/");
    },

    basename: function (path) {
      var segs = split(path);
      return segs.length ? segs[segs.length - 1] : "/";
    },

    exists: function (path) { return !!fs.node(path); },

    /** Children of a directory, sorted dirs-first then alphabetically. */
    list: function (path) {
      var n = fs.node(path);
      if (!n || n.type !== "dir") return [];
      return Object.keys(n.children)
        .map(function (k) {
          var c = n.children[k];
          return {
            name: c.name,
            type: c.type,
            kind: c.kind || (c.type === "dir" ? "dir" : "text"),
            path: join(path, c.name),
            mtime: c.mtime,
            media: c.media || null,
            size: c.type === "file"
              ? (c.media ? (c.size || 0) : (c.content || "").length)
              : Object.keys(c.children).length,
            node: c
          };
        })
        .sort(function (a, b) {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    },

    read: function (path) {
      var n = fs.node(path);
      return n && n.type === "file" ? n.content : null;
    },

    write: function (path, content, kind) {
      var p = fs.parent(path);
      if (!p || p.type !== "dir") return false;
      var name = fs.basename(path);
      var existing = p.children[name];
      if (existing && existing.type === "file") {
        existing.content = content;
        existing.mtime = Date.now();
      } else {
        p.children[name] = file(name, content, kind);
      }
      p.mtime = Date.now();
      fs.flush();
      return true;
    },

    /** A file whose bytes live in IndexedDB rather than in the tree. */
    writeMedia: function (path, mediaId, kind, size, mime) {
      var p = fs.parent(path);
      if (!p || p.type !== "dir") return false;
      var name = fs.basename(path);
      p.children[name] = {
        type: "file",
        name: name,
        kind: kind || "file",
        media: mediaId,
        size: size || 0,
        mime: mime || "",
        mtime: Date.now()
      };
      p.mtime = Date.now();
      fs.flush();
      return true;
    },

    /** True for a node backed by a real uploaded/exported file. */
    isMedia: function (node) { return !!(node && node.media); },

    mkdir: function (path) {
      var p = fs.parent(path);
      if (!p || p.type !== "dir") return false;
      var name = fs.basename(path);
      if (p.children[name]) return false;
      p.children[name] = dir(name, {});
      fs.flush();
      return true;
    },

    remove: function (path) {
      var p = fs.parent(path);
      var name = fs.basename(path);
      if (!p || !p.children[name]) return false;

      // collect any blobs about to be orphaned
      var doomed = [];
      (function collect(node) {
        if (!node) return;
        if (node.media) doomed.push(node.media);
        if (node.type === "dir") {
          Object.keys(node.children).forEach(function (k) { collect(node.children[k]); });
        }
      })(p.children[name]);

      delete p.children[name];
      p.mtime = Date.now();
      fs.flush();

      if (doomed.length && DS.media) {
        doomed.forEach(function (id) { DS.media.del(id); });
      }
      return true;
    },

    rename: function (path, newName) {
      var p = fs.parent(path);
      var name = fs.basename(path);
      if (!p || !p.children[name] || p.children[newName]) return false;
      var node = p.children[name];
      node.name = newName;
      node.mtime = Date.now();
      delete p.children[name];
      p.children[newName] = node;
      fs.flush();
      return true;
    },

    /** A free filename in dir, e.g. "untitled 2.md". */
    freeName: function (dirPath, base, ext) {
      var n = fs.node(dirPath);
      if (!n) return base + ext;
      if (!n.children[base + ext]) return base + ext;
      for (var i = 2; i < 500; i++) {
        if (!n.children[base + " " + i + ext]) return base + " " + i + ext;
      }
      return base + " " + Date.now() + ext;
    },

    /** Depth-first walk, used by the launcher's file search. */
    walk: function (path, cb, depth) {
      var n = fs.node(path);
      if (!n || n.type !== "dir" || (depth || 0) > 8) return;
      Object.keys(n.children).forEach(function (k) {
        var c = n.children[k];
        var cp = join(path, c.name);
        cb(c, cp);
        if (c.type === "dir") fs.walk(cp, cb, (depth || 0) + 1);
      });
    },

    join: join,
    split: split,
    HOME: "/Users/you"
  };

  DS.fs = fs;
})(window.DS);
