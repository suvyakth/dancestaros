/* ═══════════════════════════════════════════════════════════════
   terminal.js — dsh, the Dancestar shell

   A real shell over the virtual file system that can also drive the
   compositor (`glass blur 40`, `theme sunset`, `party`), teach itself
   (`tutorial`), and be extended by the user at runtime (`define`).

   User-defined commands are stored in localStorage and survive a
   reload, so anything invented here becomes part of the OS.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var LOGO = [
    "      /\\      ",
    "     /  \\     ",
    "    / /\\ \\    ",
    "   / /  \\ \\   ",
    "  / / /\\ \\ \\  ",
    " /_/_/  \\_\\_\\ "
  ];

  /* 4x5 block font for `banner` */
  var FONT = {
    A: " ██ /█  █/████/█  █/█  █", B: "███ /█  █/███ /█  █/███ ",
    C: " ███/█   /█   /█   / ███", D: "███ /█  █/█  █/█  █/███ ",
    E: "████/█   /███ /█   /████", F: "████/█   /███ /█   /█   ",
    G: " ███/█   /█ ██/█  █/ ███", H: "█  █/█  █/████/█  █/█  █",
    I: "████/ ██ / ██ / ██ /████", J: "████/  █ /  █ /█ █ / ██ ",
    K: "█  █/█ █ /██  /█ █ /█  █", L: "█   /█   /█   /█   /████",
    M: "█  █/████/████/█  █/█  █", N: "█  █/██ █/████/█ ██/█  █",
    O: " ██ /█  █/█  █/█  █/ ██ ", P: "███ /█  █/███ /█   /█   ",
    Q: " ██ /█  █/█  █/█ ██/ ███", R: "███ /█  █/███ /█ █ /█  █",
    S: " ███/█   / ██ /   █/███ ", T: "████/ ██ / ██ / ██ / ██ ",
    U: "█  █/█  █/█  █/█  █/ ██ ", V: "█  █/█  █/█  █/ ██ / ██ ",
    W: "█  █/█  █/████/████/█  █", X: "█  █/ ██ / ██ / ██ /█  █",
    Y: "█  █/█  █/ ██ / ██ / ██ ", Z: "████/  █ / ██ /█   /████",
    "0": " ██ /█  █/█  █/█  █/ ██ ", "1": " ██ /███ / ██ / ██ /████",
    "2": "███ /   █/ ██ /█   /████", "3": "███ /   █/ ██ /   █/███ ",
    "4": "█  █/█  █/████/   █/   █", "5": "████/█   /███ /   █/███ ",
    "6": " ███/█   /████/█  █/ ██ ", "7": "████/   █/  █ / █  / █  ",
    "8": " ██ /█  █/ ██ /█  █/ ██ ", "9": " ██ /█  █/████/   █/███ ",
    " ": "    /    /    /    /    ", "!": " ██ / ██ / ██ /    / ██ ",
    "?": "███ /   █/ ██ /    / ██ ", ".": "    /    /    /    / ██ ",
    "-": "    /    /████/    /    "
  };

  var FORTUNES = [
    "Glass is honest: it shows you everything behind it, including your mistakes.",
    "If your transparent UI needs a solid background to be readable, it was never transparent.",
    "Blur hides detail. Dispersion suggests depth. Only one of them is glass.",
    "The edge of a pane carries more information than the middle.",
    "Any sufficiently high tint alpha is indistinguishable from plastic.",
    "A window you cannot find is worse than a window you cannot see through.",
    "Refraction is expensive. Spend it at the edges, where the eye looks.",
    "Every backdrop-filter is a promise you make to the compositor.",
    "Contrast is not a feature you add at the end.",
    "Make the focused thing brightest. Everything else is decoration."
  ];

  var JOKES = [
    "There are two hard problems in UI: naming things, cache invalidation, and off-by-one contrast ratios.",
    "I told the compositor a joke about transparency. It saw right through it.",
    "My glass UI has no bugs. They are just very hard to see.",
    "A CSS developer walks into a bar. And a pub. And a tavern.",
    "Why did the window lose focus? It had nothing opaque to hold on to.",
    "I would tell you a joke about backdrop-filter, but it would take four frames to land."
  ];

  DS.apps.register({
    id: "terminal",
    name: "Terminal",
    icon: "terminal",
    w: 760, h: 500, minW: 460, minH: 260,
    flush: true,

    mount: function (body, api) {
      var cwd = "/Users/you";
      var history = [];
      var hIdx = -1;
      var timers = [];
      var tut = -1;                       // tutorial step, -1 = inactive

      var out = h("div.tm-out");
      var promptEl = h("span.tm-prompt");
      var input = h("input.tm-input", { spellcheck: "false", autocomplete: "off" });
      var row = h("div.tm-row", {}, [promptEl, input]);
      var pane = h("div.tm-pane", {}, [out, row]);
      body.appendChild(pane);

      /* ───────────── output helpers ───────────── */
      function write(text, cls) {
        var line = h("pre.tm-line" + (cls ? "." + cls : ""), { text: text });
        out.appendChild(line);
        pane.scrollTop = pane.scrollHeight;
        return line;
      }
      function blank() { write(""); }

      function box(lines, cls) {
        var w = 0;
        lines.forEach(function (l) { w = Math.max(w, l.length); });
        write("╭─" + rep("─", w) + "─╮", cls);
        lines.forEach(function (l) {
          write("│ " + l + rep(" ", w - l.length) + " │", cls);
        });
        write("╰─" + rep("─", w) + "─╯", cls);
      }
      function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ""; }
      function pad(s, n) {
        s = String(s);
        return s.length >= n ? s : s + rep(" ", n - s.length);
      }

      /* Animate in place: claim some lines, rewrite them each frame,
         leave the last frame on screen. Everything visual in the shell
         is built on this. */
      function animate(height, frames, ms, done) {
        var rows = [];
        for (var i = 0; i < height; i++) {
          var pre = h("pre.tm-line.dir", { text: "" });
          out.appendChild(pre);
          rows.push(pre);
        }
        var n = 0;
        var iv = setInterval(function () {
          var f = frames(n);
          if (!f) {
            clearInterval(iv);
            if (done) done(rows);
            return;
          }
          for (var r = 0; r < height; r++) rows[r].textContent = f[r] || "";
          pane.scrollTop = pane.scrollHeight;
          n += 1;
        }, ms);
        timers.push(iv);
        return rows;
      }

      /* ── the shell can ask questions back ──
         `asking` swallows the next line instead of running it, which is
         what makes the guided builders below possible. */
      var asking = null;
      function ask(question, cb, hint) {
        write("");
        write("  " + question, "ok");
        if (hint) write("  " + hint, "dim");
        asking = cb;
        promptEl.classList.add("asking");
        drawPrompt();
      }
      function stopAsking() {
        asking = null;
        promptEl.classList.remove("asking");
        drawPrompt();
      }

      function shortCwd() {
        if (cwd === fs.HOME) return "~";
        return cwd.indexOf(fs.HOME) === 0 ? "~" + cwd.slice(fs.HOME.length) : cwd;
      }
      function drawPrompt() {
        DS.clear(promptEl);
        if (asking) {
          promptEl.appendChild(h("i", { text: "answer" }));
          promptEl.appendChild(h("u", { text: " › " }));
          return;
        }
        promptEl.appendChild(h("i", { text: DS.store.get("user", "you") + "@dancestar" }));
        promptEl.appendChild(h("b", { text: " " + shortCwd() }));
        promptEl.appendChild(h("u", { text: " $ " }));
      }
      function writeEcho(cmd) {
        var line = h("pre.tm-line.echo");
        line.appendChild(h("span.tm-pre", {
          text: DS.store.get("user", "you") + "@dancestar " + shortCwd() + " $ "
        }));
        line.appendChild(h("span", { text: cmd }));
        out.appendChild(line);
      }

      /* ───────────── path resolution ───────────── */
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

      /* ───────────── command table ───────────── */
      var CMDS = {};
      function cmd(name, group, usage, desc, fn) {
        CMDS[name] = { group: group, usage: usage, desc: desc, fn: fn };
      }

      /* ── files ── */
      cmd("ls", "files", "ls [path]", "list a directory", function (a) {
        var target = resolve(a[0]);
        var node = fs.node(target);
        if (!node) return write("ls: " + (a[0] || target) + ": no such file or directory", "err");
        if (node.type === "file") return write(node.name);
        var items = fs.list(target);
        if (!items.length) return write("(empty)", "dim");
        items.forEach(function (i) {
          write("  " + (i.type === "dir" ? "d" : "-") + "  " +
                pad(i.type === "dir" ? "-" : DS.bytes(i.size), 9) + "  " +
                pad(DS.when(i.mtime), 14) + "  " + i.name + (i.type === "dir" ? "/" : ""),
                i.type === "dir" ? "dir" : null);
        });
      });

      cmd("cd", "files", "cd <path>", "change directory", function (a) {
        var target = resolve(a[0] || "~");
        var node = fs.node(target);
        if (!node) return write("cd: " + a[0] + ": no such directory", "err");
        if (node.type !== "dir") return write("cd: " + a[0] + ": not a directory", "err");
        cwd = target;
        drawPrompt();
      });

      cmd("pwd", "files", "pwd", "print working directory", function () { write(cwd); });

      cmd("cat", "files", "cat <file>", "print a file", function (a) {
        if (!a[0]) return write("cat: missing file", "err");
        var node = fs.node(resolve(a[0]));
        if (!node) return write("cat: " + a[0] + ": no such file", "err");
        if (node.type === "dir") return write("cat: " + a[0] + ": is a directory", "err");
        if (node.kind === "image") return write("(image: " + node.content + ")", "dim");
        write(node.content || "(empty file)");
      });

      cmd("tree", "files", "tree [path]", "show the tree below a path", function (a) {
        var target = resolve(a[0]);
        if (!fs.exists(target)) return write("tree: no such path", "err");
        write(target, "dir");
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
      });

      cmd("mkdir", "files", "mkdir <name>", "create a directory", function (a) {
        if (!a[0]) return write("mkdir: missing name", "err");
        if (!fs.mkdir(resolve(a[0]))) write("mkdir: cannot create " + a[0], "err");
      });

      cmd("touch", "files", "touch <name>", "create an empty file", function (a) {
        if (!a[0]) return write("touch: missing name", "err");
        fs.write(resolve(a[0]), "");
      });

      cmd("write", "files", "write <file> <text>", "write text to a file", function (a) {
        if (a.length < 2) return write("write: usage: write <file> <text>", "err");
        var text = a.slice(1).join(" ");
        fs.write(resolve(a[0]), text);
        write("wrote " + text.length + " bytes to " + resolve(a[0]), "dim");
      });

      cmd("rm", "files", "rm <path>", "delete a file or directory", function (a) {
        if (!a[0]) return write("rm: missing path", "err");
        var target = resolve(a[0]);
        if (target === "/" || target === fs.HOME) {
          return write("rm: refusing to remove " + target + " — nice try", "err");
        }
        if (!fs.remove(target)) write("rm: " + a[0] + ": no such file", "err");
      });

      cmd("mv", "files", "mv <path> <name>", "rename within a directory", function (a) {
        if (a.length < 2) return write("mv: usage: mv <path> <newname>", "err");
        if (!fs.rename(resolve(a[0]), a[1])) write("mv: failed", "err");
      });

      cmd("edit", "files", "edit <file>", "open a file in its editor", function (a) {
        if (!a[0]) return write("edit: missing file", "err");
        var t = resolve(a[0]);
        if (!fs.exists(t)) fs.write(t, "");
        var n = fs.node(t);
        var app = n.kind === "image" ? "imagelab"
                : n.kind === "audio" ? "audiolab"
                : n.kind === "video" ? "videolab" : null;
        if (app) { DS.wm.open(app, { path: t }); return write("opened in " + app, "dim"); }
        DS.openPath(t);
        write("opened " + t + " in Notes", "dim");
      });

      cmd("import", "files", "import", "bring real files in from your computer",
        function () {
          write("  opening the file picker...", "dim");
          DS.media.pick(null, cwd).then(function (made) {
            if (!made.length) return write("  nothing imported", "dim");
            made.forEach(function (m) {
              write("  " + pad(m.kind, 7) + pad(DS.bytes(m.size), 11) + m.path, "ok");
            });
          });
        });

      cmd("media", "system", "media", "what is stored in IndexedDB", function () {
        if (!DS.media.available) return write("media: IndexedDB unavailable", "err");
        write("  reading...", "dim");
        DS.media.usage().then(function (u) {
          box([
            "IndexedDB  dancestar-media",
            "",
            "files      " + u.count,
            "bytes      " + DS.bytes(u.bytes),
            "browser    " + DS.bytes(u.used) + " used of about " + DS.bytes(u.quota),
            "",
            "Settings > Storage can sweep orphaned blobs."
          ], "ok");
        });
      });

      /* ── system ── */
      cmd("open", "system", "open <app|file>", "launch an app or open a file", function (a) {
        if (!a[0]) return write("open: usage: open <app|file>", "err");
        if (DS.apps.get(a[0])) { DS.wm.open(a[0]); return write("launching " + a[0], "dim"); }
        var t = resolve(a[0]);
        if (fs.exists(t)) { DS.openPath(t); return write("opening " + t, "dim"); }
        write("open: " + a[0] + ": not an app or a file", "err");
      });

      cmd("apps", "system", "apps", "list installed apps", function () {
        DS.apps.all().forEach(function (x) { write("  " + pad(x.id, 12) + x.name); });
      });

      cmd("whoami", "system", "whoami", "current user", function () {
        write(DS.store.get("user", "you"));
      });

      cmd("me", "system", "me", "your profile", function () {
        var a = DS.store.get("avatar", {});
        box([
          "  " + (a.glyph || "✦") + "   " + DS.store.get("user", "you"),
          "",
          "theme    " + DS.store.get("theme"),
          "accent   " + (DS.store.get("accentHue") === null
                          ? "follows theme" : "hue " + DS.store.get("accentHue")),
          "commands " + Object.keys(DS.store.get("customCmds", {})).length + " of your own"
        ], "ok");
      });

      cmd("do", "system", "do [action]", "run any system action by id", function (a) {
        if (!a[0]) {
          write("every invocable thing in the OS, by id:", "ok");
          var group = null;
          DS.actions.all().forEach(function (x) {
            if (x.group !== group) { group = x.group; write(""); write("  " + group, "dir"); }
            write("    " + pad(x.id, 22) + x.label);
          });
          write("");
          write("bind one to a key in Settings > Shortcuts", "dim");
          return;
        }
        var act = DS.actions.get(a[0]);
        if (!act) return write("do: no such action: " + a[0], "err");
        DS.actions.run(a[0]);
        write("  " + act.label, "ok");
      });

      cmd("keys", "system", "keys", "your keyboard shortcuts", function () {
        var mine = DS.store.get("shortcuts", []);
        write("built in", "ok");
        Object.keys(DS.actions.RESERVED).forEach(function (c) {
          write("  " + pad(c, 14) + DS.actions.RESERVED[c]);
        });
        write("");
        if (!mine.length) {
          write("you have not bound any yet - Settings > Shortcuts", "dim");
          return;
        }
        write("yours", "ok");
        mine.forEach(function (sc) {
          var act = DS.actions.get(sc.action);
          write("  " + pad(sc.combo, 14) + (act ? act.label : sc.action));
        });
      });

      cmd("light", "glass", "light <x> <y>", "move the desktop light source", function (a) {
        if (!a[0]) {
          var l = DS.store.get("light");
          return write("light at " + l.x + "% " + l.y + "%, strength " + l.strength + "%");
        }
        if (a[0] === "drift") {
          var v = !DS.store.get("light.drift");
          DS.store.set("light.drift", v);
          return write("light drift " + (v ? "on" : "off"), "ok");
        }
        DS.store.set("light.x", DS.clamp(parseFloat(a[0]) || 0, 0, 100));
        if (a[1] !== undefined) DS.store.set("light.y", DS.clamp(parseFloat(a[1]) || 0, -10, 100));
        DS.glass.applyLight();
        write("light moved", "ok");
      });

      cmd("finish", "glass", "finish <name>", "surface relief on every pane", function (a) {
        var names = Object.keys(DS.glass.FINISHES);
        if (!a[0]) {
          write("finishes:", "ok");
          names.forEach(function (n) {
            write("  " + pad(n, 11) + DS.glass.FINISHES[n].desc);
          });
          return write("  current: " + DS.store.get("finish", "smooth"), "dim");
        }
        if (names.indexOf(a[0]) < 0) {
          return write("finish: unknown. try: " + names.join(", "), "err");
        }
        DS.store.set("finish", a[0]);
        DS.glass.applyFinish();
        write("finish set to " + a[0], "ok");
      });

      cmd("date", "system", "date", "current date and time", function () {
        write(new Date().toString());
      });

      cmd("history", "system", "history", "commands you have run", function () {
        if (!history.length) return write("(nothing yet)", "dim");
        history.forEach(function (c, i) { write("  " + pad(i + 1, 4) + c); });
      });

      cmd("clear", "system", "clear", "clear the screen", function () { DS.clear(out); });
      cmd("exit", "system", "exit", "close the terminal", function () { api.close(); });

      cmd("neofetch", "system", "neofetch", "system summary", function () {
        var g = DS.store.get("glass");
        var info = [
          DS.store.get("user", "you") + "@dancestar",
          "-----------------",
          "OS        Dancestar OS 1.0 (First Light)",
          "Shell     dsh 1.1",
          "Theme     " + DS.store.get("theme"),
          "Windows   " + DS.wm.list().length + " open",
          "Apps      " + DS.apps.all().length + " installed",
          "Blur      " + g.blur + "px",
          "Tint      " + (g.alpha / 100).toFixed(3) + " alpha",
          "Dispersn  " + (g.disperse / 100).toFixed(2),
          "Yours     " + Object.keys(DS.store.get("customCmds", {})).length + " custom commands",
          "Opaque px 0"
        ];
        var n = Math.max(LOGO.length, info.length);
        for (var i = 0; i < n; i++) {
          write(pad(LOGO[i] || "", 15) + " " + (info[i] || ""), i < 2 ? "ok" : null);
        }
      });

      /* ── glass ── */
      var GKEYS = {
        blur: [4, 60, "px"], alpha: [0, 40, "%"], sat: [100, 320, "%"],
        bright: [80, 140, "%"], thick: [0, 4, "px"], disperse: [0, 160, "%"],
        sheen: [0, 150, "%"], radius: [0, 40, "px"]
      };

      function syncSettings() {
        var b = DS.qs("#settings-sync");
        if (b) b.click();
      }

      cmd("glass", "glass", "glass [key] [value]", "read or set an optical property", function (a) {
        var g = DS.store.get("glass");
        if (!a[0]) {
          write("optical configuration", "ok");
          Object.keys(GKEYS).forEach(function (k) {
            write("  " + pad(k, 10) + g[k] + GKEYS[k][2]);
          });
          write("  " + pad("refract", 10) + (DS.store.get("refraction") ? "on" : "off"));
          write("");
          write("try: glass disperse 0    (watch it become plastic)", "dim");
          return;
        }
        if (a[0] === "refract") {
          var on = a[1] !== "off" && a[1] !== "0";
          DS.store.set("refraction", on);
          DS.glass.redress();
          return write("refraction " + (on ? "on" : "off"), "ok");
        }
        if (!GKEYS[a[0]]) {
          return write("glass: unknown key. try: " + Object.keys(GKEYS).join(", "), "err");
        }
        if (a[1] === undefined) return write(a[0] + " = " + g[a[0]] + GKEYS[a[0]][2]);
        var v = a[1] === "random"
          ? Math.round(GKEYS[a[0]][0] + Math.random() * (GKEYS[a[0]][1] - GKEYS[a[0]][0]))
          : parseFloat(a[1]);
        if (isNaN(v)) return write("glass: not a number: " + a[1], "err");
        v = DS.clamp(v, GKEYS[a[0]][0], GKEYS[a[0]][1]);
        DS.store.set("glass." + a[0], v);
        DS.glass.apply();
        syncSettings();
        write(a[0] + " = " + v + GKEYS[a[0]][2], "ok");
      });

      cmd("preset", "glass", "preset <name>", "apply an optical preset", function (a) {
        var names = Object.keys(DS.glass.PRESETS);
        if (!a[0]) {
          write("presets:", "ok");
          names.forEach(function (n) {
            write("  " + pad(n, 10) + DS.glass.PRESETS[n].desc);
          });
          return;
        }
        if (!DS.glass.usePreset(a[0])) {
          return write("preset: unknown. try: " + names.join(", "), "err");
        }
        syncSettings();
        write("applied preset: " + DS.glass.PRESETS[a[0]].label, "ok");
      });

      cmd("theme", "glass", "theme <name>", "switch theme (or `random`)", function (a) {
        var valid = ["aurora", "sunset", "abyss", "verdant", "obsidian", "lumen"];
        if (!a[0]) return write("current theme: " + DS.store.get("theme"));
        var t = a[0] === "random" ? valid[Math.floor(Math.random() * valid.length)] : a[0];
        if (valid.indexOf(t) < 0) return write("theme: unknown. try: " + valid.join(", "), "err");
        DS.store.set("theme", t);
        DS.glass.applyTheme();
        write("theme set to " + t, "ok");
      });

      cmd("accent", "glass", "accent <hue|off>", "set the accent hue, 0-359", function (a) {
        if (!a[0]) {
          var cur = DS.store.get("accentHue");
          return write("accent: " + (cur === null ? "follows theme" : "hue " + cur));
        }
        if (a[0] === "off" || a[0] === "auto") {
          DS.store.set("accentHue", null);
          DS.glass.applyAccent();
          return write("accent follows the theme again", "ok");
        }
        var hu = a[0] === "random" ? Math.floor(Math.random() * 360) : parseInt(a[0], 10);
        if (isNaN(hu)) return write("accent: expected 0-359, `random`, or `off`", "err");
        DS.store.set("accentHue", ((hu % 360) + 360) % 360);
        DS.glass.applyAccent();
        write("accent hue " + DS.store.get("accentHue"), "ok");
      });

      /* ── fun ── */
      cmd("fortune", "fun", "fortune", "a thought about glass", function () {
        write("  " + FORTUNES[Math.floor(Math.random() * FORTUNES.length)], "ok");
      });

      cmd("joke", "fun", "joke", "a bad one", function () {
        write("  " + JOKES[Math.floor(Math.random() * JOKES.length)], "ok");
      });

      cmd("roll", "fun", "roll [NdM]", "roll dice, e.g. roll 2d20", function (a) {
        var m = /^(\d*)d(\d+)$/i.exec(a[0] || "1d6");
        if (!m) return write("roll: try `roll 2d20`", "err");
        var n = Math.min(parseInt(m[1] || "1", 10), 20);
        var sides = Math.min(parseInt(m[2], 10), 1000);
        var rolls = [], total = 0;
        for (var i = 0; i < n; i++) {
          var r = 1 + Math.floor(Math.random() * sides);
          rolls.push(r);
          total += r;
        }

        // six-siders get to tumble; anything else just lands
        if (sides === 6 && n <= 4) {
          var tumbles = 13;
          animate(6, function (fr) {
            if (fr > tumbles) return null;
            var faces = [];
            for (var d = 0; d < n; d++) {
              faces.push(dieFace(fr === tumbles
                ? rolls[d]
                : 1 + Math.floor(Math.random() * 6)));
            }
            var out2 = [];
            for (var r2 = 0; r2 < 5; r2++) {
              out2.push(faces.map(function (f) { return f[r2]; }).join("  "));
            }
            out2.push("");
            return out2;
          }, 70, function () {
            write("  " + rolls.join("  +  ") + (n > 1 ? "   =  " + total : ""), "ok");
          });
          return;
        }
        write("  " + rolls.join("  +  ") + (n > 1 ? "   =  " + total : ""), "ok");
      });

      cmd("crack", "fun", "crack", "put a star fracture through the screen",
        function () {
          DS.glass.crack(
            Math.random() * window.innerWidth,
            Math.random() * window.innerHeight,
            { big: Math.random() < .4 });
          write("  ouch.", "dim");
        });

      var COIN = [
        ["   .-\"\"\"-.  ", "  :  ( )  : ", "   `-...-'  "],
        ["    .---.   ", "   ( (o) )  ", "    `---'   "],
        ["     .-.    ", "    ( | )   ", "     `-'    "],
        ["      |     ", "      |     ", "      |     "],
        ["     .-.    ", "    ( | )   ", "     `-'    "],
        ["    .---.   ", "   (  X  )  ", "    `---'   "]
      ];

      cmd("flip", "fun", "flip", "flip a coin, properly", function () {
        var land = Math.random() < 0.5 ? "HEADS" : "TAILS";
        var spins = 16 + Math.floor(Math.random() * 6);
        animate(4, function (n) {
          if (n > spins) return null;
          var f = COIN[n % COIN.length];
          // it slows as it falls
          var lift = Math.max(0, 3 - Math.floor(n / 6));
          return [rep2(" ", lift * 2) + f[0], rep2(" ", lift * 2) + f[1],
                  rep2(" ", lift * 2) + f[2], ""];
        }, 55, function () {
          write("");
          CMDS.banner.fn([land]);
          write("");
        });
      });

      function rep2(c, n) { return n > 0 ? new Array(n + 1).join(c) : ""; }

      var PIPS = {
        1: ["     ", "  o  ", "     "],
        2: ["o    ", "     ", "    o"],
        3: ["o    ", "  o  ", "    o"],
        4: ["o   o", "     ", "o   o"],
        5: ["o   o", "  o  ", "o   o"],
        6: ["o   o", "o   o", "o   o"]
      };
      function dieFace(v) {
        var p = PIPS[Math.min(6, Math.max(1, v))];
        return ["+-------+",
                "| " + p[0] + " |",
                "| " + p[1] + " |",
                "| " + p[2] + " |",
                "+-------+"];
      }

      cmd("banner", "fun", "banner <text>", "big block letters", function (a) {
        var text = (a.join(" ") || "GLASS").toUpperCase().slice(0, 12);
        var rows = ["", "", "", "", ""];
        for (var i = 0; i < text.length; i++) {
          var glyph = FONT[text.charAt(i)] || FONT["?"];
          var parts = glyph.split("/");
          for (var r = 0; r < 5; r++) rows[r] += parts[r] + " ";
        }
        rows.forEach(function (r) { write(r, "ok"); });
      });

      cmd("cowsay", "fun", "cowsay <text>", "ask the cow", function (a) {
        var text = a.join(" ") || "everything is glass";
        var top = " " + rep("_", text.length + 2);
        write(top);
        write("< " + text + " >");
        write(" " + rep("-", text.length + 2));
        write("        \\   ^__^");
        write("         \\  (oo)\\_______");
        write("            (__)\\       )\\/\\");
        write("                ||----w |");
        write("                ||     ||");
      });

      cmd("matrix", "fun", "matrix", "briefly forget which OS you are on", function () {
        var chars = "アイウエオカキクケコ01ABCDEFGLASS░▒▓";
        var W = 46, H = 9, frames = 0;
        var lines = [];
        for (var i = 0; i < H; i++) lines.push(h("pre.tm-line.dir", { text: "" }));
        lines.forEach(function (l) { out.appendChild(l); });
        var iv = setInterval(function () {
          for (var r = 0; r < H; r++) {
            var s = "";
            for (var c = 0; c < W; c++) {
              s += Math.random() < 0.22
                ? chars.charAt(Math.floor(Math.random() * chars.length))
                : " ";
            }
            lines[r].textContent = s;
          }
          pane.scrollTop = pane.scrollHeight;
          frames += 1;
          if (frames > 34) {
            clearInterval(iv);
            lines.forEach(function (l, i2) {
              l.textContent = i2 === Math.floor(H / 2)
                ? "            wake up — the glass is still here"
                : "";
            });
          }
        }, 55);
        timers.push(iv);
      });

      cmd("party", "fun", "party", "make the compositor regret this", function () {
        var themes = ["aurora", "sunset", "abyss", "verdant", "lumen"];
        var before = {
          theme: DS.store.get("theme"),
          disperse: DS.store.get("glass.disperse"),
          sheen: DS.store.get("glass.sheen"),
          thick: DS.store.get("glass.thick")
        };
        write("  it is a party. 5 seconds.", "ok");
        DS.store.set("glass.disperse", 155);
        DS.store.set("glass.sheen", 140);
        DS.store.set("glass.thick", 3);
        DS.glass.apply();
        var n = 0;
        var iv = setInterval(function () {
          DS.store.set("theme", themes[n % themes.length]);
          DS.store.set("accentHue", (n * 47) % 360);
          DS.glass.applyTheme();
          n += 1;
        }, 260);
        timers.push(iv);
        var to = setTimeout(function () {
          clearInterval(iv);
          DS.store.set("theme", before.theme);
          DS.store.set("accentHue", null);
          DS.store.set("glass.disperse", before.disperse);
          DS.store.set("glass.sheen", before.sheen);
          DS.store.set("glass.thick", before.thick);
          DS.glass.applyTheme();
          DS.glass.apply();
          syncSettings();
          write("  ...and back to normal.", "dim");
        }, 5000);
        timers.push(to);
      });

      cmd("sudo", "fun", "sudo <command>", "elevate (optimistically)", function (a) {
        if (!a.length) return write("sudo: usage: sudo <command>", "err");
        write("  " + DS.store.get("user", "you") + " is not in the sudoers file.", "err");
        write("  This incident has been refracted.", "dim");
      });

      cmd("echo", "fun", "echo <text>", "print text", function (a) { write(a.join(" ")); });

      /* ── custom commands ─────────────────────────────────────
         The point of the whole section: the user extends the shell
         at runtime and it persists. */
      /* ── the guided builder ──────────────────────────────────────
         `define name body` works if you already know the shape. Typing
         `define` on its own walks you through it instead, because
         "here is the syntax" is not the same as knowing how to start. */
      function buildCommand() {
        write("");
        box([
          "Let us make you a command.",
          "",
          "A command is a NAME you type, and a BODY it runs.",
          "The body is just shell lines - the same ones you type here."
        ], "ok");

        ask("What should it be called?", function (name) {
          name = (name || "").trim().toLowerCase().split(/\s+/)[0];
          if (!name) return write("  Cancelled.", "dim");
          if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
            write("  Names start with a letter, then letters, digits, - or _.", "err");
            return buildCommand();
          }
          if (CMDS[name]) {
            write("  `" + name + "` is already a built-in. Pick another.", "err");
            return buildCommand();
          }

          write("");
          write("  Good. Now what should `" + name + "` DO?", "ok");
          write("");
          write("  Anything you can type here. Some starting points:", "dim");
          write("");
          write("    echo Hello $1!                 say something back");
          write("    theme sunset; preset crystal   two commands, in order");
          write("    open notes                     launch an app");
          write("    do sys:lock                    run any system action");
          write("    cd ~/Documents; ls             go somewhere and look");
          write("");
          write("  $1 $2 $3  become the words typed after your command", "dim");
          write("  $*        becomes all of them at once", "dim");
          write("  $USER $THEME $TIME  fill themselves in", "dim");
          write("  ;         separates one step from the next", "dim");

          ask("So, " + name + " should run...", function (bodyText) {
            bodyText = (bodyText || "").trim();
            if (!bodyText) return write("  Cancelled.", "dim");

            var all = DS.store.get("customCmds", {});
            all[name] = bodyText;
            DS.store.set("customCmds", all);

            write("");
            box([
              "Done. `" + name + "` is yours.",
              "",
              name + "  ->  " + bodyText,
              "",
              "It is saved, so it survives a reload.",
              "`commands` lists yours, `undefine " + name + "` removes it."
            ], "ok");
            write("");
            write("  Try it now - type: " + name, "dir");
          }, "the whole line, exactly as you would type it");
        }, "one word, e.g. hi, work, shiny");
      }

      cmd("define", "custom", "define <name> <body>", "invent your own command", function (a) {
        if (!a.length) { buildCommand(); return; }
        var name = a[0].toLowerCase();
        if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
          return write("define: names must start with a letter (a-z, 0-9, - and _)", "err");
        }
        if (CMDS[name]) {
          return write("define: `" + name + "` is a built-in. Pick another name.", "err");
        }
        if (a.length < 2) {
          return write("define: give it something to do, e.g. define " + name + " echo hi", "err");
        }
        var bodyText = a.slice(1).join(" ");
        var all = DS.store.get("customCmds", {});
        var isNew = !all[name];
        all[name] = bodyText;
        DS.store.set("customCmds", all);
        write("  " + (isNew ? "created" : "updated") + " `" + name + "`", "ok");
        write("  " + name + "  →  " + bodyText, "dim");
        write("  try it: " + name, "dim");
      });

      CMDS.alias = CMDS.define;

      cmd("commands", "custom", "commands", "list the commands you invented", function () {
        var all = DS.store.get("customCmds", {});
        var names = Object.keys(all).sort();
        if (!names.length) {
          write("  You have not defined any yet.", "dim");
          write("  Try:  define hi echo Hello $1!", "dim");
          return;
        }
        write("your commands (" + names.length + ")", "ok");
        names.forEach(function (n) { write("  " + pad(n, 14) + all[n]); });
      });

      cmd("undefine", "custom", "undefine <name>", "delete one of yours", function (a) {
        var all = DS.store.get("customCmds", {});
        if (!a[0] || !all[a[0]]) return write("undefine: no such command of yours", "err");
        delete all[a[0]];
        DS.store.set("customCmds", all);
        write("  removed `" + a[0] + "`", "ok");
      });

      /* ── help / tutorial ── */
      var GROUPS = [
        ["files", "Files"], ["system", "System"], ["glass", "Glass & looks"],
        ["fun", "Fun"], ["custom", "Your own commands"]
      ];

      cmd("help", "system", "help [command]", "this list", function (a) {
        if (a[0] && CMDS[a[0]]) {
          var c = CMDS[a[0]];
          write("  " + c.usage, "ok");
          write("  " + c.desc);
          return;
        }
        if (a[0]) return write("help: no such command: " + a[0], "err");

        GROUPS.forEach(function (grp) {
          var names = Object.keys(CMDS).filter(function (n) {
            return CMDS[n].group === grp[0];
          }).sort();
          if (!names.length) return;
          write("");
          write(grp[1], "ok");
          names.forEach(function (n) {
            write("  " + pad(CMDS[n].usage, 22) + CMDS[n].desc);
          });
        });
        var mine = Object.keys(DS.store.get("customCmds", {})).sort();
        if (mine.length) {
          write("");
          write("Yours", "ok");
          mine.forEach(function (n) {
            write("  " + pad(n, 22) + DS.store.get("customCmds")[n]);
          });
        }
        write("");
        write("`tutorial` walks you through it. `fun` lists the toys.", "dim");
      });

      cmd("fun", "fun", "fun", "the toys, in one list", function () {
        box([
          "banner HELLO      big block letters",
          "cowsay <text>     the cow has opinions",
          "fortune           a thought about glass",
          "joke              a bad one",
          "roll 2d20         dice",
          "flip              a coin",
          "matrix            briefly forget which OS you are on",
          "party             5 seconds of chaos, then tidy again",
          "sudo <anything>   optimistic",
          "theme random      surprise yourself",
          "glass blur random one property, randomised"
        ], "ok");
      });

      var TUTORIAL = [
        {
          t: "Welcome to dsh.",
          l: ["This is a real shell over a real (if virtual) file system.",
              "Everything you do here shows up in Finder and Notes too.",
              "",
              "Try:  ls",
              "Then type `next` to continue."]
        },
        {
          t: "Moving around.",
          l: ["`ls` lists, `cd` moves, `cat` prints a file.",
              "`~` means your home folder, `..` means up one.",
              "",
              "Try:  cd Documents",
              "      cat Welcome.txt",
              "      cd ~"]
        },
        {
          t: "The shell drives the compositor.",
          l: ["Every optical property of the glass is a live setting,",
              "and this shell can set them.",
              "",
              "Try:  glass",
              "      glass blur 45",
              "      glass disperse 0     ← watch it become plastic",
              "      preset crystal       ← and back to glass"]
        },
        {
          t: "Make it yours.",
          l: ["Themes change the wallpaper, which is what the glass",
              "actually refracts. The accent recolours everything else.",
              "",
              "Try:  theme sunset",
              "      accent 300",
              "      accent off"]
        },
        {
          t: "Now the fun part.",
          l: ["Try:  banner HI",
              "      cowsay glass is honest",
              "      roll 2d20",
              "      party                ← hold on to something"]
        },
        {
          t: "Invent your own commands.",
          l: ["`define` adds a command to this shell permanently —",
              "it is saved and will still be here after a reload.",
              "",
              "Try:  define hi echo Hello $1, you look great",
              "      hi " + DS.store.get("user", "you"),
              "",
              "Chain things with `;` :",
              "      define focus theme abyss; preset minimal; open notes",
              "",
              "`commands` lists yours, `undefine <name>` removes one."]
        },
        {
          t: "That is the whole shell.",
          l: ["`help` has the full command list, `fun` has the toys.",
              "",
              "Go and break something. It all lives in localStorage,",
              "and Settings › Storage can wipe it clean."]
        }
      ];

      function showTut() {
        var s = TUTORIAL[tut];
        write("");
        write("── " + (tut + 1) + "/" + TUTORIAL.length + " · " + s.t + " " +
              rep("─", Math.max(0, 40 - s.t.length)), "ok");
        s.l.forEach(function (l) { write(l); });
        write("");
        write(tut < TUTORIAL.length - 1
          ? "type `next` to continue, or `tutorial end` to stop"
          : "tutorial complete — type `help` any time", "dim");
        if (tut >= TUTORIAL.length - 1) tut = -1;
      }

      cmd("tutorial", "system", "tutorial", "a six-step tour of the shell", function (a) {
        if (a[0] === "end" || a[0] === "stop") {
          tut = -1;
          return write("tutorial stopped.", "dim");
        }
        tut = 0;
        showTut();
      });

      cmd("next", "system", "next", "next tutorial step", function () {
        if (tut < 0) return write("next: no tutorial running. type `tutorial` to start one.", "err");
        tut += 1;
        showTut();
      });

      /* ───────────── dispatch ───────────── */
      function tokenise(line) {
        var parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        return parts.map(function (p) { return p.replace(/^"|"$/g, ""); });
      }

      function expand(bodyText, args) {
        return bodyText
          .replace(/\$\*/g, args.join(" "))
          .replace(/\$([1-9])/g, function (_, n) { return args[n - 1] || ""; })
          .replace(/\$USER/g, DS.store.get("user", "you"))
          .replace(/\$THEME/g, DS.store.get("theme"))
          .replace(/\$TIME/g, new Date().toLocaleTimeString());
      }

      function exec(line, depth) {
        line = String(line).trim();
        if (!line) return;
        if (depth > 8) {
          write("dsh: too much recursion — a custom command is calling itself", "err");
          return;
        }
        var parts = tokenise(line);
        var name = parts.shift();

        if (CMDS[name]) {
          try { CMDS[name].fn(parts); }
          catch (err) { write(name + ": " + err.message, "err"); }
          return;
        }

        var custom = DS.store.get("customCmds", {})[name];
        if (custom !== undefined) {
          expand(custom, parts).split(";").forEach(function (piece) {
            exec(piece, depth + 1);
          });
          return;
        }

        // a gentle nudge rather than a bare error
        var guess = Object.keys(CMDS).filter(function (c) {
          return c.indexOf(name.charAt(0)) === 0 && Math.abs(c.length - name.length) < 3;
        })[0];
        write("dsh: command not found: " + name +
              (guess ? "  (did you mean `" + guess + "`?)" : "  (try `help`)"), "err");
      }

      function run(raw) {
        if (asking) {
          var handler = asking;
          writeEcho(raw);
          stopAsking();
          handler(raw.trim());
          pane.scrollTop = pane.scrollHeight;
          return;
        }
        writeEcho(raw);
        var line = raw.trim();
        if (!line) return;
        history.push(line);
        hIdx = history.length;
        exec(line, 0);
        pane.scrollTop = pane.scrollHeight;
      }

      /* ───────────── tab completion ───────────── */
      function complete() {
        var val = input.value;
        var parts = val.split(" ");
        var frag = parts[parts.length - 1];

        if (parts.length === 1) {
          var pool = Object.keys(CMDS).concat(Object.keys(DS.store.get("customCmds", {})));
          var hits = pool.filter(function (c) { return c.indexOf(frag) === 0; });
          if (hits.length === 1) input.value = hits[0] + " ";
          else if (hits.length > 1) write(hits.sort().join("   "), "dim");
          return;
        }
        var slash = frag.lastIndexOf("/");
        var dirPart = slash >= 0 ? frag.slice(0, slash + 1) : "";
        var namePart = slash >= 0 ? frag.slice(slash + 1) : frag;
        var matches = fs.list(resolve(dirPart || ".")).filter(function (i) {
          return i.name.indexOf(namePart) === 0;
        });
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
        } else if ((e.key === "l" || e.key === "L") && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          DS.clear(out);
        }
      });

      pane.addEventListener("pointerup", function () {
        if (window.getSelection().toString()) return;
        input.focus();
      });

      api.onClose = function () {
        timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
      };

      /* ───────────── the banner ───────────── */
      drawPrompt();
      var mine = Object.keys(DS.store.get("customCmds", {})).length;
      LOGO.forEach(function (l, i) {
        var side = ["", "  dsh 1.1  ·  Dancestar OS", "", "", "", ""][i];
        write(l + side, i === 1 ? "ok" : "dir");
      });
      write("");
      box([
        "New here?   tutorial      a six-step tour",
        "Lost?       help          every command, grouped",
        "Bored?      fun           banner, cowsay, matrix, party",
        "Curious?    neofetch      what this thing is",
        "",
        "Make your own:  define hi echo Hello $1!",
        "                then just type:  hi " + DS.store.get("user", "you")
      ]);
      if (mine) {
        write("");
        write("You have " + mine + " command" + (mine === 1 ? "" : "s") +
              " of your own — type `commands` to see them.", "ok");
      }
      write("");
      setTimeout(function () { input.focus(); }, 80);
    }
  });
})(window.DS);
