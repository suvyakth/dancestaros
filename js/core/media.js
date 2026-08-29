/* ═══════════════════════════════════════════════════════════════
   media.js — real files, stored in IndexedDB

   The rest of the OS keeps its state in one localStorage key. That
   is the wrong home for media: localStorage caps out around 5MB and
   only holds strings, so a single phone photo would blow the whole
   budget after base64 inflation.

   IndexedDB stores Blobs natively, has no practical per-item limit,
   and gets a quota measured in hundreds of MB to GBs. So:

     localStorage   settings, notes, the virtual file tree
     IndexedDB      the bytes of every imported or exported file

   A file in the virtual file system carries a `media` id instead of
   `content`. The tree stays small and JSON-serialisable; the bytes
   live next door.
   ═══════════════════════════════════════════════════════════════ */
(function (DS) {
  "use strict";

  var DB_NAME = "dancestar-media";
  var STORE = "files";
  var VERSION = 1;

  var dbPromise = null;
  var urlCache = {};        // id -> object URL, revoked on delete

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function kindOf(type, name) {
    var t = String(type || "");
    if (t.indexOf("image/") === 0) return "image";
    if (t.indexOf("audio/") === 0) return "audio";
    if (t.indexOf("video/") === 0) return "video";
    // some browsers hand over an empty type for odd containers
    if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name || "")) return "image";
    if (/\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(name || "")) return "audio";
    if (/\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(name || "")) return "video";
    return "file";
  }

  var HOME = {
    image: "/Users/you/Pictures",
    audio: "/Users/you/Music",
    video: "/Users/you/Movies",
    file: "/Users/you/Documents"
  };

  var media = {
    available: !!window.indexedDB,
    kindOf: kindOf,
    HOME: HOME,

    /** Store a Blob. Returns its id. */
    put: function (blob, meta) {
      var m = meta || {};
      var rec = {
        id: m.id || ("md-" + Date.now().toString(36) + "-" +
                     Math.floor(Math.random() * 1e6).toString(36)),
        name: m.name || "untitled",
        type: blob.type || m.type || "application/octet-stream",
        size: blob.size,
        added: Date.now(),
        blob: blob
      };
      return tx("readwrite", function (store) { store.put(rec); })
        .then(function () { return rec.id; });
    },

    /** The full record, blob included. */
    get: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { reject(req.error); };
        });
      });
    },

    blob: function (id) {
      return media.get(id).then(function (r) { return r ? r.blob : null; });
    },

    /** A cached object URL, so the same file is not re-blobbed per view. */
    url: function (id) {
      if (urlCache[id]) return Promise.resolve(urlCache[id]);
      return media.blob(id).then(function (b) {
        if (!b) return null;
        urlCache[id] = URL.createObjectURL(b);
        return urlCache[id];
      });
    },

    forget: function (id) {
      if (urlCache[id]) {
        URL.revokeObjectURL(urlCache[id]);
        delete urlCache[id];
      }
    },

    del: function (id) {
      media.forget(id);
      return tx("readwrite", function (store) { store.delete(id); });
    },

    list: function () {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var out = [];
          var req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
          req.onsuccess = function () {
            var c = req.result;
            if (!c) return resolve(out);
            var v = c.value;
            out.push({ id: v.id, name: v.name, type: v.type, size: v.size, added: v.added });
            c.continue();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    },

    /** { count, bytes } stored here, plus the browser's own estimate. */
    usage: function () {
      return media.list().then(function (items) {
        var bytes = items.reduce(function (s, i) { return s + (i.size || 0); }, 0);
        var base = { count: items.length, bytes: bytes, used: 0, quota: 0 };
        if (!navigator.storage || !navigator.storage.estimate) return base;
        return navigator.storage.estimate().then(function (e) {
          base.used = e.usage || 0;
          base.quota = e.quota || 0;
          return base;
        }, function () { return base; });
      });
    },

    /** Delete every blob no file in the tree points at any more. */
    sweep: function () {
      var live = {};
      DS.fs.walk("/", function (node) { if (node.media) live[node.media] = true; });
      return media.list().then(function (items) {
        var dead = items.filter(function (i) { return !live[i.id]; });
        return Promise.all(dead.map(function (d) { return media.del(d.id); }))
          .then(function () { return dead.length; });
      });
    },

    /* ── importing ──────────────────────────────────────────────
       Files land in the folder that matches their kind, and the
       folder is created if this profile predates it. */
    importFiles: function (files, destDir) {
      var list = Array.prototype.slice.call(files || []);
      if (!list.length) return Promise.resolve([]);
      if (!media.available) {
        DS.ui.toast({
          icon: "info", title: "Cannot import",
          body: "This browser has no IndexedDB, so there is nowhere to put the bytes."
        });
        return Promise.resolve([]);
      }

      return Promise.all(list.map(function (file) {
        var kind = kindOf(file.type, file.name);
        var dir = destDir || HOME[kind] || HOME.file;
        if (!DS.fs.exists(dir)) DS.fs.mkdir(dir);

        return media.put(file, { name: file.name, type: file.type })
          .then(function (id) {
            var name = DS.fs.freeName(dir, baseOf(file.name), extOf(file.name));
            var path = DS.fs.join(dir, name);
            DS.fs.writeMedia(path, id, kind, file.size, file.type);
            return { path: path, kind: kind, name: name, size: file.size };
          });
      })).then(function (made) {
        var byKind = {};
        made.forEach(function (m) { byKind[m.kind] = (byKind[m.kind] || 0) + 1; });
        var parts = Object.keys(byKind).map(function (k) {
          return byKind[k] + " " + k + (byKind[k] > 1 ? "s" : "");
        });
        var first = made[0];
        DS.ui.toast({
          icon: "save",
          title: "Imported " + made.length + " file" + (made.length > 1 ? "s" : ""),
          body: parts.join(", ") + " · " +
                DS.bytes(made.reduce(function (s, m) { return s + m.size; }, 0)),
          timeout: 8000,
          action: first ? {
            label: made.length > 1 ? "Show them" : "Open it",
            run: function () {
              if (made.length > 1) DS.wm.open("finder", { path: DS.fs.dirname(first.path) });
              else DS.openPath(first.path);
            }
          } : null
        });
        if (DS.shell && DS.shell.buildDesktopIcons) DS.shell.buildDesktopIcons();
        return made;
      }).catch(function (err) {
        DS.ui.toast({ icon: "info", title: "Import failed", body: String(err.message || err) });
        return [];
      });
    },

    /** Save something the OS generated (an export) into the tree. */
    save: function (blob, dirPath, filename, kind) {
      if (!DS.fs.exists(dirPath)) DS.fs.mkdir(dirPath);
      return media.put(blob, { name: filename, type: blob.type })
        .then(function (id) {
          var name = DS.fs.freeName(dirPath, baseOf(filename), extOf(filename));
          var path = DS.fs.join(dirPath, name);
          DS.fs.writeMedia(path, id, kind || kindOf(blob.type, filename), blob.size, blob.type);
          return path;
        });
    },

    /** Open the OS file picker. Returns a promise of the created paths. */
    pick: function (accept, destDir) {
      return new Promise(function (resolve) {
        var input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        if (accept) input.accept = accept;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.addEventListener("change", function () {
          media.importFiles(input.files, destDir).then(function (made) {
            if (input.parentNode) input.parentNode.removeChild(input);
            resolve(made);
          });
        });
        input.click();
      });
    },

    /** Hand a blob to the browser as a download. */
    download: function (blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    }
  };

  function baseOf(name) {
    var d = String(name).lastIndexOf(".");
    return d > 0 ? name.slice(0, d) : name;
  }
  function extOf(name) {
    var d = String(name).lastIndexOf(".");
    return d > 0 ? name.slice(d) : "";
  }
  media.baseOf = baseOf;
  media.extOf = extOf;

  DS.media = media;
})(window.DS);
