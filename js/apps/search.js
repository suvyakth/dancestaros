/* ═══════════════════════════════════════════════════════════════
   search.js — Search

   A search engine, but for this machine rather than the web. It
   cannot index the internet: a page with no server behind it is
   blocked from reading other sites by CORS, so a "web search" here
   would be a text box that lies. What it can do is index everything
   the OS actually holds, and do it properly.

   Indexed: every file's NAME and CONTENTS, notes, calendar events,
   apps, actions, shell commands, settings panes, saved looks and
   your own custom commands.

   Scoring is crude on purpose and works well: exact word beats
   prefix beats substring, name beats body, and a short field
   matching beats a long one.

   The web box at the bottom is honest about what it does — it hands
   the query to your real browser in a new tab.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var fs = DS.fs;

  var ENGINES = {
    duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
    google:     { label: "Google",     url: "https://www.google.com/search?q=" },
    wikipedia:  { label: "Wikipedia",  url: "https://en.wikipedia.org/w/index.php?search=" },
    mdn:        { label: "MDN",        url: "https://developer.mozilla.org/en-US/search?q=" }
  };

  /* ── scoring ── */
  function score(hay, needle, weight) {
    if (!hay) return 0;
    var t = hay.toLowerCase();
    var i = t.indexOf(needle);
    if (i < 0) return 0;
    var s = 12;                                   // substring
    if (i === 0) s = 30;                          // prefix
    if (t === needle) s = 60;                     // exact
    else if (new RegExp("\\\\b" + needle.replace(/[.*+?^${}()|[\]\\\\]/g, "\\\\$&") + "\\\\b")
             .test(t)) s = 42;                    // whole word
    // a hit in a short field means more than one buried in an essay
    s += Math.max(0, 14 - Math.floor(t.length / 40));
    return s * (weight || 1);
  }

  function snippet(text, needle) {
    var t = String(text || "");
    var i = t.toLowerCase().indexOf(needle);
    if (i < 0) return t.slice(0, 90).replace(/\s+/g, " ");
    var from = Math.max(0, i - 34);
    return (from ? "…" : "") +
      t.slice(from, from + 110).replace(/\s+/g, " ") +
      (from + 110 < t.length ? "…" : "");
  }

  /* ── the index ── */
  function build() {
    var idx = [];

    /* files, names and contents both */
    fs.walk("/", function (node, path) {
      if (node.type === "dir") {
        idx.push({
          kind: "Folders", icon: "folder", title: node.name, sub: path,
          name: node.name, body: "",
          run: function () { DS.wm.open("finder", { path: path }); }
        });
        return;
      }
      var inNotes = path.indexOf("/Users/you/Notes/") === 0;
      idx.push({
        kind: inNotes ? "Notes" : "Files",
        icon: node.kind === "image" ? "image"
            : node.kind === "audio" ? "music"
            : node.kind === "video" ? "photos"
            : inNotes ? "notes" : "doc",
        title: node.name,
        sub: fs.dirname(path),
        name: node.name,
        body: node.media ? "" : String(node.content || ""),
        run: function () { DS.openPath(path); }
      });
    });

    /* calendar */
    DS.store.get("calendar.events", []).forEach(function (e) {
      idx.push({
        kind: "Calendar", icon: "grid",
        title: e.title,
        sub: e.date + (e.allDay ? " · all day" : " · " + (e.start || "")),
        name: e.title, body: e.notes || "",
        run: function () { DS.wm.open("calendar", { today: false }); }
      });
    });

    /* apps + every registered action */
    DS.apps.all().forEach(function (a) {
      idx.push({
        kind: "Apps", icon: a.icon, title: a.name, sub: "Application",
        name: a.name, body: a.id,
        run: function () { DS.wm.open(a.id); }
      });
    });
    DS.actions.all().forEach(function (a) {
      if (a.id.indexOf("app:") === 0) return;      // already listed above
      idx.push({
        kind: "Actions", icon: a.icon || "star", title: a.label, sub: a.group,
        name: a.label, body: a.id,
        run: function () { DS.actions.run(a.id); }
      });
    });

    /* your own shell commands */
    var mine = DS.store.get("customCmds", {});
    Object.keys(mine).forEach(function (n) {
      idx.push({
        kind: "Your commands", icon: "terminal", title: n, sub: mine[n],
        name: n, body: mine[n],
        run: function () { DS.wm.open("terminal"); }
      });
    });

    /* saved looks */
    var looks = DS.store.get("looks", {});
    Object.keys(looks).forEach(function (n) {
      idx.push({
        kind: "Looks", icon: "palette", title: n, sub: "Saved appearance",
        name: n, body: looks[n].theme || "",
        run: function () { DS.wm.open("settings", { pane: "looks" }); }
      });
    });

    /* settings panes */
    [["appearance", "Appearance", "themes accent avatar bead colour"],
     ["users", "Users", "accounts switch profile people"],
     ["wallpaper", "Wallpaper", "background orbs colours studio"],
     ["glass", "Glass", "blur tint dispersion sheen rim finish light depth optics"],
     ["looks", "Looks", "save export import json"],
     ["widgets", "Widgets", "desktop clock calendar sticky stats"],
     ["shortcuts", "Shortcuts", "keyboard bind keys combo"],
     ["lock", "Lock", "passcode pin security privacy"],
     ["desktop", "Desktop", "dock taskbar minimise motion position"],
     ["storage", "Storage", "space localstorage indexeddb media erase"]
    ].forEach(function (p) {
      idx.push({
        kind: "Settings", icon: "settings",
        title: "Settings · " + p[1], sub: p[2],
        name: p[1], body: p[2],
        run: function () { DS.wm.open("settings", { pane: p[0] }); }
      });
    });

    return idx;
  }

  DS.apps.register({
    id: "search",
    name: "Search",
    icon: "search",
    w: 720, h: 560, minW: 460, minH: 380,
    flush: true,

    mount: function (body, api) {
      var index = build();
      var filter = "all";

      var input = h("input.se-input", {
        type: "text", placeholder: "Search this machine…",
        spellcheck: "false", autocomplete: "off",
        oninput: function () { paint(); },
        onkeydown: function (e) {
          if (e.key === "Enter") {
            var first = DS.qs(".se-hit", results);
            if (first) first.click();
          }
        }
      });

      var chips = h("div.se-chips");
      var results = h("div.se-results");
      var status = h("div.app-statusbar");

      body.appendChild(h("div.se-col", {}, [
        h("div.se-bar", {}, [
          h("span", { html: DS.icon("search", 19) }),
          input,
          h("button.g-btn.g-btn-sq", {
            html: DS.icon("refresh", 14), title: "Rebuild the index",
            onclick: function () {
              index = build();
              paint();
              DS.ui.toast({ icon: "search", title: "Reindexed",
                            body: index.length + " things" });
            }
          })
        ]),
        chips,
        results,
        h("div.se-web", {}, [
          h("span", { text: "Not here?" }),
          h("div.se-engines"),
          h("i", { text: "Opens in your real browser — a page with no server " +
                         "behind it cannot search the web itself." })
        ]),
        status
      ]));

      /* filter chips */
      function paintChips(counts) {
        DS.clear(chips);
        var kinds = ["all"].concat(Object.keys(counts).sort());
        kinds.forEach(function (k) {
          var n = k === "all"
            ? Object.keys(counts).reduce(function (s, x) { return s + counts[x]; }, 0)
            : counts[k];
          chips.appendChild(h("button.se-chip" + (k === filter ? ".on" : ""), {
            onclick: function () { filter = k; paint(); }
          }, [
            h("span", { text: k === "all" ? "Everything" : k }),
            h("i", { text: n })
          ]));
        });
      }

      function paintEngines(q) {
        var host = DS.qs(".se-engines", body);
        DS.clear(host);
        Object.keys(ENGINES).forEach(function (id) {
          host.appendChild(h("button.g-btn", {
            text: ENGINES[id].label,
            onclick: function () {
              window.open(ENGINES[id].url + encodeURIComponent(q || input.value), "_blank",
                          "noopener");
            }
          }));
        });
      }

      function paint() {
        var q = input.value.trim().toLowerCase();
        DS.clear(results);
        paintEngines(q);

        if (!q) {
          paintChips({});
          results.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("search", 34) }),
            h("div", { text: index.length + " things indexed on this machine" }),
            h("div", {
              text: "File names and contents, notes, events, apps, actions, " +
                    "your own commands and every settings pane.",
              style: { "font-size": "11px", "max-width": "40ch" }
            })
          ]));
          DS.clear(status);
          status.appendChild(h("span", { text: "Ready" }));
          return;
        }

        var hits = [];
        index.forEach(function (it) {
          var sc = score(it.name, q, 3) + score(it.sub, q, 1) + score(it.body, q, 1.4);
          if (sc > 0) hits.push({ it: it, score: sc });
        });
        hits.sort(function (a, b) { return b.score - a.score; });

        var counts = {};
        hits.forEach(function (x) { counts[x.it.kind] = (counts[x.it.kind] || 0) + 1; });
        paintChips(counts);

        var shown = hits.filter(function (x) {
          return filter === "all" || x.it.kind === filter;
        }).slice(0, 120);

        var group = null;
        shown.forEach(function (x) {
          if (x.it.kind !== group) {
            group = x.it.kind;
            results.appendChild(h("div.lch-group", { text: group }));
          }
          var body2 = x.it.body && x.it.body.toLowerCase().indexOf(q) >= 0
            ? snippet(x.it.body, q) : x.it.sub;
          results.appendChild(h("div.se-hit", {
            onclick: function () { x.it.run(); }
          }, [
            h("div.li", { html: DS.icon(x.it.icon, 16) }),
            h("div.se-txt", {}, [
              h("b", { html: mark(x.it.title, q) }),
              h("i", { html: mark(body2, q) })
            ]),
            h("span.se-score", { text: Math.round(x.score) })
          ]));
        });

        if (!shown.length) {
          results.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("search", 30) }),
            h("div", { text: "Nothing on this machine matches “" + input.value + "”" }),
            h("div", { text: "Try the web buttons below.",
                       style: { "font-size": "11px" } })
          ]));
        }

        DS.clear(status);
        status.appendChild(h("span", {
          text: hits.length + " match" + (hits.length === 1 ? "" : "es") +
                " in " + index.length + " indexed"
        }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        status.appendChild(h("span", { text: filter === "all" ? "" : "filtered: " + filter }));
      }

      function mark(text, q) {
        var t = DS.esc(String(text || ""));
        if (!q) return t;
        var i = t.toLowerCase().indexOf(q);
        if (i < 0) return t;
        return t.slice(0, i) + "<mark>" + t.slice(i, i + q.length) + "</mark>" +
               t.slice(i + q.length);
      }

      paint();
      if (api.arg && api.arg.q) { input.value = api.arg.q; paint(); }
      setTimeout(function () { input.focus(); }, 80);

      api.setQuery = function (q) { input.value = q; paint(); input.focus(); };
    },

    onArg: function (api, arg) {
      if (arg && arg.q && api.setQuery) api.setQuery(arg.q);
    }
  });
})(window.DS);
