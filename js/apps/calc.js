/* ═══════════════════════════════════════════════════════════════
   calc.js — calculator
   Chosen deliberately: a keypad is the hardest thing to render in
   glass, because 19 transparent buttons sitting on one transparent
   pane have almost no contrast to work with. The rims do the work.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  var KEYS = [
    ["AC", "fn"], ["+/-", "fn"], ["%", "fn"], ["/", "op"],
    ["7", "num"], ["8", "num"], ["9", "num"], ["*", "op"],
    ["4", "num"], ["5", "num"], ["6", "num"], ["-", "op"],
    ["1", "num"], ["2", "num"], ["3", "num"], ["+", "op"],
    ["0", "num wide"], [".", "num"], ["=", "eq"]
  ];

  var GLYPH = { "/": "÷", "*": "×", "-": "−", "+": "+", "=": "=", "+/-": "±" };

  DS.apps.register({
    id: "calc",
    name: "Calculator",
    icon: "calc",
    w: 300, h: 428, minW: 260, minH: 380,
    flush: true,

    mount: function (body, api) {
      var st = { acc: null, op: null, cur: "0", fresh: true };

      var readout = h("div.ca-readout", { text: "0" });
      var tape = h("div.ca-tape", { text: "" });
      var grid = h("div.ca-grid");
      body.appendChild(h("div.ca-pane", {}, [
        h("div.ca-screen", {}, [tape, readout]), grid
      ]));

      function show() {
        var v = st.cur;
        if (v.length > 12 && v.indexOf("e") < 0) {
          var n = parseFloat(v);
          v = Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-6 && n !== 0)
            ? n.toExponential(6)
            : String(parseFloat(n.toPrecision(12)));
        }
        readout.textContent = v;
        readout.style.fontSize = v.length > 11 ? "30px" : v.length > 8 ? "36px" : "44px";
        tape.textContent = st.op
          ? trim(st.acc) + " " + (GLYPH[st.op] || st.op)
          : "";
      }

      function trim(n) {
        return String(parseFloat(Number(n).toPrecision(12)));
      }

      function compute(a, op, b) {
        switch (op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? NaN : a / b;
          default: return b;
        }
      }

      function digit(d) {
        if (st.fresh) { st.cur = d === "." ? "0." : d; st.fresh = false; return; }
        if (d === "." && st.cur.indexOf(".") >= 0) return;
        if (st.cur === "0" && d !== ".") st.cur = d;
        else st.cur += d;
      }

      function press(key) {
        if (key === "AC") {
          st = { acc: null, op: null, cur: "0", fresh: true };
        } else if (key === "+/-") {
          st.cur = st.cur.charAt(0) === "-" ? st.cur.slice(1) : "-" + st.cur;
        } else if (key === "%") {
          st.cur = String(parseFloat(st.cur) / 100);
          st.fresh = false;
        } else if (key === "=") {
          if (st.op !== null) {
            var r = compute(parseFloat(st.acc), st.op, parseFloat(st.cur));
            st.cur = isNaN(r) ? "Error" : trim(r);
            st.acc = null;
            st.op = null;
            st.fresh = true;
          }
        } else if ("+-*/".indexOf(key) >= 0 && key.length === 1) {
          if (st.op !== null && !st.fresh) {
            var v = compute(parseFloat(st.acc), st.op, parseFloat(st.cur));
            st.acc = isNaN(v) ? "Error" : trim(v);
          } else {
            st.acc = st.cur;
          }
          st.op = key;
          st.fresh = true;
        } else {
          digit(key);
        }
        show();
      }

      KEYS.forEach(function (k) {
        var cls = "button.ca-key" + (k[1] ? "." + k[1].split(" ").join(".") : "");
        grid.appendChild(h(cls, {
          text: GLYPH[k[0]] || k[0],
          data: { key: k[0] },
          onclick: function () { press(k[0]); }
        }));
      });

      /* keyboard, active only while this window has focus */
      function onKey(e) {
        if (DS.wm.focused() !== api.win) return;
        var k = e.key;
        var map = {
          Enter: "=", "=": "=", Escape: "AC", c: "AC", C: "AC",
          Backspace: "back", "%": "%"
        };
        if (/^[0-9.]$/.test(k)) { press(k); flash(k); }
        else if ("+-*/".indexOf(k) >= 0 && k.length === 1) { press(k); flash(k); }
        else if (map[k] === "back") {
          st.cur = st.cur.length > 1 ? st.cur.slice(0, -1) : "0";
          if (st.cur === "0") st.fresh = true;
          show();
        } else if (map[k]) { press(map[k]); flash(map[k]); }
        else return;
        e.preventDefault();
      }
      function flash(key) {
        var btn = DS.qs('[data-key="' + key.replace(/"/g, "") + '"]', grid);
        if (!btn) return;
        btn.classList.add("hit");
        setTimeout(function () { btn.classList.remove("hit"); }, 110);
      }
      document.addEventListener("keydown", onKey);
      api.onClose = function () { document.removeEventListener("keydown", onKey); };

      show();
    }
  });
})(window.DS);
