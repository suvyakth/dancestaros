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
| **Terminal** | A real shell: `ls cd cat tree mkdir touch write rm mv open apps theme glass echo neofetch`. Tab completion and history. |
| **Calculator** | 19 transparent buttons on one transparent pane — the hardest contrast problem in the project. |
| **Settings** | Appearance, Glass (the live optics), Desktop, Storage. |
| **Music** | An ambient generator. No audio files: each track is a chord of Web Audio oscillators through a sweeping low-pass filter. The level meter is driven by a real `AnalyserNode`. |
| **Photos** | Image browser. The "images" are CSS gradients, which gives the glass viewer frame saturated colour to refract. |
| **About** | Live frame rate, glass-surface count, and a breakdown of the five layers. |

The file system is shared, which is what makes this feel like an OS rather than
a page of unrelated widgets: write a note in **Notes**, then `cat` it in
**Terminal**, then rename it in **Finder**.

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
  desktop.css       menu bar, dock, launcher, menus, notifications
  apps.css          per-app styling
js/
  core/
    util.js         hyperscript + 50-icon line-art set
    store.js        persisted state (one localStorage key)
    glass.js        optical runtime: tokens, refraction, sheen, perf mode
    fs.js           virtual file system
    ui.js           menus, dialogs, toasts, glass control factories
    wm.js           app registry + window manager
  apps/*.js         one file per app
  shell.js          menu bar, dock, launcher, shortcuts, file router
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

---

Built for the Hack Club webOS challenge.
