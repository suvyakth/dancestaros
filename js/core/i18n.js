/* ═══════════════════════════════════════════════════════════════
   i18n.js — the language runtime

   Three jobs:

     1. translate.  Every phrase in the interface is an English
        literal inside the code that draws it, so instead of a key
        lookup at each call site this walks the DOM and swaps text
        nodes it recognises. A MutationObserver catches whatever the
        apps draw next, so a menu built three clicks from now arrives
        already translated.

        The original English is kept beside each node it touches, so
        switching language re-translates from the source rather than
        translating a translation.

     2. format.  Dates and times in this OS are all written
        `toLocaleTimeString([], …)` — an empty locale list, meaning
        "whatever the browser is set to". Those three methods are
        wrapped here so an empty list becomes *the chosen* locale,
        and so a 24-hour preference can be forced through. Wrapping
        beats editing twenty call sites, and it keeps working for
        call sites written after this file.

     3. direction.  Arabic and friends get dir="rtl" on the root.
        The structural rows — menu bar, dock, title bars — are pinned
        back to ltr in lang.css unless full mirroring is asked for,
        because flipping a layout is a much bigger claim than
        rendering its text in the right direction.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var i18n = {};
  var root = document.documentElement;

  /* English source text, per node we have rewritten. */
  var ORIG = new WeakMap();      // text node  → original nodeValue
  var AORIG = new WeakMap();     // element    → { attr: original }

  /* Phrases the interface showed us that the book had no entry for.
     Surfaced in Settings › Language so they can be filled in. */
  var misses = {};
  var missCount = 0;

  var live = false;
  var observer = null;
  var queue = [];
  var flushing = false;

  /* Never rewrite inside these. Terminal output, note bodies and file
     listings are the user's own text, not interface copy. */
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, TEXTAREA: 1, SVG: 1, CANVAS: 1,
    CODE: 1, PRE: 1, IFRAME: 1
  };
  var TR_ATTRS = ["title", "placeholder", "aria-label"];

  /* ───────────────────── LANGUAGE STATE ───────────────────── */

  i18n.LANGS = DS.LANGS;

  i18n.def = function (id) {
    var want = id || DS.store.get("lang", "en");
    return DS.LANGS.filter(function (l) { return l.id === want; })[0] || DS.LANGS[0];
  };

  i18n.id = function () { return i18n.def().id; };
  i18n.rtl = function () { return !!i18n.def().rtl; };

  /** What Intl should be handed. "Automatic" hands it the browser's own. */
  i18n.locale = function () {
    var region = DS.store.get("region", "");
    if (region) return region;
    var d = i18n.def();
    return d.id === "en" ? (navigator.language || "en") : d.locale;
  };

  /** Built-in book plus anything the user has filled in themselves. */
  function dict() {
    var id = i18n.id();
    if (id === "en") return null;
    var base = DS.PHRASES[id] || {};
    var mine = DS.store.get("phrases", {})[id];
    if (!mine) return base;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(mine).forEach(function (k) { if (mine[k]) out[k] = mine[k]; });
    return out;
  }

  /* ───────────────────── TRANSLATION ───────────────────── */

  /* Worth offering as a gap to fill in? Interface copy is short, has
     letters, and holds still. Anything with a digit in it is thrown
     out: clocks, dates, counters and percentages all pass through here
     every second, they are never the same string twice, and a phrase
     book entry for "3:42 PM" would be worse than useless. */
  function interesting(s) {
    if (s.length < 2 || s.length > 64) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    if (/\d/.test(s)) return false;
    if (s.indexOf("/") >= 0 || s.indexOf("\\") >= 0) return false;
    return true;
  }

  /** Translate one phrase. Unknown phrases come back untouched. */
  i18n.t = function (s) {
    var D = dict();
    var str = String(s == null ? "" : s);
    if (!D) return str;

    var lead = str.match(/^\s*/)[0];
    var core = str.trim();
    if (!core) return str;

    if (D[core]) return lead + D[core];

    /* "System Settings…" resolves from the entry for "System Settings" */
    var m = /^(.*?)([…:]+)$/.exec(core);
    if (m && D[m[1]]) return lead + D[m[1]] + m[2];

    if (interesting(core) && !misses[core] && missCount < 600) {
      misses[core] = true;
      missCount += 1;
    }
    return str;
  };

  i18n.missing = function () { return Object.keys(misses).sort(); };

  i18n.coverage = function () {
    var D = dict();
    var total = Object.keys(DS.PHRASES.es || {}).length;
    return {
      known: D ? Object.keys(D).length : total,
      total: total,
      gaps: missCount
    };
  };

  /** Record a translation of your own. Survives a reload. */
  i18n.addPhrase = function (en, tr, langId) {
    var id = langId || i18n.id();
    if (id === "en") return false;
    var all = DS.store.get("phrases", {});
    if (!all[id]) all[id] = {};
    if (tr) all[id][en] = tr;
    else delete all[id][en];
    DS.store.set("phrases", all);
    delete misses[en];
    i18n.scan(document.body);
    return true;
  };

  /* ───────────────────── THE DOM PASS ───────────────────── */

  function skipped(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (n.nodeType !== 1) continue;
      if (SKIP_TAGS[n.nodeName.toUpperCase()]) return true;
      if (n.hasAttribute && n.hasAttribute("data-noi18n")) return true;
      if (n.isContentEditable) return true;
    }
    return false;
  }

  function doText(node) {
    var src = ORIG.has(node) ? ORIG.get(node) : node.nodeValue;
    if (!src || !/\S/.test(src)) return;
    var out = i18n.t(src);
    if (out === node.nodeValue) return;
    if (!ORIG.has(node)) ORIG.set(node, src);
    node.nodeValue = out;
  }

  function doAttrs(el) {
    var kept = AORIG.get(el);
    TR_ATTRS.forEach(function (a) {
      var have = el.getAttribute(a);
      if (have === null && !(kept && a in kept)) return;
      var src = kept && a in kept ? kept[a] : have;
      if (!src) return;
      var out = i18n.t(src);
      if (out === have) return;
      if (!kept) { kept = {}; AORIG.set(el, kept); }
      if (!(a in kept)) kept[a] = src;
      el.setAttribute(a, out);
    });
  }

  /** Rewrite a subtree in place. Safe to call as often as you like. */
  i18n.scan = function (target) {
    if (!target) return;
    var node = target.nodeType === 3 ? target.parentElement : target;
    if (!node || skipped(node)) return;

    if (target.nodeType === 3) { doText(target); return; }

    if (node.nodeType === 1) doAttrs(node);

    var walk = document.createTreeWalker(node, 5 /* ELEMENT | TEXT */, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (SKIP_TAGS[n.nodeName.toUpperCase()] ||
              (n.hasAttribute && n.hasAttribute("data-noi18n")) ||
              n.isContentEditable) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    var cur;
    while ((cur = walk.nextNode())) {
      if (cur.nodeType === 3) doText(cur);
      else doAttrs(cur);
    }
  };

  /* Anything drawn after the last pass gets caught here. We watch
     childList only: our own writes are to nodeValue and attributes,
     so the observer can never see its own work and loop. */
  function flush() {
    flushing = false;
    var batch = queue;
    queue = [];
    batch.forEach(function (n) {
      if (n && n.isConnected) i18n.scan(n);
    });
  }

  function watch() {
    if (observer) return;
    observer = new MutationObserver(function (records) {
      if (i18n.id() === "en") return;
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1 || added[j].nodeType === 3) queue.push(added[j]);
        }
      }
      if (queue.length && !flushing) {
        flushing = true;
        requestAnimationFrame(flush);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ───────────────────── DATE + TIME ───────────────────── */
  /* Patched once, at init. An empty locale list means "the browser's
     choice"; here it means "the language the user picked". */
  var patched = false;

  function pickLoc(loc) {
    if (loc === undefined || loc === null) return i18n.locale();
    if (Array.isArray(loc) && !loc.length) return i18n.locale();
    return loc;
  }

  function pickOpt(opt, hasTime) {
    var pref = DS.store.get("hour12", "auto");
    if (!hasTime || pref === "auto") return opt;
    var o = {};
    if (opt) Object.keys(opt).forEach(function (k) { o[k] = opt[k]; });
    if (o.hour12 === undefined && o.hourCycle === undefined) o.hour12 = pref === "12";
    return o;
  }

  function patchDates() {
    if (patched) return;
    patched = true;
    var P = Date.prototype;
    var time = P.toLocaleTimeString;
    var date = P.toLocaleDateString;
    var both = P.toLocaleString;

    P.toLocaleTimeString = function (loc, opt) {
      try { return time.call(this, pickLoc(loc), pickOpt(opt, true)); }
      catch (e) { return time.call(this, loc, opt); }
    };
    P.toLocaleDateString = function (loc, opt) {
      try { return date.call(this, pickLoc(loc), opt); }
      catch (e) { return date.call(this, loc, opt); }
    };
    P.toLocaleString = function (loc, opt) {
      try { return both.call(this, pickLoc(loc), pickOpt(opt, true)); }
      catch (e) { return both.call(this, loc, opt); }
    };
  }

  /* ───────────────────── APPLYING A LANGUAGE ───────────────────── */

  i18n.apply = function () {
    var d = i18n.def();
    root.setAttribute("lang", d.locale);
    root.setAttribute("data-lang", d.id);

    var wantRtl = d.rtl && DS.store.get("rtl", true) !== false;
    if (wantRtl) root.setAttribute("dir", "rtl");
    else root.removeAttribute("dir");
    root.setAttribute("data-mirror", DS.store.get("mirror", false) ? "on" : "off");

    if (live) i18n.scan(document.body);
  };

  /** Switch language and repaint everything that is already on screen. */
  i18n.set = function (id) {
    DS.store.set("lang", id);
    misses = {};
    missCount = 0;
    i18n.apply();
    i18n.scan(document.body);
    if (DS.shell && DS.shell.paintLangPill) DS.shell.paintLangPill();
    return id;
  };

  i18n.init = function () {
    if (live) return;
    live = true;
    patchDates();
    i18n.apply();
    watch();
    i18n.scan(document.body);
  };

  DS.i18n = i18n;

  /** Shorthand, for code written after this file. */
  DS.t = function (s) { return i18n.t(s); };
})(window.DS);
