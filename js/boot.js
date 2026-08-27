/* ═══════════════════════════════════════════════════════════════
   boot.js — startup sequence
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var STAGES = [
    "Initialising optics",
    "Loading glass profile",
    "Mounting file system",
    "Calibrating refraction",
    "Starting shell"
  ];

  function boot() {
    var status = DS.qs("#boot-status");
    var i = 0;

    var stepper = setInterval(function () {
      i += 1;
      if (i < STAGES.length) status.textContent = STAGES[i];
    }, 420);

    DS.store.load();
    DS.fs.init();

    // Apply optics before the desktop is revealed, so the first frame
    // the user sees is already correct.
    DS.glass.applyTheme();
    DS.glass.apply();

    setTimeout(function () {
      clearInterval(stepper);
      status.textContent = "Ready";

      var desktop = DS.qs("#desktop");
      desktop.hidden = false;
      DS.shell.init();

      var bootEl = DS.qs("#boot");
      bootEl.classList.add("done");
      setTimeout(function () {
        if (bootEl.parentNode) bootEl.parentNode.removeChild(bootEl);
      }, 900);

      // First run gets a short orientation; returning users do not.
      var seen = DS.store.get("seenWelcome", false);
      setTimeout(function () {
        if (!seen) {
          DS.store.set("seenWelcome", true);
          DS.wm.open("about");
          DS.ui.toast({
            icon: "layers",
            title: "Everything here is glass",
            body: "Open Settings › Glass to tune the optics live, or press Ctrl+K.",
            timeout: 9000
          });
        } else {
          DS.ui.toast({
            icon: "power",
            title: "Welcome back, " + DS.store.get("user", "you"),
            body: DS.apps.all().length + " apps ready. Ctrl+K to search."
          });
        }
      }, 700);
    }, 2200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.DS);
