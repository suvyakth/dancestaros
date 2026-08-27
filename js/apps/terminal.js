/* ═══════════════════════════════════════════════════════════════
   terminal.js — a real shell over the virtual file system
   Can also drive the compositor: `glass blur 40`, `theme sunset`.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var LOGO = [
    "        /\\        ",
    "       /  \\       ",
    "      / /\\ \\      ",
    "     / /  \\ \\     ",
    "    / /    \\ \\    ",
    "   / /  /\\  \\ \\   ",
    "  / /  /  \\  \\ \\  ",
    " /_/__/____\\__\\_\\ "
  ];

  DS.apps.register({
    id: "terminal",
    name: "Terminal",
    icon: "terminal",
    w: 700, h: 440, minW: 420, minH: 240,
    flush: true,

    mount: function (body, api) {
      var cwd = "/Users/you";
      var history = [];
      var hIdx = -1;

      var out = h("div.tm-out");
      var promptEl = h("span.tm-prompt");
      var input = h("input.tm-input", { spellcheck: "false", autocomplete: "off" });
      var row = h("div.tm-row", {}, [promptEl, input]);
      var pane = h("div.tm-pane", {}, [out, row]);
      body.appendChild(pane);

      function shortCwd() {
        return cwd === fs.HOME ? "~" : cwd.indexOf(fs.HOME) === 0 ? "~" + cwd.slice(fs.HOME.length) : cwd;
      }
      function drawPrompt() {
        DS.clear(promptEl);
        promptEl.appendChild(h("i", { text: DS.store.get("user", "you") + "@dancestar" }));
        promptEl.appendChild(h("b", { text: " " + shortCwd() }));
        promptEl.appendChild(h("u", { text: " $ " }));
      }

      function write(text, cls) {
        var line = h("pre.tm-line" + (cls ? "." + cls : ""), { text: text });
        out.appendChild(line);
        pane.scrollTop = pane.scrollHeight;
        return line;
      }
      function writeEcho(cmd) {
        var line = h("pre.tm-line.echo");
        line.appendChild(h("span.tm-pre", { text: DS.store.get("user", "you") + "@dancestar " + shortCwd() + " $ " }));
        line.appendChild(h("span", { text: cmd }));
        out.appendChild(line);
      }

      /* ── path resolution ── */
      function resolve(arg) {
        if (!arg) return cwd;
        var p = arg;
        if (p === "~") return fs.HOME;
        if (p.indexOf("~/") === 0) p = fs.HOME + "/" + p.slice(2);
        var abs = p.charAt(0) === "/" ? p : cwd + "/" + p;
        var stack = [];
        fs.split(abs).forEach(function (s) {
          if (s === ".") return;
          if (s === "..") { stack.pop(); return; }
          stack.push(s);
        });
        return "/" + stack.join("/");
      }

      /* ── commands ── */
      var CMDS = {};

      CMDS.help = function () {
        write("Dancestar OS shell — available commands\n");
        var rows = [
          ["ls [path]",        "list a directory"],
          ["cd <path>",        "change directory"],
          ["pwd",              "print working directory"],
          ["cat <file>",       "print a file"],
          ["tree [path]",      "show the tree below a path"],
          ["mkdir <name>",     "create a directory"],
          ["touch <name>",     "create an empty file"],
          ["write <f> <text>", "write text to a file"],
          ["rm <path>",        "delete a file or directory"],
          ["mv <a> <b>",       "rename within a directory"],
          ["open <app|file>",  "launch an app or open a file"],
          ["apps",             "list installed apps"],
          ["theme <name>",     "aurora sunset abyss verdant lumen"],
          ["glass <k> <v>",    "set an optical value live"],
          ["glass",            "print the optical configuration"],
          ["echo <text>",      "print text"],
          ["neofetch",         "system summary"],
          ["date",             "current date and time"],
          ["whoami",           "current user"],
          ["clear",            "clear the screen"],
          ["exit",             "close the terminal"]
        ];
        rows.forEach(function (r) {
          write("  " + r[0] + Array(Math.max(1, 20 - r[0].length)).join(" ") + "  " + r[1]);
        });
      };

      CMDS.ls = function (args) {
        var target = resolve(args[0]);
        var node = fs.node(target);
        if (!node) return write("ls: " + (args[0] || target) + ": no such file or directory", "err");
        if (node.type === "file") return write(node.name);
        var items = fs.list(target);
        if (!items.length) return write("(empty)", "dim");
        items.forEach(function (i) {
          var size = i.type === "dir" ? "-" : DS.bytes(i.size);
          write("  " + (i.type === "dir" ? "d" : "-") + "  " +
                pad(size, 9) + "  " + pad(DS.when(i.mtime), 14) + "  " +
                i.name + (i.type === "dir" ? "/" : ""),
                i.type === "dir" ? "dir" : null);
        });
      };

      function pad(s, n) {
        s = String(s);
        return s.length >= n ? s : s + Array(n - s.length + 1).join(" ");
      }

      CMDS.cd = function (args) {
        var target = resolve(args[0] || "~");
        var node = fs.node(target);
        if (!node) return write("cd: " + args[0] + ": no such directory", "err");
        if (node.type !== "dir") return write("cd: " + args[0] + ": not a directory", "err");
        cwd = target;
        drawPrompt();
      };

      CMDS.pwd = function () { write(cwd); };

      CMDS.cat = function (args) {
        if (!args[0]) return write("cat: missing file", "err");
        var target = resolve(args[0]);
        var node = fs.node(target);
        if (!node) return write("cat: " + args[0] + ": no such file", "err");
        if (node.type === "dir") return write("cat: " + args[0] + ": is a directory", "err");
        if (node.kind === "image") return write("(image: " + node.content + ")", "dim");
        write(node.content || "(empty file)");
      };

      CMDS.tree = function (args) {
        var target = resolve(args[0]);
        if (!fs.exists(target)) return write("tree: no such path", "err");
        write(target);
        (function walk(path, prefix, depth) {
          if (depth > 4) return;
          var items = fs.list(path);
          items.forEach(function (i, idx) {
            var last = idx === items.length - 1;
            write(prefix + (last ? "└── " : "├── ") + i.name + (i.type === "dir" ? "/" : ""),
                  i.type === "dir" ? "dir" : null);
            if (i.type === "dir") walk(i.path, prefix + (last ? "    " : "│   "), depth + 1);
          });
        })(target, "", 0);
      };

      CMDS.mkdir = function (args) {
        if (!args[0]) return write("mkdir: missing name", "err");
        var ok = fs.mkdir(resolve(args[0]));
        if (!ok) write("mkdir: cannot create " + args[0], "err");
      };

      CMDS.touch = function (args) {
        if (!args[0]) return write("touch: missing name", "err");
        fs.write(resolve(args[0]), "");
      };

      CMDS.write = function (args) {
        if (args.length < 2) return write("write: usage: write <file> <text>", "err");
        var target = resolve(args[0]);
        fs.write(target, args.slice(1).join(" "));
        write("wrote " + args.slice(1).join(" ").length + " bytes to " + target, "dim");
      };

      CMDS.rm = function (args) {
        if (!args[0]) return write("rm: missing path", "err");
        var target = resolve(args[0]);
        if (target === "/" || target === fs.HOME) return write("rm: refusing to remove " + target, "err");
        if (!fs.remove(target)) write("rm: " + args[0] + ": no such file", "err");
      };

      CMDS.mv = function (args) {
        if (args.length < 2) return write("mv: usage: mv <path> <newname>", "err");
        if (!fs.rename(resolve(args[0]), args[1])) write("mv: failed", "err");
      };

      CMDS.echo = function (args) { write(args.join(" ")); };

      CMDS.open = function (args) {
        if (!args[0]) return write("open: usage: open <app|file>", "err");
        if (DS.apps.get(args[0])) { DS.wm.open(args[0]); return write("launching " + args[0], "dim"); }
        var target = resolve(args[0]);
        if (fs.exists(target)) { DS.openPath(target); return write("opening " + target, "dim"); }
        write("open: " + args[0] + ": not an app or a file", "err");
      };

      CMDS.apps = function () {
        DS.apps.all().forEach(function (a) { write("  " + pad(a.id, 12) + a.name); });
      };

      CMDS.theme = function (args) {
        var valid = ["aurora", "sunset", "abyss", "verdant", "lumen"];
        if (!args[0]) return write("current theme: " + DS.store.get("theme"));
        if (valid.indexOf(args[0]) < 0) return write("theme: unknown. try: " + valid.join(", "), "err");
        DS.store.set("theme", args[0]);
        DS.glass.applyTheme();
        write("theme set to " + args[0], "ok");
      };

      var GKEYS = {
        blur: [4, 60, "px"], alpha: [0, 40, "%"], sat: [100, 320, "%"],
        bright: [80, 140, "%"], thick: [0, 4, "px"], disperse: [0, 160, "%"],
        sheen: [0, 150, "%"], radius: [0, 40, "px"]
      };

      CMDS.glass = function (args) {
        var g = DS.store.get("glass");
        if (!args[0]) {
          write("optical configuration");
          Object.keys(GKEYS).forEach(function (k) {
            write("  " + pad(k, 10) + g[k] + GKEYS[k][2]);
          });
          write("  " + pad("refract", 10) + (DS.store.get("refraction") ? "on" : "off"));
          return;
        }
        if (args[0] === "refract") {
          var on = args[1] !== "off" && args[1] !== "0";
          DS.store.set("refraction", on);
          DS.glass.redress();
          return write("refraction " + (on ? "on" : "off"), "ok");
        }
        if (!GKEYS[args[0]]) return write("glass: unknown key. try: " + Object.keys(GKEYS).join(", "), "err");
        if (args[1] === undefined) return write(args[0] + " = " + g[args[0]] + GKEYS[args[0]][2]);
        var v = parseFloat(args[1]);
        if (isNaN(v)) return write("glass: not a number: " + args[1], "err");
        var rng = GKEYS[args[0]];
        v = DS.clamp(v, rng[0], rng[1]);
        DS.store.set("glass." + args[0], v);
        DS.glass.apply();
        if (DS.qs("#settings-sync")) DS.qs("#settings-sync").click();
        write(args[0] + " = " + v + rng[2], "ok");
      };

      CMDS.date = function () { write(new Date().toString()); };
      CMDS.whoami = function () { write(DS.store.get("user", "you")); };
      CMDS.clear = function () { DS.clear(out); };
      CMDS.exit = function () { api.close(); };

      CMDS.neofetch = function () {
        var g = DS.store.get("glass");
        var info = [
          DS.store.get("user", "you") + "@dancestar",
          "-----------------",
          "OS        Dancestar OS 1.0 (First Light)",
          "Shell     dsh 1.0",
          "Theme     " + DS.store.get("theme"),
          "Windows   " + DS.wm.list().length + " open",
          "Apps      " + DS.apps.all().length + " installed",
          "Blur      " + g.blur + "px",
          "Tint      " + (g.alpha / 100).toFixed(3) + " alpha",
          "Dispersn  " + (g.disperse / 100).toFixed(2),
          "Refract   " + (DS.store.get("refraction") ? "enabled" : "disabled"),
          "Opaque px 0"
        ];
        var n = Math.max(LOGO.length, info.length);
        for (var i = 0; i < n; i++) {
          var l = LOGO[i] || Array(19).join(" ");
          write(l + "  " + (info[i] || ""), i < 2 ? "ok" : null);
        }
      };

      /* ── dispatch ── */
      function run(raw) {
        var line = raw.trim();
        writeEcho(raw);
        if (!line) return;
        history.push(line);
        hIdx = history.length;

        var parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        parts = parts.map(function (p) { return p.replace(/^"|"$/g, ""); });
        var cmd = parts.shift();

        if (CMDS[cmd]) {
          try { CMDS[cmd](parts); }
          catch (err) { write(cmd + ": " + err.message, "err"); }
        } else {
          write("dsh: command not found: " + cmd + "  (try: help)", "err");
        }
        pane.scrollTop = pane.scrollHeight;
      }

      /* ── tab completion ── */
      function complete() {
        var val = input.value;
        var parts = val.split(" ");
        var frag = parts[parts.length - 1];

        if (parts.length === 1) {
          var hits = Object.keys(CMDS).filter(function (c) { return c.indexOf(frag) === 0; });
          if (hits.length === 1) input.value = hits[0] + " ";
          else if (hits.length > 1) write(hits.join("   "), "dim");
          return;
        }
        var slash = frag.lastIndexOf("/");
        var dirPart = slash >= 0 ? frag.slice(0, slash + 1) : "";
        var namePart = slash >= 0 ? frag.slice(slash + 1) : frag;
        var listing = fs.list(resolve(dirPart || "."));
        var matches = listing.filter(function (i) { return i.name.indexOf(namePart) === 0; });
        if (matches.length === 1) {
          parts[parts.length - 1] = dirPart + matches[0].name + (matches[0].type === "dir" ? "/" : "");
          input.value = parts.join(" ");
        } else if (matches.length > 1) {
          write(matches.map(function (m) { return m.name; }).join("   "), "dim");
        }
      }

      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var v = input.value;
          input.value = "";
          run(v);
        } else if (e.key === "Tab") {
          e.preventDefault();
          complete();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (hIdx > 0) { hIdx -= 1; input.value = history[hIdx]; }
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (hIdx < history.length - 1) { hIdx += 1; input.value = history[hIdx]; }
          else { hIdx = history.length; input.value = ""; }
        } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          CMDS.clear();
        }
      });

      pane.addEventListener("pointerup", function (e) {
        if (window.getSelection().toString()) return;
        input.focus();
      });

      drawPrompt();
      write("Dancestar OS 1.0 — dsh shell. Type `help` for commands, `neofetch` for a summary.", "ok");
      write("");
      setTimeout(function () { input.focus(); }, 80);
    }
  });
})(window.DS);
