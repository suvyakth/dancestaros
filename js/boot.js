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
        DS.wm.open("terminal");
        DS.ui.toast({
          icon: "layers",
          title: "Welcome, " + DS.store.get("user", "you"),
          body: "Terminal is open — type `tutorial` for a six-step tour, " +
                "or `fun` to see what else is in there.",
          timeout: 10000
        });
      } else {
        var tips = DS.landing.TIPS;
        DS.ui.toast({
          icon: "bell",
          title: DS.landing.greetWord() + ", " + DS.store.get("user", "you"),
          body: tips[Math.floor(Math.random() * tips.length)]
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

    // Apply optics before anything is revealed, so the first frame the
    // user sees is already correct.
    DS.glass.applyTheme();
    DS.glass.apply();
    DS.glass.initSheen();

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
