/* ═══════════════════════════════════════════════════════════════
   setup.js — the landing experience

   First visit  → a five-step setup wizard.
   Every visit after → a personalised greeting screen.

   The wizard is itself made of glass, sitting on the live wallpaper,
   so every choice is previewed *through* the material being chosen.
   Pick a theme and the wallpaper changes behind the card; drag the
   accent hue and the card's own controls recolour under your finger.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var landing = {};

  var MARK =
    '<svg viewBox="0 0 64 64" width="52" height="52" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' +
    '<path d="M32 4 L57 32 L32 60 L7 32 Z"/>' +
    '<path d="M32 15 L46 32 L32 49 L18 32 Z" opacity=".6"/>' +
    '<path d="M32 26 L38 32 L32 38 L26 32 Z" fill="currentColor" opacity=".5"/></svg>';

  var THEMES = [
    { id: "aurora",  name: "Aurora",  hint: "Teal and violet",  sw: "linear-gradient(135deg,#22d3ee,#2563eb 45%,#a855f7)" },
    { id: "sunset",  name: "Sunset",  hint: "Amber and rose",   sw: "linear-gradient(135deg,#fbbf24,#f43f5e 50%,#a855f7)" },
    { id: "abyss",   name: "Abyss",   hint: "Deep and cold",    sw: "linear-gradient(135deg,#22d3ee,#0e7490 50%,#0f172a)" },
    { id: "verdant", name: "Verdant", hint: "Green and lime",   sw: "linear-gradient(135deg,#a3e635,#14b8a6 50%,#065f46)" },
    { id: "obsidian", name: "Obsidian", hint: "Dark glass",      sw: "linear-gradient(135deg,#4c1d95,#1e1b2e 50%,#000)" },
    { id: "lumen",   name: "Lumen",   hint: "Light mode",       sw: "linear-gradient(135deg,#eef4ff,#93c5fd 55%,#c084fc)" }
  ];

  var TIPS = [
    "Press Ctrl+K anywhere to search apps, files and actions.",
    "Drag a window to a screen edge to snap it.",
    "Settings › Glass tunes every optical property live.",
    "Type `define` in Terminal to invent your own commands.",
    "`party` in Terminal is worth trying at least once.",
    "Right-click almost anything — the menus are glass too.",
    "Alt+Tab cycles windows. Ctrl+W closes one.",
    "Drag Dispersion to 0 to watch glass turn into plastic."
  ];

  /* The welcome-back notification used to describe something and then
     do nothing when clicked. Each hint now carries the action it is
     describing, so the card is the way in rather than a note about one. */
  var HINTS = [
    {
      title: "Drag Dispersion to 0",
      body: "It is the colour split at every edge, and the whole difference " +
            "between glass and frosted plastic.",
      label: "Show me", run: function () { DS.demo.dispersion(); }
    },
    {
      title: "There is one light for the whole desktop",
      body: "Every rim points at the same source, so panes disagree with " +
            "each other the way real ones would.",
      label: "Sweep it", run: function () { DS.demo.light(); }
    },
    {
      title: "Glass does not have to be flat",
      body: "Reeded, fluted, cathedral, bubbled, frosted.",
      label: "Cycle the finishes", run: function () { DS.demo.finish(); }
    },
    {
      title: "Closing a pane of glass breaks it",
      body: "Shards are thrown from the window's own footprint.",
      label: "Break one", run: function () { DS.demo.shatter(); }
    },
    {
      title: "Everything is searchable",
      body: "Apps, files, file contents, events and every action the system " +
            "can perform.",
      label: "Open Search", run: function () { DS.wm.open("search"); }
    },
    {
      title: "Invent your own command",
      body: "The shell walks you through it, step by step.",
      label: "Open the shell", run: function () { DS.wm.open("terminal"); }
    },
    {
      title: "Bind any key to anything",
      body: "Every app, theme, finish and widget is a bindable action.",
      label: "Open Shortcuts",
      run: function () { DS.wm.open("settings", { pane: "shortcuts" }); }
    },
    {
      title: "Build your own wallpaper",
      body: "It is the only thing the glass has to refract, so it changes " +
            "how the whole system reads.",
      label: "Open the studio",
      run: function () { DS.wm.open("settings", { pane: "wallpaper" }); }
    },
    {
      title: "Windows snap to the edges",
      body: "Drag a title bar to the top or a side.",
      label: "Demonstrate", run: function () { DS.demo.snap(); }
    },
    {
      title: "The desktop can be any size",
      body: "Ctrl+Alt with plus or minus scales the whole shell; Ctrl+Shift " +
            "scales just the window in front.",
      label: "Open Zoom",
      run: function () { DS.wm.open("settings", { pane: "zoom" }); }
    },
    {
      title: "It speaks seven languages",
      body: "Including one that runs right to left — and you can fill in " +
            "any phrase the book has missed.",
      label: "Choose a language",
      run: function () { DS.wm.open("settings", { pane: "language" }); }
    },
    {
      title: "There is a beetle in the corner",
      body: "It counts anything the system throws, and knows the state of " +
            "the machine before you have to describe it.",
      label: "Meet it", run: function () { DS.bugs.open(); }
    },
    {
      title: "New here?",
      body: "The guided tour points at each part of the system in turn.",
      label: "Take the tour", run: function () { DS.tour.start(); }
    }
  ];

  function greetWord() {
    var hr = new Date().getHours();
    if (hr < 5)  return "Still up";
    if (hr < 12) return "Good morning";
    if (hr < 18) return "Good afternoon";
    if (hr < 22) return "Good evening";
    return "Good night";
  }

  function avatarEl(size) {
    var a = DS.store.get("avatar", { glyph: "✦", grad: 0 });
    return h("div.av.av-" + size, {
      text: a.glyph,
      style: { background: DS.avatarGrad(a.grad) }
    });
  }

  function dismiss(node, done) {
    node.classList.add("out");
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      done();
    }, 440);
  }

  /* ═══════════════════ SETUP WIZARD ═══════════════════ */
  landing.wizard = function (done) {
    var step = 0;
    var dir = 1;

    var root = h("div.land");
    var card = h("div.land-card.g");
    var body = h("div.land-body");
    var dots = h("div.land-dots");
    var backBtn = h("button.g-btn", {
      text: "Back",
      onclick: function () { go(step - 1); }
    });
    var nextBtn = h("button.g-btn.g-btn-accent", {
      text: "Continue",
      onclick: function () { go(step + 1); }
    });
    var skipBtn = h("button.land-skip", {
      text: "Skip setup",
      onclick: finish
    });

    card.appendChild(body);
    card.appendChild(h("div.land-foot", {}, [dots, skipBtn, backBtn, nextBtn]));
    root.appendChild(card);
    document.body.appendChild(root);
    DS.glass.dress(card);

    /* ── step 1 · hello ── */
    function stepHello() {
      body.appendChild(h("div.land-mark", { html: MARK }));
      body.appendChild(h("h1.land-title", {
        html: "Dancestar <b>OS</b>"
      }));
      body.appendChild(h("p.land-sub", {
        text: "A desktop where nothing is opaque. Every window, button and " +
              "menu is the same piece of glass, so the things behind them " +
              "bend, brighten and split into colour at the edges."
      }));
      body.appendChild(h("p.land-sub", {
        style: { "margin-top": "14px", color: "var(--text-3)" },
        text: "Four short steps and it will be yours. You can change all of " +
              "it later in Settings."
      }));

      /* Language belongs before anything else, because everything after
         this is read. Coverage is partial and the pane says so, but the
         chrome and these buttons follow immediately. */
      body.appendChild(h("div.land-langs", {}, DS.LANGS.map(function (l) {
        return h("button" + (l.id === DS.i18n.id() ? ".on" : ""), {
          text: l.native,
          title: l.name,
          onclick: function () { DS.i18n.set(l.id); go(step); }
        });
      })));

      nextBtn.textContent = "Begin";
    }

    /* ── step 2 · name + avatar ── */
    function stepIdentity() {
      body.appendChild(h("div.land-kicker", { text: "Step 1 of 4" }));
      body.appendChild(h("h1.land-title", { text: "Who is using this?" }));
      body.appendChild(h("p.land-sub", {
        text: "Your name shows up in the shell prompt, the greeting screen and About."
      }));

      var echo = h("div.land-echo");
      var field = h("input.land-name", {
        type: "text",
        placeholder: "Type your name…",
        value: DS.store.get("user") === "you" ? "" : DS.store.get("user"),
        maxlength: "24",
        oninput: function () {
          DS.store.set("user", field.value.trim() || "you");
          paintEcho();
        },
        onkeydown: function (e) { if (e.key === "Enter") go(step + 1); }
      });
      function paintEcho() {
        var n = DS.store.get("user", "you");
        DS.clear(echo);
        echo.appendChild(document.createTextNode(greetWord() + ", "));
        echo.appendChild(h("b", { text: n }));
        echo.appendChild(document.createTextNode("."));
      }
      body.appendChild(field);
      body.appendChild(echo);
      paintEcho();

      /* avatar */
      body.appendChild(h("div.land-kicker", {
        style: { "margin-top": "30px" }, text: "Your bead"
      }));
      var big = avatarEl("lg");
      var grid = h("div.land-avgrid");
      DS.AVATARS.grads.forEach(function (g, i) {
        var cur = DS.store.get("avatar.grad", 0);
        var bead = h("div.av" + (i === cur ? ".on" : ""), {
          style: { background: g },
          onclick: function () {
            DS.store.set("avatar.grad", i);
            DS.qsa(".av", grid).forEach(function (b) { b.classList.remove("on"); });
            bead.classList.add("on");
            big.style.background = g;
          }
        });
        grid.appendChild(bead);
      });
      body.appendChild(h("div.land-avrow", {}, [big, grid]));

      var glyphs = h("div.land-glyphs");
      DS.AVATARS.glyphs.forEach(function (gl) {
        var cur = DS.store.get("avatar.glyph", "✦");
        var b = h("button" + (gl === cur ? ".on" : ""), {
          text: gl,
          onclick: function () {
            DS.store.set("avatar.glyph", gl);
            DS.qsa("button", glyphs).forEach(function (x) { x.classList.remove("on"); });
            b.classList.add("on");
            big.textContent = gl;
          }
        });
        glyphs.appendChild(b);
      });
      body.appendChild(glyphs);

      setTimeout(function () { field.focus(); }, 420);
    }

    /* ── step 3 · theme + accent ── */
    function stepLook() {
      body.appendChild(h("div.land-kicker", { text: "Step 2 of 4" }));
      body.appendChild(h("h1.land-title", { text: "Pick your light" }));
      body.appendChild(h("p.land-sub", {
        text: "The wallpaper is what the glass refracts, so this changes far " +
              "more than the background. Watch it happen behind this card."
      }));

      var grid = h("div.land-grid");
      THEMES.forEach(function (t) {
        var tile = h("button.land-tile" + (DS.store.get("theme") === t.id ? ".on" : ""), {
          onclick: function () {
            DS.store.set("theme", t.id);
            DS.glass.applyTheme();
            DS.qsa(".land-tile", grid).forEach(function (x) { x.classList.remove("on"); });
            tile.classList.add("on");
          }
        }, [
          h("span.sw", { style: { background: t.sw } }),
          h("b", { text: t.name }),
          h("i", { text: t.hint })
        ]);
        grid.appendChild(tile);
      });
      body.appendChild(grid);

      /* accent */
      body.appendChild(h("div.land-kicker", {
        style: { "margin-top": "30px" }, text: "Accent colour"
      }));
      var custom = DS.store.get("accentHue", null) !== null;
      var hue = h("input.hue-range", {
        type: "range", min: 0, max: 359, step: 1,
        value: DS.store.get("accentHue", null) === null ? 200 : DS.store.get("accentHue"),
        oninput: function () {
          DS.store.set("accentHue", parseInt(hue.value, 10));
          DS.glass.applyAccent();
          sw.classList.add("on");
        }
      });
      var sw = h("div.g-switch" + (custom ? ".on" : ""), {
        onclick: function () {
          sw.classList.toggle("on");
          if (sw.classList.contains("on")) {
            DS.store.set("accentHue", parseInt(hue.value, 10));
          } else {
            DS.store.set("accentHue", null);
          }
          DS.glass.applyAccent();
        }
      }, [h("i")]);

      body.appendChild(h("div", {
        style: { display: "flex", "align-items": "center", gap: "14px", "margin-top": "6px" }
      }, [
        h("div", { style: { flex: "1" } }, [hue]),
        sw
      ]));
      body.appendChild(h("p.land-sub", {
        style: { "margin-top": "8px", "font-size": "11px", color: "var(--text-3)" },
        text: "Off means follow the theme's own accent."
      }));
    }

    /* ── step 4 · material ── */
    function stepMaterial() {
      body.appendChild(h("div.land-kicker", { text: "Step 3 of 4" }));
      body.appendChild(h("h1.land-title", { text: "Choose your glass" }));
      body.appendChild(h("p.land-sub", {
        text: "Each preset is a different point in the same eight-property " +
              "optical system. This card is made of whichever you pick, so " +
              "the difference is immediate."
      }));

      var grid = h("div.land-grid");
      var order = ["crystal", "liquid", "frosted", "minimal"];
      order.forEach(function (id) {
        var p = DS.glass.PRESETS[id];
        var tile = h("button.land-tile", {
          onclick: function () {
            DS.glass.usePreset(id);
            DS.qsa(".land-tile", grid).forEach(function (x) { x.classList.remove("on"); });
            tile.classList.add("on");
          }
        }, [
          h("b", { text: p.label }),
          h("i", { text: p.desc })
        ]);
        grid.appendChild(tile);
      });
      body.appendChild(grid);
      body.appendChild(h("p.land-sub", {
        style: { "margin-top": "18px", "font-size": "11.5px", color: "var(--text-3)" },
        text: "Every one of the eight properties stays adjustable in " +
              "Settings › Glass, and from the shell with `glass blur 40`."
      }));
    }

    /* ── step 5 · ready ── */
    function stepReady() {
      var name = DS.store.get("user", "you");
      body.appendChild(h("div.land-kicker", { text: "Step 4 of 4" }));
      body.appendChild(h("h1.land-title", {
        html: "Ready, <b>" + DS.esc(name) + "</b>."
      }));
      body.appendChild(h("p.land-sub", {
        text: "Here is what you built. All of it is changeable later."
      }));

      var theme = THEMES.filter(function (t) { return t.id === DS.store.get("theme"); })[0] || THEMES[0];
      var hue = DS.store.get("accentHue", null);
      var g = DS.store.get("glass");

      var sum = h("div.land-summary");
      sum.appendChild(h("div.land-srow", {}, [
        h("span", { text: "You" }), avatarEl("sm"), h("b", { text: name })
      ]));
      sum.appendChild(h("div.land-srow", {}, [
        h("span", { text: "Theme" }),
        h("div.sw", { style: { background: theme.sw } }),
        h("b", { text: theme.name })
      ]));
      sum.appendChild(h("div.land-srow", {}, [
        h("span", { text: "Accent" }),
        h("div.sw", {
          style: { background: hue === null ? theme.sw : "hsl(" + hue + " 100% 62%)" }
        }),
        h("b", { text: hue === null ? "Follows theme" : "Hue " + hue })
      ]));
      sum.appendChild(h("div.land-srow", {}, [
        h("span", { text: "Glass" }),
        h("b", { text: g.blur + "px blur · " + (g.alpha / 100).toFixed(3) +
                       " tint · " + (g.disperse / 100).toFixed(2) + " dispersion" })
      ]));
      body.appendChild(sum);

      body.appendChild(h("p.land-sub", {
        style: { "margin-top": "22px" },
        html: "One thing worth doing first: open <b>Terminal</b> and type " +
              "<b>tutorial</b>. It teaches the shell in six short steps, " +
              "ending with how to invent your own commands."
      }));
      nextBtn.textContent = "Enter Dancestar OS";
    }

    var STEPS = [stepHello, stepIdentity, stepLook, stepMaterial, stepReady];

    function paintDots() {
      DS.clear(dots);
      STEPS.forEach(function (_, i) {
        dots.appendChild(h("i" + (i === step ? ".on" : i < step ? ".done" : "")));
      });
    }

    function go(n) {
      if (n < 0) return;
      if (n >= STEPS.length) { finish(); return; }
      dir = n > step ? 1 : -1;
      step = n;

      DS.clear(body);
      body.className = "land-body " + (dir > 0 ? "anim" : "back");
      // restart the entrance animation
      void body.offsetWidth;

      nextBtn.textContent = "Continue";
      STEPS[step]();

      backBtn.style.display = step === 0 ? "none" : "";
      skipBtn.style.display = step === 0 || step === STEPS.length - 1 ? "" : "";
      if (step === STEPS.length - 1) skipBtn.style.display = "none";
      paintDots();
      body.scrollTop = 0;
    }

    function finish() {
      DS.store.set("setupDone", true);
      DS.users.ensureFirst();
      DS.users.syncActive();
      document.removeEventListener("keydown", onKey);
      dismiss(root, done);
    }

    function onKey(e) {
      if (e.key === "Enter" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        go(step + 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    }
    document.addEventListener("keydown", onKey);

    go(0);
  };

  /* ═══════════════════ GREETING / LOCK SCREEN ═══════════════════ */
  landing.lock = function (done) {
    var root = h("div.lock");
    var timeEl = h("div.lock-time");
    var dateEl = h("div.lock-date");
    var tipEl = h("div.lock-tip");

    function paint() {
      var d = new Date();
      timeEl.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      dateEl.textContent = d.toLocaleDateString([], {
        weekday: "long", day: "numeric", month: "long"
      });
    }
    paint();
    var clock = setInterval(paint, 15000);

    var name = DS.store.get("user", "you");

    /* More than one account? Offer the switch here, before anything
       else. Their passcode is inside their own snapshot, so switching
       reloads and their lock screen does the asking. */
    var others = DS.users.list().filter(function (u) {
      return u.id !== DS.users.activeId();
    });

    /* Still called "you"? Ask, rather than greeting a placeholder. */
    var unnamed = name === "you" || !name;
    if (unnamed) {
      var nameField = h("input.lock-name", {
        type: "text", placeholder: "What should I call you?",
        maxlength: "24",
        onkeydown: function (e) {
          if (e.key !== "Enter") return;
          var v = nameField.value.trim();
          if (!v) return;
          DS.store.set("user", v);
          DS.users.syncActive();
          nameField.blur();
          DS.qs(".lock-hi").firstChild.textContent = greetWord() + ", " + v;
          nameField.remove();
        }
      });
      setTimeout(function () { nameField.focus(); }, 900);
    }

    var user = h("div.lock-user.g", {}, [
      avatarEl("md"),
      h("div.lock-hi", {}, [
        document.createTextNode(greetWord() + ", " + name),
        h("i", { text: DS.apps.all().length + " apps · nothing here is opaque" })
      ])
    ]);

    var needsPin = DS.lock.requiredOnLock();

    root.appendChild(timeEl);
    root.appendChild(dateEl);
    root.appendChild(user);
    if (unnamed) root.appendChild(nameField);

    if (others.length) {
      var row = h("div.lock-others");
      others.forEach(function (u) {
        row.appendChild(h("button.lock-other", {
          title: "Sign in as " + u.name,
          onclick: function (e) {
            e.stopPropagation();
            DS.users.switchTo(u.id);
          }
        }, [
          h("div.av.av-md", {
            text: u.glyph || "✦",
            style: { background: DS.avatarGrad(u.grad || 0) }
          }),
          h("span", { text: u.name })
        ]));
      });
      root.appendChild(h("div.lock-switch", {}, [
        h("div.lock-swlabel", { text: "Or sign in as" }), row
      ]));
    }

    var pad = null;
    if (needsPin) {
      pad = DS.lock.pad({
        hint: "Enter your passcode",
        onSubmit: function (pin) {
          // Go through the shared failure path, which is what counts the
          // attempts and arms the cooling-off period. This screen used to
          // shake and print its own message instead, so the limit existed
          // in lock.js and never actually fired here.
          if (DS.lock.attempts.isBlocked()) {
            pad.lockOut(DS.lock.attempts.blockedFor());
            return;
          }
          DS.lock.verify(pin).then(function (ok) {
            if (ok) { unlock(); return; }
            DS.lock.onFail(pad);
          });
        }
      });
      root.appendChild(pad.el);
      root.appendChild(h("div.lock-hint", {
        html: "Type the digits, or use the keypad"
      }));
      // a cooling-off period that was still running when the page
      // reloaded picks up where it left off
      if (DS.lock.attempts.isBlocked()) {
        pad.lockOut(DS.lock.attempts.blockedFor());
      }
    } else {
      root.appendChild(h("button.g-btn.g-btn-accent.lock-enter", {
        html: DS.icon("power", 15) + "<span>Enter</span>"
      }));
      root.appendChild(h("div.lock-hint", {
        html: "Click anywhere, or press <b>Enter</b>"
      }));
    }
    root.appendChild(tipEl);

    /* rotate a tip every few seconds */
    var ti = Math.floor(Date.now() / 1000) % TIPS.length;
    tipEl.textContent = TIPS[ti];
    var tips = setInterval(function () {
      tipEl.style.opacity = "0";
      setTimeout(function () {
        ti = (ti + 1) % TIPS.length;
        tipEl.textContent = TIPS[ti];
        tipEl.style.opacity = ".8";
      }, 400);
    }, 4600);

    document.body.appendChild(root);
    DS.glass.dress(root);

    var gone = false;
    function unlock() {
      if (gone) return;
      gone = true;
      clearInterval(clock);
      clearInterval(tips);
      if (pad) pad.unbindKeys();
      else document.removeEventListener("keydown", onKey);
      dismiss(root, done);
    }
    function onKey(e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        unlock();
      }
    }

    if (pad) {
      // no click-anywhere escape hatch when a passcode is set
      pad.bindKeys();
    } else {
      root.addEventListener("click", unlock);
      document.addEventListener("keydown", onKey);
    }
  };

  landing.TIPS = TIPS;
  landing.HINTS = HINTS;
  landing.greetWord = greetWord;
  landing.avatarEl = avatarEl;
  DS.landing = landing;
})(window.DS);
