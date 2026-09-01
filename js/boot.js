/* ═══════════════════════════════════════════════════════════════
   boot.js — startup sequence

   boot spinner → landing (setup wizard or greeting screen) → desktop

   The desktop stays hidden until the landing screen is dismissed, so
   the wizard floats on nothing but wallpaper.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var STAGES = [
    "Initialising optics",
    "Loading glass profile",
    "Mounting file system",
    "Calibrating refraction"
  ];

  function enterDesktop(firstRun) {
    var desktop = DS.qs("#desktop");
    desktop.hidden = false;
    DS.shell.init();

    setTimeout(function () {
      if (firstRun) {
        DS.ui.toast({
          icon: "star",
          title: "Welcome, " + DS.store.get("user", "you"),
          body: "There is a short guided tour that points at each part of the " +
                "system in turn. It takes about a minute.",
          timeout: 0,
          action: { label: "Take the tour", run: function () { DS.tour.start(); } }
        });
      } else {
        /* One hint, and clicking it does the thing it describes. */
        var hints = DS.landing.HINTS;
        var hint = hints[Math.floor(Math.random() * hints.length)];
        DS.ui.toast({
          icon: "bell",
          title: DS.landing.greetWord() + ", " + DS.store.get("user", "you"),
          body: hint.title + " — " + hint.body,
          timeout: 12000,
          action: { label: hint.label, run: hint.run }
        });
      }
    }, 560);
  }

  function boot() {
    var status = DS.qs("#boot-status");
    var i = 0;

    var stepper = setInterval(function () {
      i += 1;
      if (i < STAGES.length) status.textContent = STAGES[i];
    }, 380);

    DS.store.load();
    DS.fs.init();

    // Bank anything already earned without firing a notification for
    // each — a save from before this existed would otherwise arrive
    // as a wall of toasts.
    DS.awards.settle();

    // Language first, so the greeting screen is already in it rather
    // than flashing English and correcting itself.
    DS.i18n.init();

    // Apply optics before anything is revealed, so the first frame the
    // user sees is already correct.
    DS.glass.applyTheme();
    DS.glass.apply();
    DS.glass.applyWallpaper();
    DS.glass.applyMotion();
    DS.glass.initSheen();
    DS.zoom.apply();

    // Classify the machine before anything is shown, so a phone never
    // gets one frame of floating desktop windows before it is corrected.
    DS.form.apply(true);

    var firstRun = !DS.store.get("setupDone", false);

    setTimeout(function () {
      clearInterval(stepper);
      status.textContent = firstRun ? "Welcome" : "Ready";

      var bootEl = DS.qs("#boot");
      bootEl.classList.add("done");
      setTimeout(function () {
        if (bootEl.parentNode) bootEl.parentNode.removeChild(bootEl);

        if (firstRun) {
          DS.landing.wizard(function () { enterDesktop(true); });
        } else {
          DS.landing.lock(function () { enterDesktop(false); });
        }
      }, 620);
    }, 1650);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.DS);
