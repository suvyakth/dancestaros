/* ═══════════════════════════════════════════════════════════════
   tour.js — guided tutorial, and the demos

   Two related things live here.

   DS.demo   performs an action instead of describing it. "Drag
             Dispersion to 0" is a sentence; DS.demo.dispersion()
             opens the pane, animates the slider down, holds so you
             can see the glass go flat, then puts it back. A tip that
             can run itself is worth ten that cannot.

   DS.tour   the tutorial: a spotlight cut out of a dimming layer,
             a card beside it, and steps that can open the thing they
             are about to talk about. Steps target live elements, so
             the tour points at the real dock, not a picture of one.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  /* ───────────────────── DEMOS ───────────────────── */
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /** Animate a stored number and apply it as it moves. */
  function glide(path, from, to, ms, apply, done) {
    var t0 = performance.now();
    (function step(now) {
      var k = DS.clamp((now - t0) / ms, 0, 1);
      DS.store.set(path, Math.round((from + (to - from) * ease(k)) * 10) / 10);
      apply();
      if (k < 1) requestAnimationFrame(step);
      else if (done) done();
    })(t0);
  }

  var demo = {
    /** The headline claim of the whole project, performed. */
    dispersion: function () {
      DS.wm.open("settings", { pane: "glass" });
      var was = DS.store.get("glass.disperse", 60);
      var wasThick = DS.store.get("glass.thick", 1.3);

      setTimeout(function () {
        DS.ui.toast({
          icon: "layers", title: "Watch the edges",
          body: "Taking dispersion to zero. Nothing else changes.",
          timeout: 3000
        });
        glide("glass.disperse", was, 0, 1400, apply, function () {
          glide("glass.thick", wasThick, 0, 600, apply, function () {
            DS.ui.toast({
              icon: "info", title: "That is frosted plastic",
              body: "Same blur, same tint. The depth was all in the edges.",
              timeout: 4200
            });
            setTimeout(function () {
              glide("glass.thick", 0, wasThick, 600, apply);
              glide("glass.disperse", 0, was, 1400, apply, function () {
                DS.ui.toast({ icon: "check", title: "And back to glass", timeout: 3000 });
              });
            }, 2600);
          });
        });
      }, 700);

      function apply() {
        DS.glass.apply();
        var sync = DS.qs("#settings-sync");
        if (sync) sync.click();
      }
    },

    /** Sweep the light across the desktop so the rims disagree. */
    light: function () {
      DS.wm.open("settings", { pane: "glass" });
      var wasX = DS.store.get("light.x", 26);
      setTimeout(function () {
        DS.ui.toast({
          icon: "sun", title: "One light, every pane",
          body: "Watch which edge of each window is bright.",
          timeout: 4000
        });
        glide("light.x", wasX, 92, 1800, DS.glass.applyLight, function () {
          glide("light.x", 92, 6, 2600, DS.glass.applyLight, function () {
            glide("light.x", 6, wasX, 1400, DS.glass.applyLight);
          });
        });
      }, 700);
    },

    finish: function () {
      DS.wm.open("settings", { pane: "glass" });
      var was = DS.store.get("finish", "smooth");
      var order = ["reeded", "fluted", "cathedral", "bubbled", was];
      var i = 0;
      setTimeout(function () {
        (function next() {
          if (i >= order.length) return;
          DS.store.set("finish", order[i]);
          DS.glass.applyFinish();
          DS.ui.toast({
            icon: "layers",
            title: DS.glass.FINISHES[order[i]].label,
            body: DS.glass.FINISHES[order[i]].desc,
            timeout: 1600
          });
          i += 1;
          setTimeout(next, 1800);
        })();
      }, 700);
    },

    /** Ramp the whole desktop up and back, so "zoom" stops being a word. */
    zoom: function () {
      if (!DS.zoom.supported) {
        DS.ui.toast({
          icon: "info", title: "No CSS zoom here",
          body: "This browser cannot scale the desktop. Everything else works."
        });
        return;
      }
      var was = DS.zoom.pct();
      DS.ui.toast({
        icon: "zoomIn", title: "Scaling the whole shell",
        body: "Menu bar, dock, windows and menus together — not the " +
              "wallpaper, which has no detail to resolve.",
        timeout: 3400
      });
      glide("zoom.ui", was, 145, 1500, DS.zoom.apply, function () {
        setTimeout(function () {
          glide("zoom.ui", 145, was, 1200, DS.zoom.apply, function () {
            DS.ui.toast({
              icon: "check", title: "And back to " + was + "%",
              body: "Ctrl+Alt with plus, minus or zero does this by hand.",
              timeout: 3000
            });
          });
        }, 1400);
      });
    },

    snap: function () {
      var win = DS.wm.focused() || DS.wm.open("finder");
      DS.ui.toast({
        icon: "maximize", title: "Edge snapping",
        body: "Drag a title bar to the top to maximise, or a side for half.",
        timeout: 6000
      });
      if (!win) return;
      setTimeout(function () { DS.wm.toggleMax(win); }, 900);
      setTimeout(function () { DS.wm.toggleMax(win); }, 2600);
    },

    shatter: function () {
      var win = DS.wm.open("calc");
      setTimeout(function () {
        DS.ui.toast({
          icon: "layers", title: "Closing a pane of glass breaks it",
          timeout: 3000
        });
        setTimeout(function () { DS.wm.close(win); }, 700);
      }, 600);
    }
  };

  DS.demo = demo;

  /* ───────────────────── THE TOUR ─────────────────────
     Each step names a live element to spotlight. Nothing is a mock-up;
     if the dock moves, the tour points at where it moved to. */
  var STEPS = [
    {
      title: "This is all one piece of glass",
      body: "Nothing here is opaque — not the windows, the dock, the menus, " +
            "the scrollbars, or this card. Everything behind a surface shows " +
            "through it, bends at its edges, and splits into colour.",
      target: null
    },
    {
      title: "The menu bar",
      body: "The diamond on the left is the system menu. On the right: the " +
            "circle opens quick glass controls, the magnifier opens search, " +
            "and your bead opens your account.",
      target: "#menubar"
    },
    {
      title: "The dock",
      body: "Click an icon to open an app; a dot underneath means it is " +
            "running. Right-click the dock itself to move it, resize it, or " +
            "hide it — and to add apps that are not in it yet.",
      target: ".dock",
      before: function () { DS.ui.closeMenus(); }
    },
    {
      title: "Everything is searchable",
      body: "Ctrl+K anywhere. It searches apps, files, and every action the " +
            "system can perform. The Search app goes further and indexes the " +
            "contents of your files too.",
      target: "#mb-search",
      key: "Ctrl K"
    },
    {
      title: "Windows",
      body: "Drag a title bar to the top edge to maximise, or to a side for " +
            "half the screen. Double-click the bar does the same. Escape or " +
            "a click on empty desktop tucks it away.",
      target: ".win",
      before: function () { DS.wm.open("finder"); },
      demo: "snap"
    },
    {
      title: "The part worth seeing",
      body: "Every optical property is live. Dispersion is the one that " +
            "matters: it is the colour split at the edges, and it is the " +
            "difference between glass and frosted plastic.",
      target: ".st-preview",
      before: function () { DS.wm.open("settings", { pane: "glass" }); },
      demo: "dispersion",
      demoLabel: "Show me"
    },
    {
      title: "One light for the whole desktop",
      body: "Not one per window. Every rim points at the same source, so a " +
            "pane on the left is lit on its right edge and vice versa.",
      target: ".st-h",
      demo: "light",
      demoLabel: "Sweep it"
    },
    {
      title: "Widgets",
      body: "Panes that live on the desktop instead of in a window. Drag to " +
            "move, click to open the full app, right-click to remove. Add " +
            "them from the desktop menu or Settings.",
      target: ".widget",
      before: function () {
        if (!DS.widgets.has("clock")) DS.widgets.add("clock");
        DS.wm.list().forEach(function (w) { DS.wm.minimize(w); });
      }
    },
    {
      title: "The shell",
      body: "A real shell over the file system that can also drive the " +
            "compositor. Type `tutorial` for the written tour, `fun` for the " +
            "toys, or `define` to invent your own command — it walks you " +
            "through that one.",
      target: ".win",
      before: function () { DS.wm.open("terminal"); }
    },
    {
      title: "Make it bigger",
      body: "Ctrl+Alt with plus or minus scales the entire desktop — menu " +
            "bar, dock, windows, everything at once. Ctrl+Shift does the " +
            "same to only the window in front, and that one is remembered " +
            "per app.",
      target: ".menubar",
      before: function () { DS.ui.closeMenus(); },
      key: "Ctrl Alt +",
      demo: "zoom",
      demoLabel: "Show me"
    },
    {
      title: "And in your language",
      body: "The globe switches between seven, Arabic included. Coverage is " +
            "partial and honest about it: the Language pane lists every " +
            "phrase it could not translate, and you can type them in " +
            "yourself.",
      target: "#mb-lang"
    },
    {
      title: "The beetle",
      body: "It sits in the corner counting anything the system throws. " +
            "Click it and the report already knows your theme, your optics, " +
            "the window in front and the error itself. Right-click it to " +
            "move it, hide it — or break it.",
      target: "#bugdot",
      before: function () {
        DS.store.set("bugs.show", true);
        DS.bugs.paintDot();
        DS.wm.list().forEach(function (w) { DS.wm.minimize(w); });
      }
    },
    {
      title: "Right-click almost anything",
      body: "The desktop, the dock, a file, a photo, a widget, a note, a " +
            "saved look. The menus are glass too.",
      target: null,
      before: function () { DS.wm.list().forEach(function (w) { DS.wm.minimize(w); }); }
    },
    {
      title: "It is yours",
      body: "Settings has six themes including dark glass, a wallpaper " +
            "studio, saveable Looks, custom keyboard shortcuts, accounts and " +
            "a passcode. Everything you change is remembered.",
      target: null,
      before: function () { DS.wm.open("settings", { pane: "appearance" }); }
    },
    {
      title: "That is the tour",
      body: "Press Ctrl+K if you forget where something is, or run this again " +
            "any time from the Help menu.",
      target: null,
      last: true
    }
  ];

  var tour = {
    STEPS: STEPS,
    running: false,

    start: function (from) {
      if (tour.running) return;
      tour.running = true;
      var i = from || 0;

      var veil = h("div.tour-veil");
      var spot = h("div.tour-spot");
      var card = h("div.tour-card.g");
      veil.appendChild(spot);
      veil.appendChild(card);
      DS.qs("#desktop").appendChild(veil);

      function targetRect(step) {
        if (!step.target) return null;
        var el = DS.qs(step.target);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        // the spotlight lives inside the desktop, which may be zoomed
        return DS.zoom ? DS.zoom.rect(el) : r;
      }

      function place(step) {
        var r = targetRect(step);
        if (!r) {
          spot.classList.add("off");
          card.classList.add("mid");
          card.style.left = "";
          card.style.top = "";
          return;
        }
        spot.classList.remove("off");
        card.classList.remove("mid");
        var pad = 8;
        spot.style.left = (r.left - pad) + "px";
        spot.style.top = (r.top - pad) + "px";
        spot.style.width = (r.width + pad * 2) + "px";
        spot.style.height = (r.height + pad * 2) + "px";

        // put the card wherever there is room
        var cw = 340, ch = card.offsetHeight || 200;
        var vw = DS.zoom ? DS.zoom.vw() : window.innerWidth;
        var vh = DS.zoom ? DS.zoom.vh() : window.innerHeight;
        var below = r.bottom + 16;
        var top = below + ch < vh - 12 ? below : r.top - ch - 16;
        if (top < 12) top = Math.min(vh - ch - 12, r.bottom + 16);
        var left = DS.clamp(r.left + r.width / 2 - cw / 2, 14, vw - cw - 14);
        card.style.left = left + "px";
        card.style.top = Math.max(12, top) + "px";
      }

      function render() {
        var step = STEPS[i];
        if (step.before) { try { step.before(); } catch (e) {} }

        DS.clear(card);
        card.appendChild(h("div.tour-step", {
          text: "Step " + (i + 1) + " of " + STEPS.length
        }));
        card.appendChild(h("h3.tour-title", { text: step.title }));
        card.appendChild(h("p.tour-body", { text: step.body }));
        if (step.key) {
          card.appendChild(h("div.tour-key", { text: step.key }));
        }

        var row = h("div.tour-row");
        row.appendChild(h("div.tour-dots", {}, STEPS.map(function (_, n) {
          return h("i" + (n === i ? ".on" : n < i ? ".done" : ""));
        })));
        if (step.demo && DS.demo[step.demo]) {
          row.appendChild(h("button.g-btn", {
            html: DS.icon("play", 13) + "<span>" + (step.demoLabel || "Show me") + "</span>",
            onclick: function () { DS.demo[step.demo](); }
          }));
        }
        if (i > 0) {
          row.appendChild(h("button.g-btn", { text: "Back", onclick: function () { go(i - 1); } }));
        }
        row.appendChild(h("button.g-btn.g-btn-accent", {
          text: step.last ? "Done" : "Next",
          onclick: function () { step.last ? finish() : go(i + 1); }
        }));
        card.appendChild(row);

        card.appendChild(h("button.tour-skip", {
          text: "Skip the tour", onclick: finish
        }));

        DS.glass.dress(card);
        // let the layout settle before measuring for placement
        requestAnimationFrame(function () { place(step); });
      }

      function go(n) {
        i = DS.clamp(n, 0, STEPS.length - 1);
        render();
      }

      function finish() {
        tour.running = false;
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", reflow);
        veil.classList.add("out");
        setTimeout(function () {
          if (veil.parentNode) veil.parentNode.removeChild(veil);
        }, 320);
        DS.store.set("tourDone", true);
      }

      function reflow() { place(STEPS[i]); }

      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); }
        else if (e.key === "ArrowRight" || e.key === "Enter") {
          e.preventDefault(); e.stopPropagation();
          if (STEPS[i].last) finish(); else go(i + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault(); e.stopPropagation();
          go(i - 1);
        }
      }

      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", reflow);
      // keep the spotlight on target as windows settle
      var follow = setInterval(function () {
        if (!tour.running) { clearInterval(follow); return; }
        place(STEPS[i]);
      }, 500);

      render();
    }
  };

  DS.tour = tour;
})(window.DS);
