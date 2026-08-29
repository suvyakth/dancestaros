/* ═══════════════════════════════════════════════════════════════
   calendar.js — Calendar

   Month, week and agenda views over one event list, with reminders
   that go through the same daemon as the alarms.

   ON GOOGLE CALENDAR. A static page cannot do a real Google sync:
   OAuth needs a client secret and a redirect the browser cannot
   keep, and Google's own iCal endpoints send no CORS headers, so
   fetching one from a page is blocked before it starts. Rather than
   ship a "Connect" button that never works, this does the part that
   genuinely does:

     import   drop or pick the .ics Google exports (Settings >
              Import & export, or the secret iCal address saved to
              a file) and every event lands here
     export   write an .ics that Google, Apple and Outlook all accept
     fetch    try a URL anyway, and say plainly when CORS refuses

   That is real interoperability in both directions. It is just not
   live sync, and pretending otherwise would be the actual bug.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var COLORS = ["#22d3ee", "#a855f7", "#f43f5e", "#fbbf24", "#34d399", "#60a5fa", "#fb923c"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

  /* ── date helpers, all local-time and string-keyed ── */
  function key(d) {
    return d.getFullYear() + "-" +
           ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
           ("0" + d.getDate()).slice(-2);
  }
  function fromKey(k) {
    var p = String(k).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfWeek(d, week0) {
    var x = new Date(d);
    var shift = week0 === 1 ? (x.getDay() + 6) % 7 : x.getDay();
    x.setDate(x.getDate() - shift);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function sameDay(a, b) { return key(a) === key(b); }
  function hhmm(t) { return t || ""; }
  function minutesOf(t) {
    if (!t) return 0;
    var p = t.split(":");
    return (+p[0]) * 60 + (+p[1] || 0);
  }
  function pretty(t) {
    if (!t) return "";
    var m = minutesOf(t);
    var d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  /* ── the store ── */
  function events() { return DS.store.get("calendar.events", []); }
  function save(list) { DS.store.set("calendar.events", list); }

  function onDay(k) {
    return events().filter(function (e) { return e.date === k; })
      .sort(function (a, b) {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return minutesOf(a.start) - minutesOf(b.start);
      });
  }

  /* ═══════════════ ICS ═══════════════ */
  function icsDate(k, t) {
    var d = fromKey(k);
    var base = d.getFullYear() +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      ("0" + d.getDate()).slice(-2);
    if (!t) return { v: base, allDay: true };
    return { v: base + "T" + t.replace(":", "") + "00", allDay: false };
  }

  function toICS(list) {
    var out = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Dancestar OS//Calendar//EN", "CALSCALE:GREGORIAN"
    ];
    list.forEach(function (e) {
      var s = icsDate(e.date, e.allDay ? null : e.start);
      var en = icsDate(e.date, e.allDay ? null : (e.end || e.start));
      out.push("BEGIN:VEVENT");
      out.push("UID:" + e.id + "@dancestar");
      out.push(s.allDay ? "DTSTART;VALUE=DATE:" + s.v : "DTSTART:" + s.v);
      out.push(en.allDay ? "DTEND;VALUE=DATE:" + en.v : "DTEND:" + en.v);
      out.push("SUMMARY:" + esc(e.title));
      if (e.notes) out.push("DESCRIPTION:" + esc(e.notes));
      out.push("END:VEVENT");
    });
    out.push("END:VCALENDAR");
    return out.join("\r\n");
  }
  function esc(t) {
    return String(t || "").replace(/[\\;,]/g, function (c) { return "\\" + c; })
      .replace(/\n/g, "\\n");
  }
  function unesc(t) {
    return String(t || "").replace(/\\n/gi, "\n").replace(/\\([\\;,])/g, "$1");
  }

  /** Parse VEVENTs. Handles folded lines, DATE and DATE-TIME forms. */
  function fromICS(text) {
    var raw = String(text).replace(/\r\n[ \t]/g, "").split(/\r?\n/);
    var out = [], cur = null;

    raw.forEach(function (line) {
      if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; return; }
      if (/^END:VEVENT/i.test(line)) {
        if (cur && cur.date) {
          out.push({
            id: DS.uid("ev"),
            date: cur.date,
            start: cur.start || "",
            end: cur.end || "",
            allDay: !cur.start,
            title: cur.title || "Untitled",
            notes: cur.notes || "",
            color: COLORS[out.length % COLORS.length],
            remind: 0
          });
        }
        cur = null;
        return;
      }
      if (!cur) return;

      var i = line.indexOf(":");
      if (i < 0) return;
      var name = line.slice(0, i).toUpperCase();
      var val = line.slice(i + 1);

      if (name.indexOf("DTSTART") === 0) {
        var p = parseStamp(val);
        cur.date = p.date;
        cur.start = p.time;
      } else if (name.indexOf("DTEND") === 0) {
        cur.end = parseStamp(val).time;
      } else if (name.indexOf("SUMMARY") === 0) {
        cur.title = unesc(val);
      } else if (name.indexOf("DESCRIPTION") === 0) {
        cur.notes = unesc(val);
      }
    });
    return out;
  }

  function parseStamp(v) {
    var m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(v);
    if (!m) return { date: null, time: "" };
    var isUTC = /Z$/.test(v);
    if (m[4] && isUTC) {
      // stored times are local, so shift a UTC stamp into local time
      var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      return { date: key(d), time: ("0" + d.getHours()).slice(-2) + ":" +
                                  ("0" + d.getMinutes()).slice(-2) };
    }
    return {
      date: m[1] + "-" + m[2] + "-" + m[3],
      time: m[4] ? m[4] + ":" + m[5] : ""
    };
  }

  DS.calendarICS = { to: toICS, from: fromICS };

  /* ═══════════════ THE APP ═══════════════ */
  DS.apps.register({
    id: "calendar",
    name: "Calendar",
    icon: "grid",
    w: 900, h: 620, minW: 600, minH: 440,
    flush: true,

    mount: function (body, api) {
      var cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      var selected = key(cursor);
      var view = DS.store.get("calendar.view", "month");
      var week0 = DS.store.get("calendar.week0", 1);

      var side = h("aside.app-side.cal-side");
      var main = h("div.app-main.cal-main");
      var titleEl = h("div.cal-title");
      var status = h("div.app-statusbar");

      var toolbar = h("div.app-toolbar", {}, [
        h("button.g-btn.g-btn-sq", {
          html: DS.icon("chevL", 15), onclick: function () { step(-1); }
        }),
        h("button.g-btn", { text: "Today", onclick: function () {
          cursor = new Date(); cursor.setHours(0, 0, 0, 0);
          selected = key(cursor); render();
        } }),
        h("button.g-btn.g-btn-sq", {
          html: DS.icon("chevR", 15), onclick: function () { step(1); }
        }),
        titleEl,
        h("div", { style: { flex: "1" } }),
        DS.ui.segmented(
          [{ label: "Month", value: "month" },
           { label: "Week", value: "week" },
           { label: "Agenda", value: "agenda" }],
          view,
          function (v) { view = v; DS.store.set("calendar.view", v); render(); }
        ),
        h("button.g-btn.g-btn-accent", {
          html: DS.icon("plus", 14) + "<span>New</span>",
          onclick: function () { compose(selected); }
        })
      ]);

      body.appendChild(side);
      body.appendChild(h("div.cal-col", {}, [toolbar, main, status]));

      function step(n) {
        if (view === "month") cursor.setMonth(cursor.getMonth() + n);
        else if (view === "week") cursor = addDays(cursor, n * 7);
        else cursor = addDays(cursor, n * 30);
        render();
      }

      /* ───────────── event editor ───────────── */
      function compose(dateKey, existing) {
        var ev = existing || {
          id: DS.uid("ev"), date: dateKey, start: "09:00", end: "10:00",
          title: "", notes: "", color: COLORS[0], allDay: false, remind: 10
        };

        var veil = h("div.dlg-veil");
        var panel = h("div.dlg.cal-dlg.g");

        var title = h("input.g-field", {
          type: "text", value: ev.title, placeholder: "What is it?"
        });
        var dateIn = h("input.g-field", { type: "date", value: ev.date });
        var startIn = h("input.g-field", { type: "time", value: ev.start || "09:00" });
        var endIn = h("input.g-field", { type: "time", value: ev.end || "10:00" });
        var notes = h("textarea.g-field", {
          rows: "3", placeholder: "Notes", value: ev.notes
        });

        var allDay = DS.ui.toggle(ev.allDay, function (v) {
          ev.allDay = v;
          times.style.opacity = v ? ".35" : "1";
          times.style.pointerEvents = v ? "none" : "";
        });
        var times = h("div.cal-times", {}, [startIn, h("span", { text: "to" }), endIn]);
        if (ev.allDay) { times.style.opacity = ".35"; times.style.pointerEvents = "none"; }

        var swatches = h("div.cal-swatches");
        COLORS.forEach(function (c) {
          var b = h("button.cal-sw" + (c === ev.color ? ".on" : ""), {
            style: { background: c },
            onclick: function () {
              ev.color = c;
              DS.qsa(".cal-sw", swatches).forEach(function (x) { x.classList.remove("on"); });
              b.classList.add("on");
            }
          });
          swatches.appendChild(b);
        });

        var remind = DS.ui.segmented(
          [{ label: "None", value: 0 }, { label: "10m", value: 10 },
           { label: "30m", value: 30 }, { label: "1h", value: 60 }],
          ev.remind || 0,
          function (v) { ev.remind = v; }
        );

        function close() {
          veil.style.opacity = "0";
          setTimeout(function () {
            if (veil.parentNode) veil.parentNode.removeChild(veil);
          }, 170);
          document.removeEventListener("keydown", onKey, true);
        }
        function onKey(e) {
          if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); }
        }

        function commit() {
          ev.title = title.value.trim() || "Untitled";
          ev.date = dateIn.value || ev.date;
          ev.start = ev.allDay ? "" : startIn.value;
          ev.end = ev.allDay ? "" : endIn.value;
          ev.notes = notes.value;
          var list = events().filter(function (x) { return x.id !== ev.id; });
          list.push(ev);
          save(list);
          selected = ev.date;
          close();
          render();
        }

        panel.appendChild(h("h3", { text: existing ? "Edit event" : "New event" }));
        panel.appendChild(title);
        panel.appendChild(h("div.cal-frow", {}, [dateIn]));
        panel.appendChild(DS.ui.row("All day", null, allDay));
        panel.appendChild(times);
        panel.appendChild(DS.ui.section("Colour"));
        panel.appendChild(swatches);
        panel.appendChild(DS.ui.section("Remind me"));
        panel.appendChild(remind);
        panel.appendChild(DS.ui.section("Notes"));
        panel.appendChild(notes);
        panel.appendChild(h("div.row", { style: { "margin-top": "16px" } }, [
          existing ? h("button.g-btn.g-btn-danger", {
            text: "Delete",
            onclick: function () {
              save(events().filter(function (x) { return x.id !== ev.id; }));
              close();
              render();
            }
          }) : null,
          h("div", { style: { flex: "1" } }),
          h("button.g-btn", { text: "Cancel", onclick: close }),
          h("button.g-btn.g-btn-accent", { text: "Save", onclick: commit })
        ].filter(Boolean)));

        veil.appendChild(panel);
        DS.qs("#desktop").appendChild(veil);
        DS.glass.dress(panel);
        document.addEventListener("keydown", onKey, true);
        setTimeout(function () { title.focus(); }, 60);
      }

      /* ───────────── views ───────────── */
      function pill(e, compact) {
        return h("div.cal-pill" + (compact ? ".mini" : ""), {
          style: { "--ec": e.color },
          title: (e.allDay ? "All day" : pretty(e.start)) + " · " + e.title,
          onclick: function (ev2) { ev2.stopPropagation(); compose(e.date, e); }
        }, compact ? [] : [
          h("i"),
          h("b", { text: e.title }),
          e.allDay ? null : h("u", { text: pretty(e.start) })
        ].filter(Boolean));
      }

      function renderMonth() {
        var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        var start = startOfWeek(first, week0);
        var grid = h("div.cal-grid");

        var dows = week0 === 1
          ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        dows.forEach(function (d) { grid.appendChild(h("div.cal-dow", { text: d })); });

        var today = key(new Date());
        for (var i = 0; i < 42; i++) {
          var d = addDays(start, i);
          var k = key(d);
          var out = d.getMonth() !== cursor.getMonth();
          var list = onDay(k);
          var cell = h("div.cal-cell" +
            (out ? ".out" : "") + (k === today ? ".today" : "") +
            (k === selected ? ".sel" : ""), {
            onclick: function (kk) {
              return function () { selected = kk; render(); };
            }(k),
            ondblclick: function (kk) {
              return function () { compose(kk); };
            }(k)
          }, [h("span.cal-num", { text: d.getDate() })]);

          list.slice(0, 3).forEach(function (e) { cell.appendChild(pill(e)); });
          if (list.length > 3) {
            cell.appendChild(h("div.cal-more", { text: "+" + (list.length - 3) + " more" }));
          }
          grid.appendChild(cell);
        }
        main.appendChild(grid);
      }

      function renderWeek() {
        var start = startOfWeek(cursor, week0);
        var wrap = h("div.cal-week");
        var today = key(new Date());

        for (var i = 0; i < 7; i++) {
          var d = addDays(start, i);
          var k = key(d);
          var col = h("div.cal-wcol" + (k === today ? ".today" : ""), {
            ondblclick: function (kk) { return function () { compose(kk); }; }(k)
          }, [
            h("div.cal-whead", {}, [
              h("b", { text: d.toLocaleDateString([], { weekday: "short" }) }),
              h("i", { text: d.getDate() })
            ])
          ]);
          var list = onDay(k);
          if (!list.length) col.appendChild(h("div.cal-wempty", { text: "—" }));
          list.forEach(function (e) { col.appendChild(pill(e)); });
          wrap.appendChild(col);
        }
        main.appendChild(wrap);
      }

      function renderAgenda() {
        var wrap = h("div.cal-agenda");
        var from = new Date(cursor);
        var found = 0;

        for (var i = 0; i < 60 && found < 40; i++) {
          var d = addDays(from, i);
          var list = onDay(key(d));
          if (!list.length) continue;
          found += list.length;
          wrap.appendChild(h("div.cal-arow", {}, [
            h("div.cal-adate", {}, [
              h("b", { text: d.getDate() }),
              h("i", { text: d.toLocaleDateString([], { weekday: "short", month: "short" }) })
            ]),
            h("div.cal-alist", {}, list.map(function (e) { return pill(e); }))
          ]));
        }
        if (!found) {
          wrap.appendChild(h("div.empty-state", {}, [
            h("div", { html: DS.icon("grid", 32) }),
            h("div", { text: "Nothing in the next 60 days" }),
            h("button.g-btn.g-btn-accent", {
              text: "Add an event", style: { "margin-top": "4px" },
              onclick: function () { compose(selected); }
            })
          ]));
        }
        main.appendChild(wrap);
      }

      /* ───────────── sidebar ───────────── */
      function renderSide() {
        DS.clear(side);
        var d = fromKey(selected);
        side.appendChild(h("div.side-label", { text: "Selected" }));
        side.appendChild(h("div.cal-selday", {}, [
          h("b", { text: d.getDate() }),
          h("i", { text: d.toLocaleDateString([], { weekday: "long", month: "long" }) })
        ]));

        var list = onDay(selected);
        if (!list.length) {
          side.appendChild(h("div", {
            text: "Nothing scheduled.",
            style: { padding: "8px", "font-size": "11.5px", color: "var(--text-3)" }
          }));
        }
        list.forEach(function (e) {
          side.appendChild(h("div.cal-sitem", {
            style: { "--ec": e.color },
            onclick: function () { compose(e.date, e); }
          }, [
            h("i"),
            h("div", {}, [
              h("b", { text: e.title }),
              h("u", { text: e.allDay ? "All day" : pretty(e.start) +
                (e.end ? " – " + pretty(e.end) : "") })
            ])
          ]));
        });

        side.appendChild(h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Add</span>",
          style: { width: "100%", "margin-top": "10px" },
          onclick: function () { compose(selected); }
        }));

        side.appendChild(h("div.side-label", {
          text: "Import & export", style: { "margin-top": "16px" }
        }));
        side.appendChild(h("button.g-btn", {
          html: DS.icon("upload", 14) + "<span>Import .ics</span>",
          style: { width: "100%", "margin-bottom": "6px" },
          onclick: importICS
        }));
        side.appendChild(h("button.g-btn", {
          html: DS.icon("download", 14) + "<span>Export .ics</span>",
          style: { width: "100%", "margin-bottom": "6px" },
          onclick: exportICS
        }));
        side.appendChild(h("button.g-btn", {
          html: DS.icon("wifi", 14) + "<span>From a URL</span>",
          style: { width: "100%" },
          onclick: fetchICS
        }));
        side.appendChild(h("p", {
          text: "Google exports .ics. Live sync would need OAuth and a server, " +
                "which this has neither of.",
          style: { "font-size": "10.5px", color: "var(--text-3)",
                   "line-height": "1.5", "margin-top": "8px" }
        }));
      }

      /* ───────────── interop ───────────── */
      function ingest(text, label) {
        var found = DS.calendarICS.from(text);
        if (!found.length) {
          DS.ui.toast({ icon: "info", title: "No events found", body: label });
          return;
        }
        save(events().concat(found));
        render();
        DS.ui.toast({
          icon: "grid", title: "Imported " + found.length + " event" +
            (found.length === 1 ? "" : "s"), body: label, timeout: 6000
        });
      }

      function importICS() {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".ics,text/calendar";
        input.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(input);
        input.addEventListener("change", function () {
          var f = input.files[0];
          if (!f) return;
          f.text().then(function (t) { ingest(t, f.name); });
          if (input.parentNode) input.parentNode.removeChild(input);
        });
        input.click();
      }

      function exportICS() {
        var list = events();
        if (!list.length) return DS.ui.toast({ icon: "info", title: "Nothing to export" });
        var blob = new Blob([toICS(list)], { type: "text/calendar" });
        DS.media.download(blob, "dancestar-calendar.ics");
        DS.media.save(blob, "/Users/you/Documents", "dancestar-calendar.ics", "file")
          .then(function () {
            DS.ui.toast({
              icon: "download", title: "Exported " + list.length + " events",
              body: "Downloaded, and saved to Documents.", timeout: 7000
            });
          });
      }

      function fetchICS() {
        DS.ui.prompt("Calendar URL",
          "Paste an .ics address. Most calendar hosts (Google included) send no " +
          "CORS headers, so the browser will usually block this before it starts. " +
          "If it fails, export the .ics and import the file instead.",
          "", { ok: "Try it" }).then(function (url) {
            if (!url) return;
            DS.ui.toast({ icon: "wifi", title: "Fetching…" });
            fetch(url)
              .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.text();
              })
              .then(function (t) { ingest(t, "from URL"); })
              .catch(function (err) {
                DS.ui.toast({
                  icon: "info", title: "Blocked",
                  body: "The browser refused that request — almost certainly CORS. " +
                        "Download the .ics and use Import instead.",
                  timeout: 10000
                });
                console.warn("[calendar] fetch failed:", err);
              });
          });
      }

      /* ───────────── render ───────────── */
      function render() {
        DS.clear(main);
        main.className = "app-main cal-main cal-" + view;

        titleEl.textContent = view === "month"
          ? MONTHS[cursor.getMonth()] + " " + cursor.getFullYear()
          : view === "week"
            ? "Week of " + startOfWeek(cursor, week0).toLocaleDateString(
                [], { day: "numeric", month: "short" })
            : "From " + cursor.toLocaleDateString([], { day: "numeric", month: "short" });

        if (view === "month") renderMonth();
        else if (view === "week") renderWeek();
        else renderAgenda();

        renderSide();

        var total = events().length;
        var todayCount = onDay(key(new Date())).length;
        DS.clear(status);
        status.appendChild(h("span", { text: total + " event" + (total === 1 ? "" : "s") }));
        status.appendChild(h("span", { style: { flex: "1" } }));
        status.appendChild(h("span", {
          text: todayCount ? todayCount + " today" : "Nothing today"
        }));
        api.setTitle("Calendar — " + titleEl.textContent);
        DS.glass.dress(main);
      }

      /* drop an .ics straight onto the grid */
      main.addEventListener("dragover", function (e) { e.preventDefault(); });
      main.addEventListener("drop", function (e) {
        var f = e.dataTransfer && e.dataTransfer.files[0];
        if (!f || !/\.ics$/i.test(f.name)) return;
        e.preventDefault();
        e.stopPropagation();
        f.text().then(function (t) { ingest(t, f.name); });
      });

      render();
      if (api.arg && api.arg.compose) compose(selected);

      api.goToday = function () {
        cursor = new Date(); cursor.setHours(0, 0, 0, 0);
        selected = key(cursor);
        render();
      };
      api.compose = function () { compose(selected); };
    },

    onArg: function (api, arg) {
      if (!arg) return;
      if (arg.today && api.goToday) api.goToday();
      if (arg.compose && api.compose) api.compose();
    }
  });

  /* ═══════════════ REMINDERS ═══════════════
     Folded into the alarm daemon rather than run on their own timer,
     so there is one clock deciding when things fire. */
  DS.calendarCheck = function () {
    var now = new Date();
    var k = key(now);
    var mins = now.getHours() * 60 + now.getMinutes();
    var list = events();
    var changed = false;

    list.forEach(function (e) {
      if (!e.remind || e.allDay || e.date !== k || !e.start) return;
      var due = minutesOf(e.start) - e.remind;
      if (mins !== due) return;
      if (e.firedOn === k) return;
      e.firedOn = k;
      changed = true;
      DS.chime.done();
      DS.ui.toast({
        icon: "grid",
        title: e.title,
        body: "Starts at " + pretty(e.start) + " — in " + e.remind + " minutes.",
        timeout: 12000,
        action: { label: "Open Calendar", run: function () { DS.wm.open("calendar"); } }
      });
    });
    if (changed) save(list);
  };
})(window.DS);
