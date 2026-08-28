/* ═══════════════════════════════════════════════════════════════
   clock.js — World clocks, Alarms, Stopwatch, Timer

   Alarms are owned by the daemon in core/time.js, not by this
   window, so they still ring with the app closed. The stopwatch and
   timer are deliberately window-local — they are scratch tools.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;
  var pad2 = DS.alarms.pad2;

  var ZONES = [
    ["local", "Local"],
    ["America/Los_Angeles", "Los Angeles"], ["America/New_York", "New York"],
    ["America/Sao_Paulo", "São Paulo"],     ["Europe/London", "London"],
    ["Europe/Berlin", "Berlin"],            ["Europe/Moscow", "Moscow"],
    ["Africa/Lagos", "Lagos"],              ["Asia/Dubai", "Dubai"],
    ["Asia/Kolkata", "Kolkata"],            ["Asia/Singapore", "Singapore"],
    ["Asia/Shanghai", "Shanghai"],          ["Asia/Tokyo", "Tokyo"],
    ["Australia/Sydney", "Sydney"],         ["Pacific/Auckland", "Auckland"]
  ];
  var DAYS = ["S", "M", "T", "W", "T", "F", "S"];

  function zoneName(id) {
    var z = ZONES.filter(function (x) { return x[0] === id; })[0];
    return z ? z[1] : id.split("/").pop().replace(/_/g, " ");
  }

  function inZone(id, opts) {
    var o = { hour: "numeric", minute: "2-digit" };
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    if (id !== "local") o.timeZone = id;
    try { return new Date().toLocaleString([], o); }
    catch (e) { return "—"; }
  }

  /** Hour offset of a zone relative to here, as "+5:30" / "same". */
  function offsetLabel(id) {
    if (id === "local") return "Here";
    try {
      var now = new Date();
      var here = new Date(now.toLocaleString("en-US"));
      var there = new Date(now.toLocaleString("en-US", { timeZone: id }));
      var diff = Math.round((there - here) / 60000);
      if (!diff) return "Same time";
      var sign = diff < 0 ? "−" : "+";
      var a = Math.abs(diff);
      return sign + Math.floor(a / 60) + (a % 60 ? ":" + pad2(a % 60) : "") + "h";
    } catch (e) { return ""; }
  }

  DS.apps.register({
    id: "clock",
    name: "Clock",
    icon: "clock",
    w: 620, h: 470, minW: 460, minH: 340,
    flush: true,

    mount: function (body, api) {
      var tab = (api.arg && api.arg.tab) || "world";
      var side = h("aside.app-side");
      var main = h("div.app-main.ck-main");
      body.appendChild(side);
      body.appendChild(main);

      var TABS = [
        { id: "world",     label: "World",     icon: "clock",  build: paneWorld },
        { id: "alarm",     label: "Alarms",    icon: "bell",   build: paneAlarms },
        { id: "stopwatch", label: "Stopwatch", icon: "refresh", build: paneStopwatch },
        { id: "timer",     label: "Timer",     icon: "power",  build: paneTimer }
      ];

      var localTimers = [];
      function every(ms, fn) {
        var i = setInterval(fn, ms);
        localTimers.push(i);
        return i;
      }
      function clearLocal() {
        localTimers.forEach(clearInterval);
        localTimers = [];
      }
      api.onClose = clearLocal;

      function render() {
        clearLocal();
        DS.clear(side);
        side.appendChild(h("div.side-label", { text: "Clock" }));
        TABS.forEach(function (t) {
          side.appendChild(h("div.side-item" + (t.id === tab ? ".on" : ""), {
            onclick: function () { tab = t.id; render(); }
          }, [
            h("span", { html: DS.icon(t.icon, 15), style: { display: "contents" } }),
            h("span", { text: t.label })
          ]));
        });

        DS.clear(main);
        var t = TABS.filter(function (x) { return x.id === tab; })[0];
        api.setTitle("Clock — " + t.label);
        t.build(main);
        DS.glass.dress(main);
      }

      /* ───────────── WORLD ───────────── */
      function paneWorld(host) {
        var zones = DS.store.get("clock.zones", ["local"]);

        var hero = h("div.ck-hero", {}, [
          h("div.ck-big"), h("div.ck-bigdate")
        ]);
        host.appendChild(hero);

        var list = h("div.ck-zones");
        host.appendChild(list);

        function paint() {
          hero.children[0].textContent = inZone("local", { second: "2-digit" });
          hero.children[1].textContent = new Date().toLocaleDateString([], {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
          });
          DS.qsa(".ck-zt", list).forEach(function (el) {
            el.textContent = inZone(el.dataset.zone);
          });
        }

        zones.forEach(function (z) {
          list.appendChild(h("div.ck-zone", {
            oncontextmenu: function (e) {
              e.preventDefault();
              if (z === "local") return;
              DS.ui.ctx(e.clientX, e.clientY, [
                { label: "Remove " + zoneName(z), icon: "trash", action: function () {
                    DS.store.set("clock.zones", zones.filter(function (x) { return x !== z; }));
                    render();
                  } }
              ]);
            }
          }, [
            h("div.ck-zc", {}, [
              h("b", { text: zoneName(z) }),
              h("i", { text: offsetLabel(z) })
            ]),
            h("div.ck-zt", { data: { zone: z }, text: inZone(z) })
          ]));
        });

        host.appendChild(h("button.g-btn", {
          html: DS.icon("plus", 14) + "<span>Add a city</span>",
          style: { "margin-top": "14px" },
          onclick: function (e) {
            var avail = ZONES.filter(function (z) { return zones.indexOf(z[0]) < 0; });
            if (!avail.length) {
              return DS.ui.toast({ icon: "info", title: "Every city is already listed" });
            }
            DS.ui.ctx(e.clientX, e.clientY, avail.map(function (z) {
              return {
                label: z[1], icon: "clock",
                action: function () {
                  DS.store.set("clock.zones", zones.concat([z[0]]));
                  render();
                }
              };
            }));
          }
        }));

        paint();
        every(1000, paint);
      }

      /* ───────────── ALARMS ───────────── */
      function paneAlarms(host) {
        var alarms = DS.store.get("clock.alarms", []);

        host.appendChild(h("h2.st-h", { text: "Alarms" }));
        host.appendChild(h("p.st-sub", {
          text: "These ring whether or not this window is open — the daemon " +
                "lives in the system, not in the app."
        }));

        var next = DS.alarms.next();
        host.appendChild(h("div.g-card.ck-next", {}, [
          h("span", { text: next ? "Next alarm" : "Nothing scheduled" }),
          h("b", {
            text: next
              ? pad2(next.alarm.h) + ":" + pad2(next.alarm.m) + "  " +
                DS.until(next.at - Date.now())
              : "—"
          })
        ]));

        /* new alarm */
        var timeIn = h("input.g-field", {
          type: "time", value: "07:30", style: { "max-width": "128px" }
        });
        var labelIn = h("input.g-field", { type: "text", placeholder: "Label (optional)" });
        var picked = [];
        var dayRow = h("div.ck-days");
        DAYS.forEach(function (d, i) {
          var b = h("button" + "", {
            text: d,
            onclick: function () {
              var at = picked.indexOf(i);
              if (at < 0) { picked.push(i); b.classList.add("on"); }
              else { picked.splice(at, 1); b.classList.remove("on"); }
            }
          });
          dayRow.appendChild(b);
        });

        host.appendChild(DS.ui.section("New alarm"));
        host.appendChild(h("div.ck-form", {}, [
          timeIn, labelIn,
          h("button.g-btn.g-btn-accent", {
            html: DS.icon("plus", 14) + "<span>Add</span>",
            onclick: function () {
              var parts = (timeIn.value || "07:30").split(":");
              alarms.push({
                id: DS.uid("al"),
                h: parseInt(parts[0], 10) || 0,
                m: parseInt(parts[1], 10) || 0,
                label: labelIn.value.trim(),
                on: true,
                days: picked.slice().sort(),
                lastFired: null
              });
              DS.store.set("clock.alarms", alarms);
              DS.chime.unlock();
              render();
            }
          })
        ]));
        host.appendChild(dayRow);
        host.appendChild(h("p.st-hint", {
          text: "No days selected means it rings once, then switches itself off."
        }));

        /* existing */
        host.appendChild(DS.ui.section(alarms.length ? "Set" : "None yet"));
        alarms.slice().sort(function (a, b) {
          return (a.h * 60 + a.m) - (b.h * 60 + b.m);
        }).forEach(function (a) {
          var sw = DS.ui.toggle(a.on, function (v) {
            a.on = v;
            if (v) a.lastFired = null;
            DS.store.set("clock.alarms", alarms);
          });
          host.appendChild(h("div.ck-alarm" + (a.on ? "" : ".off"), {}, [
            h("div.ck-at", { text: pad2(a.h) + ":" + pad2(a.m) }),
            h("div.ck-ac", {}, [
              h("b", { text: a.label || "Alarm" }),
              h("i", {
                text: a.days && a.days.length
                  ? a.days.map(function (d) { return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]; }).join(" ")
                  : "Once"
              })
            ]),
            sw,
            h("button.g-btn.g-btn-sq", {
              html: DS.icon("trash", 14), title: "Delete",
              onclick: function () {
                DS.store.set("clock.alarms", alarms.filter(function (x) { return x.id !== a.id; }));
                render();
              }
            })
          ]));
        });

        host.appendChild(h("button.g-btn", {
          html: DS.icon("bell", 14) + "<span>Test the sound</span>",
          style: { "margin-top": "16px" },
          onclick: function () { DS.chime.unlock(); DS.chime.alarm(); }
        }));
      }

      /* ───────────── STOPWATCH ───────────── */
      var sw = { base: 0, startedAt: 0, running: false, laps: [] };

      function paneStopwatch(host) {
        var read = h("div.ck-huge");
        var lapList = h("div.ck-laps");

        function value() {
          return sw.base + (sw.running ? Date.now() - sw.startedAt : 0);
        }
        function paint() {
          var ms = value();
          read.textContent = DS.hms(ms, true) + "." +
            String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
        }

        var go = h("button.g-btn.g-btn-accent.g-btn-lg", {
          text: sw.running ? "Stop" : "Start",
          onclick: function () {
            DS.chime.unlock();
            if (sw.running) { sw.base = value(); sw.running = false; }
            else { sw.startedAt = Date.now(); sw.running = true; }
            go.textContent = sw.running ? "Stop" : "Start";
            go.classList.toggle("g-btn-accent", !sw.running);
          }
        });

        host.appendChild(h("div.ck-swpane", {}, [
          read,
          h("div.ck-swbtns", {}, [
            h("button.g-btn.g-btn-lg", {
              text: "Lap",
              onclick: function () {
                if (!sw.running) return;
                sw.laps.unshift(value());
                DS.chime.tick();
                paintLaps();
              }
            }),
            go,
            h("button.g-btn.g-btn-lg", {
              text: "Reset",
              onclick: function () {
                sw.base = 0; sw.running = false; sw.laps = [];
                go.textContent = "Start";
                paint(); paintLaps();
              }
            })
          ]),
          lapList
        ]));

        function paintLaps() {
          DS.clear(lapList);
          sw.laps.forEach(function (t, i) {
            var prev = sw.laps[i + 1] || 0;
            lapList.appendChild(h("div.ck-lap", {}, [
              h("span", { text: "Lap " + (sw.laps.length - i) }),
              h("i", { text: "+" + DS.hms(t - prev) }),
              h("b", { text: DS.hms(t, true) })
            ]));
          });
        }

        paint();
        paintLaps();
        every(50, paint);
      }

      /* ───────────── TIMER ───────────── */
      var tm = { endsAt: 0, left: 0, running: false, total: 0 };

      function paneTimer(host) {
        var read = h("div.ck-huge");
        var ring = h("div.ck-ring", { html:
          '<svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="45"/>' +
          '<circle class="fg" cx="50" cy="50" r="45"/></svg>' });
        var fg = DS.qs(".fg", ring);
        var C = 2 * Math.PI * 45;
        fg.style.strokeDasharray = C;

        function left() {
          return tm.running ? Math.max(0, tm.endsAt - Date.now()) : tm.left;
        }
        function paint() {
          var ms = left();
          read.textContent = DS.hms(ms, ms >= 3600000);
          fg.style.strokeDashoffset = C * (1 - (tm.total ? ms / tm.total : 0));
          if (tm.running && ms <= 0) {
            tm.running = false;
            tm.left = 0;
            DS.chime.alarm();
            DS.ui.toast({ icon: "clock", title: "Timer finished",
                          body: DS.hms(tm.total) + " is up.", timeout: 10000 });
            go.textContent = "Start";
          }
        }

        var go = h("button.g-btn.g-btn-accent.g-btn-lg", {
          text: tm.running ? "Pause" : "Start",
          onclick: function () {
            DS.chime.unlock();
            if (!tm.total) return DS.ui.toast({ icon: "info", title: "Pick a duration first" });
            if (tm.running) { tm.left = left(); tm.running = false; }
            else { tm.endsAt = Date.now() + (tm.left || tm.total); tm.running = true; }
            go.textContent = tm.running ? "Pause" : "Start";
          }
        });

        var presets = h("div.ck-presets");
        [1, 3, 5, 10, 15, 25, 45, 60].forEach(function (m) {
          presets.appendChild(h("button.g-btn", {
            text: m + "m",
            onclick: function () {
              tm.total = m * 60000;
              tm.left = tm.total;
              tm.running = false;
              go.textContent = "Start";
              paint();
            }
          }));
        });

        host.appendChild(h("div.ck-swpane", {}, [
          h("div.ck-ringwrap", {}, [ring, read]),
          presets,
          h("div.ck-swbtns", {}, [
            go,
            h("button.g-btn.g-btn-lg", {
              text: "Reset",
              onclick: function () {
                tm.running = false;
                tm.left = tm.total;
                go.textContent = "Start";
                paint();
              }
            })
          ]),
          h("p.st-hint", {
            style: { "text-align": "center", "margin-top": "10px" },
            text: "The stopwatch and timer belong to this window. Alarms do not — " +
                  "those keep running with everything closed."
          })
        ]));

        paint();
        every(120, paint);
      }

      render();
      api.openTab = function (t) { tab = t; render(); };
    },

    onArg: function (api, arg) {
      if (arg && arg.tab && api.openTab) api.openTab(arg.tab);
    }
  });
})(window.DS);
