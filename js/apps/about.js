/* ═══════════════════════════════════════════════════════════════
   about.js — system information, and a live diagram of the five
   optical layers that make up every surface in the OS
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var LAYERS = [
    { n: 1, name: "Body tint",  css: "background",       why: "The pane itself. Asymmetric gradient implies a light source." },
    { n: 2, name: "Backdrop",   css: "backdrop-filter",  why: "Blur, saturate and brightness — light diffusing through." },
    { n: 3, name: "Dispersion", css: "inset box-shadow", why: "Cool at the top edge, warm at the base. Skipping this is why most glass UIs look like plastic." },
    { n: 4, name: "Rim",        css: "::before + mask",  why: "A masked gradient border. Reads as the physical thickness of the pane." },
    { n: 5, name: "Sheen",      css: "::after + --mx",   why: "Specular highlight that follows the cursor." }
  ];

  DS.apps.register({
    id: "about",
    name: "About",
    icon: "about",
    w: 560, h: 580, minW: 420, minH: 380,

    mount: function (body, api) {
      /* ── header ── */
      body.appendChild(h("div.ab-head", {}, [
        h("div.ab-mark", { html:
          '<svg viewBox="0 0 64 64" width="58" height="58" fill="none" ' +
          'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' +
          '<path d="M32 4 L57 32 L32 60 L7 32 Z"/>' +
          '<path d="M32 15 L46 32 L32 49 L18 32 Z" opacity=".65"/>' +
          '<path d="M32 26 L38 32 L32 38 L26 32 Z" fill="currentColor" opacity=".5"/></svg>'
        }),
        h("div", {}, [
          h("div.ab-name", {}, [h("span", { text: "Dancestar" }), h("b", { text: "OS" })]),
          h("div.ab-ver", { text: "Version 1.0 — First Light" }),
          h("div.ab-tag", { text: "A web operating system with no opaque pixels." })
        ])
      ]));

      /* ── live stats ── */
      var fpsEl = h("b", { text: "—" });
      var winEl = h("b", { text: "0" });
      var paneEl = h("b", { text: "0" });

      var stats = h("div.ab-stats", {}, [
        h("div.g-card.ab-stat", {}, [h("span", { text: "Frame rate" }), fpsEl]),
        h("div.g-card.ab-stat", {}, [h("span", { text: "Open windows" }), winEl]),
        h("div.g-card.ab-stat", {}, [h("span", { text: "Glass surfaces" }), paneEl])
      ]);
      body.appendChild(stats);

      var frames = 0, last = performance.now(), raf = null;
      (function tick(now) {
        frames += 1;
        if (now - last >= 1000) {
          fpsEl.textContent = Math.round((frames * 1000) / (now - last)) + " fps";
          frames = 0;
          last = now;
          winEl.textContent = String(DS.wm.list().length);
          paneEl.textContent = String(DS.qsa(".g, .g-btn, .dk, .di-glyph").length);
        }
        raf = requestAnimationFrame(tick);
      })(performance.now());

      /* ── the five layers ── */
      body.appendChild(DS.ui.section("How a surface is built"));
      var stack = h("div.ab-layers");
      LAYERS.forEach(function (l) {
        stack.appendChild(h("div.ab-layer", {}, [
          h("span.ab-num", { text: String(l.n) }),
          h("div", {}, [
            h("div.ab-lname", {}, [
              h("b", { text: l.name }),
              h("code", { text: l.css })
            ]),
            h("div.ab-lwhy", { text: l.why })
          ])
        ]));
      });
      body.appendChild(stack);

      /* ── system table ── */
      body.appendChild(DS.ui.section("System"));
      var g = DS.store.get("glass");
      [
        ["User", DS.store.get("user", "you")],
        ["Theme", DS.store.get("theme")],
        ["Apps installed", DS.apps.all().length],
        ["Blur radius", g.blur + "px"],
        ["Pane tint", (g.alpha / 100).toFixed(3) + " alpha"],
        ["Dispersion", (g.disperse / 100).toFixed(2)],
        ["True refraction", DS.store.get("refraction") ? "enabled" : "disabled"],
        ["Frameworks", "none"],
        ["Build step", "none"],
        ["Opaque surfaces", "0"]
      ].forEach(function (r) {
        body.appendChild(h("div.st-kv", {}, [
          h("span", { text: r[0] }),
          h("b", { text: String(r[1]) })
        ]));
      });

      body.appendChild(h("div.ab-foot", {}, [
        h("p", {
          text: "Built for the Hack Club webOS challenge. Vanilla HTML, CSS and " +
                "JavaScript — no libraries, no bundler, no images."
        }),
        h("div", { style: { display: "flex", gap: "8px", "margin-top": "12px" } }, [
          h("button.g-btn", {
            html: DS.icon("sliders", 14) + "<span>Tune the glass</span>",
            onclick: function () { DS.wm.open("settings", { pane: "glass" }); }
          }),
          h("button.g-btn", {
            html: DS.icon("terminal", 14) + "<span>neofetch</span>",
            onclick: function () { DS.wm.open("terminal"); }
          })
        ])
      ]));

      api.onClose = function () { if (raf) cancelAnimationFrame(raf); };
    }
  });
})(window.DS);
