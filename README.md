# Dancestar OS

A web operating system with **no opaque pixels**.

Every surface — windows, buttons, sliders, switches, checkboxes, menus, the dock,
the menu bar, scrollbars, notification cards, the calculator keypad — is built
from the same glass material. Nothing in the UI has a solid background. Windows
stacked over other windows refract each other.

No frameworks. No build step. No image files. Open `index.html` and it runs.

---

## Run it

```
# double-click index.html, or:
python -m http.server 8777
# → http://localhost:8777
```

Chromium-based browsers give the best result (they support `backdrop-filter`
referencing SVG filters, which enables true edge refraction). Firefox and Safari
fall back to the shadow-based rim, which still reads as glass.

---

## The glass material

`backdrop-filter: blur()` on its own does **not** look like glass. It looks like
frosted plastic. Glass here is five stacked optical layers, defined once in
`css/glass.css` and inherited by every control:

| # | Layer | Implemented with | Why it matters |
|---|-------|------------------|----------------|
| 1 | Body tint | `background` gradient at ~8.5% alpha | The pane itself. Asymmetric, so a light source is implied. |
| 2 | Backdrop | `backdrop-filter: blur() saturate() brightness()` | Light diffusing through. Saturation matters: glass *concentrates* colour. |
| 3 | **Dispersion** | `inset box-shadow`, cool top / warm bottom | Light splitting as it enters and leaves. **This is the layer everyone skips.** |
| 4 | Rim | `::before` + `mask-composite: exclude` | A masked gradient border. Reads as the physical thickness of the pane. |
| 5 | Sheen | `::after` + `--mx`/`--my` from JS | Specular highlight that slides under the cursor. |

Layer 3 is the whole argument of this project. Open **Settings › Glass** and drag
**Dispersion** to 0 — the glass visibly becomes plastic while every other
property stays identical. There is a **Make it plastic** button that kills
layers 3, 4 and 5 at once for a side-by-side comparison.

### Tuning it

Every optical property is a live CSS custom property, exposed three ways:

- **Settings › Glass** — eight sliders, with an explanation of each
- **Menu bar › the circle icon** — a quick control centre
- **Terminal** — `glass blur 45`, `glass disperse 0`, `glass refract off`

### True refraction

With refraction enabled, `js/core/glass.js` injects a `.g-edge` ring into every
large pane. That ring carries
`backdrop-filter: url(#ds-refract)` — an `feTurbulence` + `feDisplacementMap`
pair that physically displaces the pixels behind the rim, rather than faking the
effect with shadows. It is the single most expensive thing in the OS, so it is
toggleable and is skipped on surfaces too small to show it.

---

## Design problems that come with total transparency

These were the actual hard parts, and each has a specific fix in the code:

**Ten open windows become soup.** With nothing opaque there is no depth cue.
Fix: an unfocused window drops its tint from 8.5% to 5.5% and kills its sheen
entirely (`css/window.css`), so the focused pane always reads as nearest.

**Text can land on any colour.** A transparent surface inherits whatever is
behind it. Fix: `brightness()` in the backdrop filter to lift dark regions,
`text-shadow` on labels that sit directly over the wallpaper, and a tint floor
that never drops below ~7%.

**Stacked backdrop filters are slow.** Each one forces the compositor to
re-sample everything behind it; dragging a window across three panes means four
stacked blurs. Fix: the window manager adds `.perf-lite` to `<html>` during
drags and resizes, halving every blur radius and hiding the refraction bands
until release (`css/glass.css`, `DS.glass.lite`).

**Glass over a flat background is invisible.** Fix: the wallpaper is five
slowly drifting colour orbs over a faint 64px grid — saturated colour and
straight lines are what make refraction legible.

---

## Apps

| App | What it does |
|-----|--------------|
| **Finder** | Browses the virtual file system. Grid/list views, breadcrumbs, history, new/rename/duplicate/delete. |
| **Notes** | Editor over `/Users/you/Notes`. Autosaves into the shared file system. |
| **Terminal** | A 41-command shell with a built-in `tutorial`, tab completion, history, and `define` for inventing your own commands. |
| **Calculator** | 19 transparent buttons on one transparent pane — the hardest contrast problem in the project. |
| **Settings** | Appearance, Wallpaper studio, Glass, Looks, Widgets, Desktop, Storage. |
| **Music** | An ambient generator. No audio files: each track is a chord of Web Audio oscillators through a sweeping low-pass filter. The level meter is driven by a real `AnalyserNode`. |
| **Photos** | Image browser. The "images" are CSS gradients, which gives the glass viewer frame saturated colour to refract. |
| **Image Lab** | Non-destructive photo editing: nine adjustments, seven looks, rotate/flip, export. |
| **Audio Lab** | Waveform, five-band EQ, effects rack, trim, render to WAV. |
| **Video Lab** | Trim, colour grade, speed, frame grab, export to WebM. |
| **Clock** | World clocks, alarms, stopwatch, countdown timer. |
| **Focus** | Flowmodoro and Pomodoro over one shared engine. |
| **About** | Live frame rate, glass-surface count, and a breakdown of the five layers. |

The file system is shared, which is what makes this feel like an OS rather than
a page of unrelated widgets: write a note in **Notes**, then `cat` it in
**Terminal**, then rename it in **Finder**.

---

## Where media is stored

localStorage holds everything else in this OS, but it is the wrong home
for media: it caps out around 5MB and only holds strings, so one phone
photo would blow the entire budget after base64 inflation.

So there are two stores:

| Store | Holds |
|-------|-------|
| **localStorage** (`dancestar.os.v1`) | Settings, notes, the virtual file tree |
| **IndexedDB** (`dancestar-media`) | The actual bytes of every imported and exported file |

A file in the tree carries a `media` id instead of `content`. The tree
stays small and JSON-serialisable; the bytes live next door as a Blob,
with a quota in the hundreds of MB to GBs. Object URLs are cached per id
and revoked on delete, and Settings > Storage shows real usage against
the browser's estimate with a button to sweep blobs nothing points at any
more.

### Getting files in

- **Drag and drop** anywhere on the desktop
- **Import** in Finder, Photos, or any of the three labs
- `import` in the shell
- Ctrl+K > "Import files"

They are filed by kind: images to Pictures, audio to Music, video to
Movies. Everything else goes to Documents.

---

## The three labs

All three share one shape - library rail, stage, control panel - and one
principle: **the preview and the export run through the same code**.

**Image Lab** is non-destructive. The adjustments are a filter string
plus a transform, applied at draw time to an untouched source, so
nothing is baked in until you export. Canvas `ctx.filter` takes the same
syntax as the CSS `filter` property, so the live preview and the exported
pixels genuinely go through one path. The seeded gradient pictures get
rasterised into a canvas first so they are editable too.

**Audio Lab** decodes to an AudioBuffer, draws the waveform, and runs a
five-band EQ (80 / 250 / 1k / 4k / 10k) plus high-pass, low-pass, drive,
reverb and delay. `buildChain()` is called twice - once against the live
AudioContext for monitoring, once against an OfflineAudioContext for the
render - so what you hear is provably what you get. Drag across the
waveform to trim. Export is a hand-written 16-bit PCM WAV encoder, and
renders faster than real time because OfflineAudioContext is not bound to
the clock.

**Video Lab** previews with a CSS filter, which costs nothing. Export is
the honest version: every frame is drawn to a canvas with the identical
filter string, the canvas is captured with `captureStream()`, the
element's audio is routed through a `MediaStreamDestination`, and both
tracks go into a `MediaRecorder`. That means **export runs in real time** -
a 30-second clip takes 30 seconds. There is no way around that in a
browser without shipping a WASM encoder, and this project has no
dependencies. Frame grabs are instant and land in Pictures.

---

## Flowmodoro

Pomodoro forces work into 25-minute boxes. Flowmodoro does the opposite:
the timer counts **up** for as long as the work actually lasts, and the
break you have earned is that time divided by a ratio. At the default
1:5, fifty minutes of focus buys ten minutes off, clamped to a floor and
a ceiling so a two-minute session cannot earn a break and a four-hour one
cannot earn an hour.

Both modes live in `js/core/focus.js`, deliberately outside any window,
because the timer has to survive the Focus app being closed. The app and
the desktop widget are two subscribers to one clock, so they can never
disagree. Sessions are logged for a fortnight and drawn as a seven-day
chart.

Alarms work the same way: the daemon is in `js/core/time.js`, so they
ring with the Clock app closed. Every sound in the OS is synthesised
with oscillators - there are still no audio files anywhere in this
project.

---

## Widgets

Panes of glass that live on the desktop rather than in a window: no title
bar, draggable, positions remembered. Add them from the desktop
right-click menu, Settings > Widgets, or the launcher.

| Widget | Shows |
|--------|-------|
| **Clock** | Time, date, and the next alarm with a countdown. |
| **Calendar** | The current month, today marked. |
| **Focus** | A ring, the running time, and start/break - the Flowmodoro engine without the app. |
| **Sticky note** | A scrap of glass you can write on. |
| **System** | Frame rate, open windows, live count of glass surfaces, storage used. |
| **Now playing** | Whatever Music is doing, with a play button. |

Each one is a *view* onto state the system already owns, never a second
copy of it. The widget layer is pointer-transparent, so the desktop
underneath still takes clicks and context menus.

---

## Making it yours

| Where | What |
|-------|------|
| **Setup wizard** | Name, bead, theme, accent, glass preset - on first run, replayable any time. |
| **Appearance** | Five themes, accent hue, avatar bead. |
| **Wallpaper studio** | Build a background from scratch: base colour, five orb colours, size, softness, intensity, drift speed, grid. Randomise and Monochrome generators. |
| **Glass** | Eight optical sliders, five presets, true-refraction toggle. |
| **Looks** | Save theme + accent + all eight optics + wallpaper as one named set. Switch between them in a click. Export to JSON, import on another machine. |
| **Widgets** | Add, place, remove. |
| **Desktop** | Click-away behaviour, motion level, dock position/size/magnification/auto-hide, which apps appear in the dock. |

Everything is also reachable from the shell: `theme`, `accent`, `glass`,
`preset`.

### Window behaviour

Clicking away can tuck the active window out of the way - three settings
in Settings > Desktop:

- **Off** - windows stay where they are
- **Clicking the desktop** *(default)* - clicking empty space minimises the active window
- **Losing focus** - stricter: only one window is ever open at a time

Dialogs and anything that is a real surface are excluded, so only a click
on genuinely nothing counts as clicking away.

**Escape** does the same thing, and can be switched off separately. It is
bound on `window` rather than `document`, which matters: apps register
their Escape handlers on `document`, and bubble-phase document listeners
fire before bubble-phase window listeners. So the Photos viewer closes
itself and calls `preventDefault()` before the shell would otherwise
minimise the window out from under it. Menus, dialogs and the launcher
all get first refusal on the key too.

---

## Passcode

Settings > Lock sets a 4-8 digit passcode, with a glass keypad shared by
the greeting screen and the in-place challenge dialog.

| Setting | Effect |
|---------|--------|
| Ask on the greeting screen | The lock screen needs the code, not just a click |
| Ask before opening Settings | Once per unlocked session, then remembered |
| Auto-lock after idle | 5-60 minutes, or never |

`Ctrl+L` locks immediately. Locking drops every session grant, so a
guarded app asks again when you come back.

**Read this before trusting it.** This is a privacy screen, not
security. Everything runs in the page, and the whole OS lives in browser
storage that anyone at this keyboard can open DevTools and clear. It will
stop someone glancing at your desktop. It will not stop someone who wants
in, and no browser page can. The one thing it does do properly is never
store the passcode: a random salt plus SHA-256 goes into localStorage, so
the digits are not sitting there in plain text. The same warning is
printed in the Lock pane itself.

### Motion

**Full**, **Reduced** (short window animations, frozen wallpaper) or
**Off** (no transitions anywhere). `prefers-reduced-motion` is respected
independently.

---

## Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl K` | Launcher (apps, files, actions) |
| `Alt Tab` | Cycle windows |
| `Ctrl W` | Close window |
| `Ctrl M` | Minimise window |
| `Ctrl ,` | Settings |

Drag a window to the **top** edge to maximise, or a **side** edge to snap to half.
Double-click a title bar to maximise. Right-click the desktop, dock icons, files,
notes and photos for context menus.

---

## Structure

```
index.html          shell markup + the SVG optical filters
css/
  base.css          reset, design tokens, 5 themes, wallpaper, boot
  glass.css         THE GLASS SYSTEM — every control derives from here
  window.css        window chrome, traffic lights, snapping
  desktop.css       menu bar, dock (3 positions), launcher, menus, toasts
  apps.css          per-app styling
  timers.css        Clock and Focus, plus the studio controls
  labs.css          the three media editors, and drop-to-import
  widgets.css       desktop widgets
  setup.css         setup wizard and greeting screen
js/
  core/
    util.js         hyperscript + 50-icon line-art set, avatar presets
    store.js        persisted state (one localStorage key)
    glass.js        optical runtime: tokens, accent, presets, wallpaper,
                    refraction, sheen, dock geometry, perf mode
    fs.js           virtual file system (media-aware)
    lock.js         passcode hashing, the keypad, the challenge dialog
    media.js        IndexedDB blob store, import, export, quota
    time.js         synthesised chimes + the alarm daemon
    focus.js        the Flowmodoro / Pomodoro engine
    ui.js           menus, dialogs, toasts, glass control factories
    wm.js           app registry + window manager
    widgets.js      desktop widget system
  apps/*.js         one file per app; settings-panes.js adds the deep
                    customisation panes via DS.settingsPanes
  shell.js          menu bar, dock, launcher, shortcuts, file router
  setup.js          setup wizard + greeting screen
  boot.js           startup
```

Everything persists to a single `localStorage` key (`dancestar.os.v1`) — files,
notes, theme, optics, dock contents. **Settings › Storage** shows the usage and
can erase it.

## Adding an app

```js
DS.apps.register({
  id: "clock", name: "Clock", icon: "clock",
  w: 320, h: 320,
  mount: function (body, api) {
    body.appendChild(DS.h("div.g-card", { text: "hello" }));
  }
});
```

Add the file to `index.html` and the id to `dockApps` in `js/core/store.js`.
It inherits the entire glass material for free.

## Adding a widget

```js
DS.widgets.TYPES.ping = {
  label: "Ping", icon: "wifi", desc: "Shows a number.",
  w: 200, h: 100,
  build: function (el, api) { el.appendChild(DS.h("div.wg-time", { text: "0" })); },
  tick:  function (el) { el.children[0].textContent = Math.round(Math.random() * 99); }
};
```

`tick` runs once a second for every mounted widget. Add a `destroy` if
you hold a subscription or an animation frame.

## Adding a settings pane

```js
DS.settingsPanes.push({
  id: "mine", label: "Mine", icon: "star", after: "desktop",
  build: function (host, ctx) { host.appendChild(DS.h("h2.st-h", { text: "Mine" })); }
});
```

---

Built for the Hack Club webOS challenge.
