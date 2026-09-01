/* ═══════════════════════════════════════════════════════════════
   awards.js — what the Games app remembers about you

   Three things live here, and they are one thing underneath: a bag
   of counters.

     stats      every game keeps its own tallies — beads eaten,
                bricks broken, fields cleared
     achievements  a named threshold on one of those counters
     skins      an unlockable look, gated on the same counters

   Making achievements declarative (`key` >= `at`) rather than
   callbacks buys two things for free: a progress bar, because the
   distance to the threshold is a number, and idempotence, because
   re-evaluating the whole list is just comparisons. Nothing here
   needs an event bus.

   Everything persists under one `games` key. See js/core/store.js.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var awards = {};

  var list = [];        // every achievement, in registration order
  var index = {};       // id -> def
  var skinReg = {};     // gameId -> [ category ]

  awards.TIERS = {
    bronze: { label: "Bronze", hue: 28 },
    silver: { label: "Silver", hue: 210 },
    gold:   { label: "Gold",   hue: 45 }
  };

  /* ───────────────────── STATS ─────────────────────
     One object per game. `runs`, `wins` and `best` are kept by
     finish(); everything else a game bumps itself. */
  function bag() { return DS.store.get("games.stats", {}); }

  awards.stats = function (gameId) {
    var b = bag();
    return b[gameId] || {};
  };

  /** Add to a counter. The default step of 1 covers most calls. */
  awards.stat = function (gameId, key, n) {
    var b = bag();
    var g = b[gameId] || (b[gameId] = {});
    g[key] = (g[key] || 0) + (n === undefined ? 1 : n);
    DS.store.set("games.stats", b);
    return g[key];
  };

  /** Keep the largest (or, with `low`, the smallest) value ever seen. */
  awards.peak = function (gameId, key, v, low) {
    var b = bag();
    var g = b[gameId] || (b[gameId] = {});
    var cur = g[key];
    if (cur === undefined || (low ? v < cur : v > cur)) {
      g[key] = v;
      DS.store.set("games.stats", b);
      return true;
    }
    return false;
  };

  /* ───────────────────── BEST SCORES ───────────────────── */
  awards.best = function (gameId) {
    var b = DS.store.get("games.best", {});
    return b[gameId] === undefined ? null : b[gameId];
  };

  awards.plays = function (gameId) {
    return DS.store.get("games.plays", {})[gameId] || 0;
  };

  awards.lastPlayed = function (gameId) {
    return DS.store.get("games.last", {})[gameId] || 0;
  };

  /** One finished run. Returns what it earned, so the end card can
      say so on the spot rather than only in a notification. */
  awards.finish = function (def, value, opts) {
    var o = opts || {};
    var id = def.id;

    var plays = DS.store.get("games.plays", {});
    plays[id] = (plays[id] || 0) + 1;
    DS.store.set("games.plays", plays);

    var last = DS.store.get("games.last", {});
    last[id] = Date.now();
    DS.store.set("games.last", last);

    awards.stat(id, "runs");
    if (o.win) awards.stat(id, "wins");

    var beat = false;
    if (o.record !== false) {
      var b = DS.store.get("games.best", {});
      var cur = b[id];
      beat = cur === undefined || cur === null || (def.low ? value < cur : value > cur);
      if (beat) { b[id] = value; DS.store.set("games.best", b); }
      /* `best` is also a stat, so an achievement can be written
         against it exactly like any other counter */
      awards.peak(id, "best", value, def.low);
    }

    var got = awards.check();
    return { beat: beat, fresh: got.achievements, skins: got.skins };
  };

  /* ───────────────────── ACHIEVEMENTS ─────────────────────
     { id, game, name, hint, icon, tier, key, at, cmp } — earned when
     the game's `key` counter passes `at`. `cmp: "lte"` is for the
     ones where smaller is better (clearing Facets in few turns), and
     those show no progress bar because counting down to a target you
     might never approach is not progress. */
  awards.achievement = function (def) {
    if (index[def.id]) return index[def.id];
    index[def.id] = def;
    list.push(def);
    return def;
  };

  awards.all = function () { return list.slice(); };

  awards.forGame = function (gameId) {
    return list.filter(function (a) { return a.game === gameId; });
  };

  function held(def) {
    var v = def.game ? awards.stats(def.game)[def.key] : totalOf(def.key);
    if (v === undefined || v === null) return null;
    return v;
  }

  /** Cross-game counters, for the achievements that are not about
      any one game. */
  function totalOf(key) {
    var b = bag();
    if (key === "unlocked") return awards.earnedIds().length;
    if (key === "played") {
      return Object.keys(b).filter(function (g) { return (b[g].runs || 0) > 0; }).length;
    }
    var sum = 0;
    Object.keys(b).forEach(function (g) { sum += b[g][key] || 0; });
    return sum;
  }

  awards.satisfied = function (def) {
    var v = held(def);
    if (v === null) return false;
    return def.cmp === "lte" ? v <= def.at : v >= def.at;
  };

  /** [have, need] for the progress bar, or null when there is none. */
  awards.progress = function (def) {
    if (def.cmp === "lte") return null;
    var v = held(def);
    return [Math.min(v === null ? 0 : v, def.at), def.at];
  };

  awards.earnedIds = function () { return Object.keys(DS.store.get("games.earned", {})); };
  awards.earnedAt = function (id) { return DS.store.get("games.earned", {})[id] || 0; };
  awards.isEarned = function (id) { return !!DS.store.get("games.earned", {})[id]; };

  awards.tally = function (gameId) {
    var of = gameId ? awards.forGame(gameId) : list;
    var got = of.filter(function (a) { return awards.isEarned(a.id); }).length;
    return { got: got, total: of.length };
  };

  /* ── the "new since you last looked" dot ── */
  awards.unseen = function () {
    var seen = DS.store.get("games.seen", {});
    return awards.earnedIds().filter(function (id) { return !seen[id]; }).length;
  };
  awards.markSeen = function () {
    var seen = DS.store.get("games.seen", {});
    awards.earnedIds().forEach(function (id) { seen[id] = 1; });
    DS.store.set("games.seen", seen);
  };

  /* ───────────────────── SKINS ─────────────────────
     A category is { key, label, items: [...] }; an item is
     { id, label, note, need: { key, at } } plus whatever payload the
     game wants to read off it. The first item in a category is
     always the default and is never locked. */
  awards.skins = function (gameId, categories) {
    skinReg[gameId] = categories;
    categories.forEach(function (cat) {
      cat.items.forEach(function (it, i) { if (i === 0) delete it.need; });
    });
    return categories;
  };

  awards.skinCats = function (gameId) { return skinReg[gameId] || []; };

  awards.skinUnlocked = function (gameId, item) {
    if (!item.need) return true;
    var v = awards.stats(gameId)[item.need.key];
    if (v === undefined) v = 0;
    return item.need.cmp === "lte" ? v <= item.need.at : v >= item.need.at;
  };

  awards.skinNote = function (item) {
    if (!item.need) return "Always yours";
    return item.note || (item.need.at + " " + item.need.key);
  };

  /** The item a game should actually draw with. Falls back to the
      default if the chosen one is not (or is no longer) unlocked. */
  awards.skin = function (gameId, catKey) {
    var cats = awards.skinCats(gameId);
    var cat = null;
    for (var i = 0; i < cats.length; i++) if (cats[i].key === catKey) cat = cats[i];
    if (!cat || !cat.items.length) return {};

    var pickId = DS.store.get("games.skins", {})[gameId + ":" + catKey];
    for (var j = 0; j < cat.items.length; j++) {
      if (cat.items[j].id === pickId && awards.skinUnlocked(gameId, cat.items[j])) {
        return cat.items[j];
      }
    }
    return cat.items[0];
  };

  awards.choose = function (gameId, catKey, itemId) {
    var picks = DS.store.get("games.skins", {});
    picks[gameId + ":" + catKey] = itemId;
    DS.store.set("games.skins", picks);
  };

  /* How many looks are open, across everything — one number for the
     shelf to show. */
  awards.skinTally = function (gameId) {
    var got = 0, total = 0;
    var ids = gameId ? [gameId] : Object.keys(skinReg);
    ids.forEach(function (id) {
      awards.skinCats(id).forEach(function (cat) {
        cat.items.forEach(function (it) {
          total += 1;
          if (awards.skinUnlocked(id, it)) got += 1;
        });
      });
    });
    return { got: got, total: total };
  };

  /* ───────────────────── EVALUATION ─────────────────────
     Cheap enough to run on every counter change: a few dozen
     comparisons. Anything newly true is banked and announced. */
  var quiet = false;

  awards.check = function () {
    var fresh = [];

    /* Two of these count *other* achievements, so one pass can make
       the next one true. Three passes is more than the chain is deep
       and stops the moment nothing changes. */
    for (var pass = 0; pass < 3; pass++) {
      var earned = DS.store.get("games.earned", {});
      var round = [];
      list.forEach(function (def) {
        if (earned[def.id]) return;
        if (!awards.satisfied(def)) return;
        earned[def.id] = Date.now();
        round.push(def);
      });
      if (!round.length) break;
      DS.store.set("games.earned", earned);
      fresh = fresh.concat(round);
    }

    /* Newly available looks are worth announcing too — an unlock you
       are not told about may as well not have happened. */
    var known = DS.store.get("games.skinsSeen", {});
    var newSkins = [];
    Object.keys(skinReg).forEach(function (gid) {
      awards.skinCats(gid).forEach(function (cat) {
        cat.items.forEach(function (it) {
          var key = gid + ":" + cat.key + ":" + it.id;
          if (known[key]) return;
          if (!awards.skinUnlocked(gid, it)) return;
          known[key] = 1;
          if (it.need) newSkins.push({ game: gid, cat: cat, item: it });
        });
      });
    });
    if (newSkins.length) DS.store.set("games.skinsSeen", known);

    if (!quiet) {
      fresh.forEach(function (def) { announce(def); });
      newSkins.forEach(function (s) { announceSkin(s); });
    }
    return { achievements: fresh, skins: newSkins };
  };

  /** Seed the "already seen" sets without shouting about them —
      used on first boot so an existing save does not fire thirty
      notifications at once. */
  awards.settle = function () {
    quiet = true;
    awards.check();
    quiet = false;
  };

  function open(pane, gameId) {
    DS.wm.open("games");
    var win = DS.qs('.win[data-app="games"]');
    if (win && win._api && win._api.showPane) win._api.showPane(pane, gameId);
  }

  function announce(def) {
    var g = def.game ? DS.games.get(def.game) : null;
    DS.ui.toast({
      icon: def.icon || "star",
      title: "Achievement — " + def.name,
      body: (g ? g.name + " · " : "") + def.hint,
      timeout: 9000,
      action: { label: "Achievements", run: function () { open("awards"); } }
    });
  }

  function announceSkin(s) {
    var g = DS.games.get(s.game);
    DS.ui.toast({
      icon: "palette",
      title: "New look — " + s.item.label,
      body: "A new " + s.cat.label.toLowerCase() + " for " +
            (g ? g.name : "the Games app") + ". Open the locker to wear it.",
      timeout: 9000,
      action: {
        label: "Open the locker",
        run: function () { open("locker", s.game); }
      }
    });
  }

  /* ───────────────────── ACROSS EVERY GAME ─────────────────────
     No `game`, so these read the cross-game totals in totalOf(). */
  [
    { id: "arcade-open",  name: "Coin In",      hint: "Play any game once.",
      icon: "gamepad", tier: "bronze", key: "runs",     at: 1 },
    { id: "arcade-all",   name: "The Full Set", hint: "Play every game at least once.",
      icon: "grid",    tier: "silver", key: "played",   at: 7 },
    { id: "arcade-fifty", name: "Regular",      hint: "Fifty runs across every game.",
      icon: "refresh", tier: "silver", key: "runs",     at: 50 },
    { id: "arcade-half",  name: "Collector",    hint: "Earn fifteen achievements.",
      icon: "star",    tier: "silver", key: "unlocked", at: 15 },
    { id: "arcade-full",  name: "Cabinet Owner", hint: "Earn twenty-eight achievements.",
      icon: "layers",  tier: "gold",   key: "unlocked", at: 28 }
  ].forEach(function (a) { awards.achievement(a); });

  DS.awards = awards;
})(window.DS);
