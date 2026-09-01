/* ═══════════════════════════════════════════════════════════════
   form.js — what shape of machine is this running on

   A desktop metaphor on a 390px phone is not a smaller desktop, it
   is a different machine. Floating windows you drag by a 38px title
   bar, a dock that magnifies under a cursor, tooltips on hover and
   right-click as the way into half the features — none of that
   survives being touched with a thumb.

   So this file does two things:

     1. classifies the viewport, writes it onto <html> as data-form,
        data-orient, data-touch and data-short, and re-lays the world
        out whenever it changes. CSS keys off those attributes;
        behaviour that CSS cannot express (windows that fill the frame
        instead of floating, drag handlers that stand down) asks the
        predicates below.

     2. gives touch a way to reach a context menu. Rather than
        duplicating a single menu, a long press synthesises a real
        `contextmenu` event at the finger — so every menu already in
        the system works on a phone, unmodified, including ones added
        later.

   The whole file is a no-op on a desktop-sized pointer machine: the
   predicates come back false and nothing is overridden.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var form = {};
  var root = document.documentElement;

  /* Chosen from the layout, not from a device list. 680 is where the
     dock stops fitting beside a half-width window; 460 tall is where a
     landscape phone leaves too little height for chrome plus content. */
  form.PHONE = 680;
  form.TABLET = 1024;
  form.SHORT = 460;

  var last = null;          // the kind we most recently applied
  var coarse = false;

  /* ───────────────────── CLASSIFYING ───────────────────── */

  form.w = function () { return window.innerWidth; };
  form.h = function () { return window.innerHeight; };

  form.kind = function () {
    var w = form.w(), h = form.h();
    if (w < form.PHONE || (h < form.SHORT && w < 900)) return "phone";
    if (w < form.TABLET) return "tablet";
    return "desktop";
  };

  form.phone = function () { return form.kind() === "phone"; };
  form.short = function () { return form.h() < form.SHORT; };
  form.portrait = function () { return form.h() >= form.w(); };

  /** A coarse pointer — a finger, or a pen. Latches on once seen. */
  form.touch = function () {
    if (coarse) return true;
    try {
      if (window.matchMedia && matchMedia("(pointer: coarse)").matches) coarse = true;
    } catch (e) { /* older engines */ }
    return coarse;
  };

  /* ── the three behavioural questions ────────────────────────── */

  /** Should windows fill the frame instead of floating and cascading? */
  form.tiled = function () {
    var pref = DS.store.get("layout.tile", "auto");
    if (pref === "on") return true;
    if (pref === "off") return false;
    return form.phone();
  };

  /** Should widgets flow in a column instead of being dragged around? */
  form.flowWidgets = function () { return form.phone(); };

  /** Is hiding the dock until the pointer nears the edge reachable?
      With a finger there is no "nears" — the dock would be gone for
      good — so auto-hide is ignored rather than obeyed. */
  form.dockAutohide = function () {
    return !!DS.store.get("dock.autohide", false) && !form.touch();
  };

  /* ───────────────────── APPLYING ───────────────────── */

  form.apply = function (force) {
    var kind = form.kind();
    root.setAttribute("data-form", kind);
    root.setAttribute("data-orient", form.portrait() ? "portrait" : "landscape");
    root.setAttribute("data-touch", form.touch() ? "on" : "off");
    root.setAttribute("data-short", form.short() ? "on" : "off");

    var changed = kind !== last;
    last = kind;
    if (!changed && !force) return kind;

    /* A change of kind changes what the furniture *is*, not just how
       it looks, so the pieces that JS builds are rebuilt. */
    if (DS.wm && DS.wm.refit) DS.wm.refit();
    if (DS.glass && DS.glass.applyDock) DS.glass.applyDock();
    if (DS.shell && DS.shell.applyDockLayout) DS.shell.applyDockLayout();
    if (DS.widgets && DS.widgets.reflow) DS.widgets.reflow();
    if (DS.glass && DS.glass.redress) DS.glass.redress();
    return kind;
  };

  /* ───────────────────── LONG PRESS ─────────────────────
     Held for 520ms without wandering more than a few pixels, a touch
     becomes a right-click. The click that arrives on release is
     swallowed in the capture phase, or it would land on the menu that
     just appeared under the finger and pick its first row. */
  function wireLongPress() {
    var timer = null;
    var target = null;
    var sx = 0, sy = 0;
    var fired = false;

    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      target = null;
    }

    document.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch" || e.isPrimary === false) return;
      cancel();
      fired = false;
      target = e.target;
      sx = e.clientX;
      sy = e.clientY;
      timer = setTimeout(function () {
        timer = null;
        if (!target || !target.isConnected) return;
        fired = true;
        // a short tick, where the platform offers one
        if (navigator.vibrate) { try { navigator.vibrate(11); } catch (err) {} }
        target.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, view: window,
          clientX: sx, clientY: sy
        }));
      }, 520);
    }, true);

    document.addEventListener("pointermove", function (e) {
      if (!timer) return;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) cancel();
    }, true);

    ["pointerup", "pointercancel"].forEach(function (ev) {
      document.addEventListener(ev, cancel, true);
    });

    document.addEventListener("click", function (e) {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  /* ───────────────────── INIT ───────────────────── */

  var pending = null;
  function onResize() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = null; form.apply(); }, 90);
  }

  form.init = function () {
    if (form._live) return;
    form._live = true;
    form.apply(true);
    wireLongPress();

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    /* The first real touch settles the question that matchMedia can
       only guess at on hybrid machines. */
    window.addEventListener("touchstart", function () {
      if (coarse) return;
      coarse = true;
      form.apply(true);
    }, { passive: true, once: true });

    /* On a phone the visual viewport is the honest one: it shrinks for
       the keyboard and for the browser's own chrome. */
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onResize);
    }
  };

  DS.form = form;
})(window.DS);
