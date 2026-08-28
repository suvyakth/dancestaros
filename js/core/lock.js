/* ═══════════════════════════════════════════════════════════════
   lock.js — passcode

   BE CLEAR ABOUT WHAT THIS IS. Everything here runs in the page, and
   the whole OS lives in localStorage that the person at the keyboard
   can open DevTools and erase. A browser cannot keep a secret from
   its own user.

   So this is a *privacy screen*, not security: it stops someone
   glancing at your desktop or poking around your Settings. It is
   not protecting anything from someone who wants in.

   What it does do properly: the passcode is never stored. A random
   salt plus SHA-256 goes into localStorage, so the number itself is
   not sitting there in plain text for a shoulder-surfer to read.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var h = DS.h;

  /* one-shot session grants, cleared whenever the screen locks */
  var granted = {};

  function randomSalt() {
    var a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }

  /** SHA-256 where available; a weak fallback where it is not. */
  function digest(text) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
        .then(hex)
        .catch(function () { return weak(text); });
    }
    return Promise.resolve(weak(text));
  }

  function weak(text) {
    // Not a real hash. Only reached when subtle crypto is missing
    // (an insecure context), and the honest label above still applies.
    var a = 0x811c9dc5, b = 0x1000193;
    for (var i = 0; i < text.length; i++) {
      a ^= text.charCodeAt(i);
      a = (a * b) >>> 0;
    }
    return "w" + a.toString(16);
  }

  var lock = {
    isSet: function () { return !!DS.store.get("lock.hash", null); },

    length: function () { return DS.store.get("lock.len", 4); },

    set: function (pin) {
      var salt = randomSalt();
      return digest(salt + ":" + pin).then(function (hh) {
        DS.store.set("lock.salt", salt);
        DS.store.set("lock.hash", hh);
        DS.store.set("lock.len", pin.length);
        return true;
      });
    },

    verify: function (pin) {
      if (!lock.isSet()) return Promise.resolve(true);
      var salt = DS.store.get("lock.salt", "");
      return digest(salt + ":" + pin).then(function (hh) {
        return hh === DS.store.get("lock.hash", null);
      });
    },

    clear: function () {
      DS.store.set("lock.hash", null);
      DS.store.set("lock.salt", null);
      granted = {};
    },

    /** Should the greeting screen ask for the passcode? */
    requiredOnLock: function () {
      return lock.isSet() && DS.store.get("lock.onLock", true) !== false;
    },

    /** Does this app sit behind the passcode? */
    guards: function (appId) {
      return appId === "settings" &&
             lock.isSet() &&
             DS.store.get("lock.onSettings", false) === true;
    },

    isGranted: function (appId) { return !!granted[appId]; },
    grant: function (appId) { granted[appId] = true; },
    revokeAll: function () { granted = {}; },

    /* ───────────── the keypad ─────────────
       Shared by the greeting screen and the Settings challenge, so
       there is one implementation of entering a passcode. */
    pad: function (opts) {
      var o = opts || {};
      var len = o.length || lock.length();
      var value = "";

      var dots = h("div.pin-dots");
      var msg = h("div.pin-msg", { text: o.hint || "" });
      var grid = h("div.pin-grid");

      function paintDots() {
        DS.clear(dots);
        for (var i = 0; i < len; i++) {
          dots.appendChild(h("i" + (i < value.length ? ".on" : "")));
        }
      }

      function submit() {
        var v = value;
        value = "";
        paintDots();
        o.onSubmit(v, api);
      }

      function push(d) {
        if (value.length >= len) return;
        value += d;
        paintDots();
        if (o.onChange) o.onChange(value);
        if (value.length === len) setTimeout(submit, 90);
      }

      function back() {
        value = value.slice(0, -1);
        paintDots();
      }

      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"]
        .forEach(function (k) {
          if (k === "clear") {
            grid.appendChild(h("button.pin-key.pin-aux", {
              text: "Clear",
              onclick: function () { value = ""; paintDots(); }
            }));
          } else if (k === "back") {
            grid.appendChild(h("button.pin-key.pin-aux", {
              html: DS.icon("chevL", 16),
              onclick: back
            }));
          } else {
            grid.appendChild(h("button.pin-key", {
              text: k,
              onclick: function () { push(k); }
            }));
          }
        });

      var el = h("div.pin", { tabindex: "0" }, [dots, msg, grid]);

      function onKey(e) {
        if (/^[0-9]$/.test(e.key)) { push(e.key); e.preventDefault(); }
        else if (e.key === "Backspace") { back(); e.preventDefault(); }
        else if (e.key === "Enter" && value.length) { submit(); e.preventDefault(); }
      }
      function globalKey(e) {
        if (el.contains(e.target)) return;
        onKey(e);
      }

      var api = {
        el: el,
        reset: function () { value = ""; paintDots(); },
        say: function (text, bad) {
          msg.textContent = text;
          msg.classList.toggle("bad", !!bad);
        },
        shake: function () {
          el.classList.remove("shake");
          void el.offsetWidth;
          el.classList.add("shake");
        },
        // The global binding skips events that started inside the pad,
        // otherwise the element listener below would double-count them.
        bindKeys: function () { document.addEventListener("keydown", globalKey, true); },
        unbindKeys: function () { document.removeEventListener("keydown", globalKey, true); },
        setLength: function (n) { len = n; value = ""; paintDots(); }
      };

      // Local binding: no global listener to leak when a pane re-renders.
      el.addEventListener("keydown", onKey);

      paintDots();
      return api;
    },

    /** Modal passcode prompt. Resolves true when it matches. */
    challenge: function (opts) {
      var o = opts || {};
      return new Promise(function (resolve) {
        var tries = 0;
        var veil = h("div.dlg-veil");
        var panel = h("div.dlg.pin-dlg.g");

        var pad = lock.pad({
          hint: o.hint || "Enter your passcode",
          onSubmit: function (pin) {
            lock.verify(pin).then(function (ok) {
              if (ok) { done(true); return; }
              tries += 1;
              pad.shake();
              pad.say(tries >= 3 ? "Still not right. Passcodes are digits only."
                                 : "Incorrect passcode", true);
            });
          }
        });

        panel.appendChild(h("h3", { text: o.title || "Locked" }));
        if (o.body) panel.appendChild(h("p", { text: o.body }));
        panel.appendChild(pad.el);
        panel.appendChild(h("div.row", { style: { "margin-top": "16px" } }, [
          h("button.g-btn", { text: "Cancel", onclick: function () { done(false); } })
        ]));

        function done(v) {
          pad.unbindKeys();
          document.removeEventListener("keydown", onEsc, true);
          veil.style.transition = "opacity 160ms linear";
          veil.style.opacity = "0";
          setTimeout(function () {
            if (veil.parentNode) veil.parentNode.removeChild(veil);
          }, 170);
          resolve(v);
        }
        function onEsc(e) {
          if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); done(false); }
        }

        veil.appendChild(panel);
        DS.qs("#desktop").appendChild(veil);
        DS.glass.dress(panel);
        pad.bindKeys();
        document.addEventListener("keydown", onEsc, true);
      });
    },

    /** Gate used by the window manager. */
    open: function (appId) {
      if (!lock.guards(appId) || lock.isGranted(appId)) return Promise.resolve(true);
      return lock.challenge({
        title: "Settings is locked",
        body: "Enter your passcode to change system settings."
      }).then(function (ok) {
        if (ok) lock.grant(appId);
        return ok;
      });
    }
  };

  DS.lock = lock;
})(window.DS);
