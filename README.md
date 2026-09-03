# Dancestar OS

A web operating system with **no opaque pixels**.

Every surface — windows, buttons, sliders, switches, checkboxes, menus, the dock,
the menu bar, scrollbars, notification cards, the calculator keypad — is built
from the same glass material. Nothing in the UI has a solid background. Windows
stacked over other windows refract each other.

No frameworks. No build step. No image files. Open `index.html` and it runs.

**Version 1.5 — Second Light** · MIT licensed · zero dependencies

---

## Run it

**[Live → suvyakth.github.io/dancestaros](https://suvyakth.github.io/dancestaros/)**

No sign-up, no passcode, nothing to install. It runs entirely in your browser
and everything it saves stays in your own `localStorage`.

Or locally:

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

### One customisation, everywhere

Setting the corner radius to 0 used to leave the dock, the clock
buttons and every pill still rounded, which made the control pointless.
Every radius in the OS now derives from `--g-radius`, including the
ones that would otherwise be hard-coded:

```css
--r-pill:  min(999px, calc(var(--g-radius) * 45));
--r-round: min(50%,   calc(var(--g-radius) * 3));
```

Set the radius to 0 and pills become rectangles and circles become
squares, system-wide. There are zero hard-coded `border-radius` values
left in the stylesheets.

### Dark glass

`obsidian` is not a dark theme — it is dark *glass*. The pane's own
tint flips to near-black and its density goes up, so light is absorbed
passing through rather than added. The rims stay bright, because that
is where light still catches. Themes get a `--g-alpha-mul` so smoked
glass can be dense without moving your own Tint slider.

### Beyond the five layers

Five layers get you glass. These four are what stop it reading as a
stack of independent frosted rectangles:

**One light for the whole desktop.** `DS.glass.relight()` writes each
pane's offset to a single shared light source, so a window on the left
of the screen is lit on its right edge and one on the right is lit on
its left. The rims disagree with each other in exactly the way real rims
would. Move the light in Settings > Glass, or let it drift and watch
every rim in the system breathe together.

**Surface finish.** Real glass is rarely flat. Six finishes — smooth,
reeded, fluted, cathedral, bubbled, frosted — add relief to every pane,
and where the browser supports a filter reference inside
`backdrop-filter`, actually displace what shows through. Reeded is the
one to try first; it looks nothing like any desktop you have used.

**Stacked depth.** A window buried three deep is being seen through more
glass, so it diffuses more and holds less colour. The window manager
writes each pane's stack index and the CSS scales blur and saturation
off it — which doubles as the depth cue that total transparency
otherwise throws away.

**Caustics and shatter.** Light that passes through a pane lands
somewhere: the focused window throws a tinted pool beneath itself. And
closing a pane of glass breaks it — shards are flung from the window's
own footprint, each carrying a slice of the same backdrop blur.

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
| **Search** | Indexes every file name and body, note, event, app, action and setting on the machine. |
| **Glass Forge** | Falling-sand toy where the glass you make is really transparent. |
| **Calendar** | Month, week and agenda views, reminders, .ics import and export. |
| **Clock** | World clocks, alarms, stopwatch, countdown timer. |
| **Focus** | Flowmodoro and Pomodoro over one shared engine. |
| **Games** | Seven small games on one shared harness, with achievements and unlockable looks — Serpent, Fuse, Mines, Facets, Prism, Echo and Flit. |
| **About** | Live frame rate, glass-surface count, and a breakdown of the five layers. |
| **Bug Reporter** | Writes a report that already knows the state of the machine, and keeps every one you file as Markdown in Documents. |

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

## Games

Seven games, one window. They are separate because a dock with seven
game icons in it is a worse dock, and together because they share a
harness worth sharing.

| Game | | |
|------|---|---|
| **Serpent** | Arcade | Snake, drawn as one stroked polyline through the cell centres — the head is lerped out of its old cell and the tail into its new one across each tick, so it glides instead of stepping. |
| **Fuse** | Puzzle | 2048. The tiles are DOM, not canvas, so each one gets a real `backdrop-filter` and the wallpaper bends through all sixteen. |
| **Mines** | Logic | Minesweeper, with the two rules that make it a game rather than a coin toss: mines are laid *after* the first click, around it, and a satisfied number can be chorded. |
| **Facets** | Memory | Twelve pairs behind panes that turn over in real 3D. One hue per pair, so the state of the board is readable without counting. |
| **Prism** | Arcade | Breakout. The bricks are a band of the spectrum and shatter into falling shards; where the bead lands across the lens sets the angle it leaves at. |
| **Echo** | Memory | Simon on four panes of coloured glass. The four tones are a pentatonic set, so every sequence is a tune — which turns out to be a real memory aid. |
| **Flit** | Arcade | Flappy Bird, where the obstacles are panes of glass and the bird is a bead of light that leaves a trail. The opening gate of every run is dead centre — being dealt a corner gap before you have felt the weight of the thing is a coin toss, not difficulty. |

Best scores live under one key (`games.best`), and a game declares which
direction is an improvement: Serpent counts up, Mines and Facets count
down. Mines files a time only when you win.

### Progression

The shelf has three tabs: **Games**, **Achievements** and **Scores**.

Every game keeps its own tallies — beads eaten, panes broken, fields
cleared — and both of the things you can earn are thresholds on those
same counters:

- **39 achievements.** Bronze, silver and gold. Because an achievement
  is `key >= at` rather than a callback, the wall can draw a real
  progress bar for each one (`0 / 100 beads`) without any game
  reporting progress, and re-evaluating the whole list is just
  comparisons — so it can run on every counter change.
- **51 unlockable looks.** Serpent's bead becomes an orange, a plum, a
  star fruit or a prism; its body becomes a worm, neon, glass or ember.
  Fuse gets four more palettes, Mines new flags and mines, Facets four
  face sets, Prism new spectra and beads, Echo new tunings and pane
  colours, Flit new beads and panes. Each is one line of data and no
  branch in the draw code.

A look is chosen in the **locker** — the palette button in the score
bar — which is a sheet over the stage rather than a screen of its own,
so the board stays visible behind it and the change lands on the very
next frame with no restart.

Unlocks announce themselves as notifications that take you to the right
place, and a finished run lists what it earned on the end card.

```js
DS.awards.stat("snake", "beads");      // a counter went up
DS.awards.check();                     // anything newly true is banked
DS.awards.skin("snake", "fruit");      // the look to draw with
```

`DS.awards.settle()` runs at boot to bank whatever an existing save has
already qualified for *without* firing a notification for each — a save
from before this existed would otherwise arrive as a wall of toasts.

### The harness

A game is not an app. It gets a stage and a host object, and never
touches the window, the score bar or teardown:

```js
DS.games.register({
  id: "pong", name: "Pong", tag: "Arcade",
  blurb: "Two paddles.", keys: "W/S and Up/Down",
  play: function (stage, g) {
    var cv = g.canvas();            // fits its box, at the right DPR
    g.key(function (e) { ... });    // only while this window has focus
    g.loop(function (dt) { ... });  // pauses itself when it does not
    g.bump(1);                      // score
    g.stat("rallies");              // a counter, for awards and unlocks
    g.skin("paddle");               // the look to draw with, read live
    g.over({ title: "Done" });      // end card, best score, play again
  }
});
```

Everything the host hands out is revocable — `after`, `every`, `loop`,
`key`, `swipe`, `on`, `canvas` — and all of it is torn down when the
game is left or the window is closed. Games are the one place a stray
rAF loop really shows: it would go on running against a dead DOM
forever. Registering a game also registers a `game:<id>` action, so
every one of them is searchable, bindable to a key, and reachable from
`do` in the Terminal, and declaring `skins:` / `awards:` on it registers
its unlockables and achievements with `DS.awards`.


## Widgets

Clicking a widget opens its full app; drag still moves it.

### The flicker, and what it was

Widgets flickered once a second, worst on the ones showing live
numbers. The cause was not the values changing — it was **writing them
when they had not**. Every tick reassigned `textContent` whether or not
the text differed, and because a widget sits behind a
`backdrop-filter`, dirtying anything inside it makes the compositor
re-sample the entire blurred backdrop. Once a second, on every widget
at once.

Three fixes: never write text that already says what it should; keep
the FPS counter out of the DOM entirely; and stop injecting a *nested*
backdrop-filter (the refraction band) into panes that small, which was
making the compositor re-sample twice. The clock widget now touches the
DOM twice a minute instead of sixty times.



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

### The dock

Right-click it — anywhere on it, or on any icon — for position, size,
magnification, auto-hide and step-aside-when-maximised, all where the
dock actually is. Any app not currently in the dock is listed there
too, so the same menu is how you put things in it.

Auto-hide has three states rather than two. A binary show/hide at a
fixed threshold read as a switch being flipped, so the dock now
measures how far the pointer is from its edge: parked, **leaning up to
meet you** from about 96px, then fully out at 26px. It holds itself
open while hovered and waits 420ms after you leave, so it can never
slide out from under a click already on its way. The icons arrive in
sequence, and it drops its backdrop-filter entirely while parked —
blurring pixels nobody can see is pure cost.

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

## Accounts

Each account owns a complete, separate snapshot of the system: files,
notes, widgets, glass, shortcuts, passcode. Switching parks yours and
wakes theirs.

That fell out of the storage design rather than being bolted on. The
whole OS state was already one localStorage key, so an account is just
a copy of that key:

```
dancestar.users.v1     the roster, and who is signed in
dancestar.os.v1        the ACTIVE user's state
dancestar.user.<id>    every other user's parked snapshot
```

Nothing else in the codebase had to learn about accounts. Apps, files,
settings and widgets still talk to one store. Switch from the greeting
screen or Settings > Users.

Same honesty as the passcode: separate, not private. Every snapshot
sits in the same browser storage.

### Passcode attempt limit

Five wrong tries starts a 30-second cooling-off, then a minute, then
five. The screen cracks on each failure, the keypad freezes and counts
the wait down in place, and the correct passcode is refused until it
expires.

The *count* stays in memory — a reload clearing it is fine, because
five more guesses is not the attack worth worrying about. The *active
wait* is written down, so pressing reload does not skip a cooling-off
period already running. Someone who clears storage still gets past it,
which is the same limit every other client-side lock has.

---

## Actions and custom shortcuts

Every invocable thing in the system is a named action in one registry:
each app, theme, glass preset, finish and widget, plus the system verbs.
The launcher, the shortcut binder and the shell's `do` command are three
front ends onto that same list, so they cannot drift apart. Adding an
action makes it searchable, bindable and scriptable at once.

**Settings > Shortcuts** binds any key combination to any of them. Click
the combo box, press the keys, pick the action. Combos are normalised
(`Ctrl+Shift+K`), Meta folds into Ctrl so a shortcut recorded on a Mac
still fires on Windows, and the recorder warns before you shadow
something the system already owns. Shortcuts do not fire while you are
typing, unless the combination uses Ctrl or Alt.

From the shell: `do` lists every action id, `do <id>` runs one, `keys`
prints your bindings.

---

## Calendar and Google

Month, week and agenda views over one event list, with colours, notes
and reminders that ride the same daemon as the alarms — so they fire
with the app closed.

**On Google Calendar specifically.** A static page cannot do a real
Google sync. OAuth needs a client secret and a redirect the browser
cannot keep, and Google's iCal endpoints send no CORS headers, so
fetching one from a page is blocked before it starts. Rather than ship a
"Connect" button that never works, the Calendar does the part that
genuinely does:

| | |
|---|---|
| **Import** | Drop or pick the `.ics` Google exports — the whole calendar lands here |
| **Export** | Writes an `.ics` that Google, Apple and Outlook all accept |
| **From a URL** | Tries anyway, and says plainly when CORS refuses |

That is real interoperability in both directions. It is just not live
sync, and claiming otherwise would be the actual bug.

---

## The tutorial

**Help > Take the guided tour**, `tour` in the shell, or Ctrl+K. Twelve
steps that spotlight the real element being described — a hole cut out
of a dimming layer with one enormous `box-shadow` spread, which unlike
a mask animates smoothly, so the light travels across the desktop
rather than blinking between places. Steps open whatever they are about
to talk about, and the spotlight re-measures every 500ms so it stays on
target as windows settle.

Some steps **perform** the thing instead of describing it. "Drag
Dispersion to 0" is a sentence; the *Show me* button opens the pane,
animates the slider to zero, holds while you look at flat plastic, then
puts it back. Same for sweeping the light across every rim, cycling the
finishes, and breaking a window.

### Notifications go somewhere

A card that tells you to do something now carries the way to do it.
`DS.ui.toast({ action: { label, run } })` turns the whole card into the
route, with a separate dismiss so acting and closing never get
confused, and it stops counting down while the pointer is on it.

An import offers to show you the files. An export offers to open what
it just made. An alarm opens the Clock, a reminder opens the Calendar,
a finished focus block opens Focus. The welcome-back hint runs the demo
it is describing.

---

## On a phone

A desktop metaphor on a 390px screen is not a smaller desktop, it is a
different machine. Floating windows dragged by a 38px title bar, a dock that
magnifies under a cursor, tooltips on hover, and right-click as the way into
half the features — none of that survives being touched with a thumb. So the
shape of the machine is classified at startup and on every resize, written onto
`<html>` as `data-form`, `data-orient`, `data-touch` and `data-short`, and both
CSS and behaviour key off it.

| | |
|---|---|
| **Windows** | Below 680px they stop floating and fill the frame between the menu bar and the dock. No cascade, no drag, no resize grips, no maximise button — it is already maximised — and the dock becomes the app switcher. Widen the window past 680 and every open app floats again at the size it originally asked for. |
| **Menu bar** | App, View and Help fold into one `⋯` menu that scrolls. The clock loses its weekday, the globe loses its language tag. |
| **Sidebars** | The 186px column in Settings, Clock and the Bug Reporter turns on its side into a scrolling strip of tabs. The three labs get a bottom sheet instead, because their panel holds controls rather than tabs. |
| **Dock** | Full width, scrolling sideways, always visible. A side dock has nowhere to go on a phone, so it comes back to the bottom. |
| **Widgets** | They stop being placed and become a column. The stored x/y is left untouched, so going back to a big screen puts every widget back exactly where it was. |
| **Notches** | `viewport-fit=cover` plus `env(safe-area-inset-*)` on the menu bar, the dock and the beetle. |

**Right-click, without a right button.** Rather than build a second set of menus
for touch, a long press (520ms, less than 12px of drift) synthesises a real
`contextmenu` event at the finger. Every menu already in the system therefore
works on a phone unmodified — including ones added later — and the click that
arrives on release is swallowed in the capture phase, or it would land on the
menu that just appeared under the finger and pick its first row.

**Two things that were quietly broken on touch before this**, independent of
screen size:

- Pointer-event drags need `touch-action: none` on the element or the browser
  keeps the gesture for panning. Without it a window could not be dragged by a
  finger at all — on any size of touchscreen.
- A notification pauses its countdown while the pointer is over it. A finger
  fires `pointerenter` and then, often, never `pointerleave`, so a tapped
  notification hung on screen for good. Pausing is now a hover-only behaviour.

Hover states that latch after a tap are dropped under `@media (hover: none)`,
and `@media (pointer: coarse)` grows the traffic lights, menu rows and title
bars to sizes a thumb can actually hit. **Settings › Zoom** reports what the
screen was classified as and lets the tiling be forced on or off.

`100dvh` rather than `100vh`: on a phone `100vh` counts the space behind the
browser's own chrome, which would put the dock below the fold.

---

## Zoom

Two zooms, kept separate because they answer different questions.

**System zoom** scales the entire shell — menu bar, dock, windows, widgets,
menus — from 60% to 200%. The desktop keeps its proportions and simply stops
being small. `Ctrl+Alt` with `+`, `-` or `0`, `Ctrl`+wheel, the slider in
**Settings › Zoom**, or the readout that appears in the menu bar whenever you
are not at 100% (click it for actual size). The wallpaper deliberately stays
out of it: five drifting orbs have no detail to resolve, so scaling them
would cost GPU time to change nothing.

**Window zoom** scales one window's contents and nothing else. `Ctrl+Shift`
with `+`, `-` or `0`. It is stored against the app rather than the window, so
Notes at 140% reopens at 140%, and a dot appears in that window's title bar.

`Ctrl` with `+` or `-` on its own belongs to the browser, which does not give
it up — so the OS never asks for it, and browser zoom still stacks on top of
both of these.

### Why `zoom` and not `transform`

The obvious way to scale a page is `transform: scale()`. It is the wrong tool
here, for a reason specific to this project: **a transform on an ancestor
creates a backdrop root, and every `backdrop-filter` underneath it stops
sampling the wallpaper.** That would take the glass out of a glass operating
system. CSS `zoom` affects layout instead, so the desktop's box shrinks by
exactly the factor it is painted up by, still measures one viewport, and every
pane keeps refracting what is behind it.

The cost is arithmetic. Pointer events arrive in viewport pixels while
`style.left` is written in zoomed ones, so every conversion between the two
divides by the factor: window dragging and resizing, snap regions, widget
dragging, menu placement, the specular sheen, the crack and shatter effects,
the tour spotlight and the dock's proximity detection. `DS.zoom.x()`,
`.d()`, `.vw()`, `.rect()` and `.of()` do that in one place, and all of them
return the identity at 100% — which is what keeps the feature from disturbing
code that never asked about it.

Firefox only grew a spec-compliant `zoom` in 126. Where it is missing the
factor is pinned at 1 and the pane says so plainly, rather than half-applying
a scale and leaving the pointer maths lying.

---

## Language

Seven languages: English, Español, Français, Deutsch, हिन्दी, 日本語 and العربية.
Switch from the globe in the menu bar, the system menu, **Settings › Language**,
the launcher, `lang <code>` in the shell — or on the first-run wizard's welcome
card, which is the right place for it since everything after that is read.

### How it works, and what that costs

This OS was written in English and every string in it is a literal sitting in
the middle of the code that draws it. Rather than tear twelve thousand lines
apart to hang a key on each one, **the English string is the key**: `i18n.js`
walks the DOM, swaps the phrases it recognises, and a `MutationObserver`
catches whatever the apps draw next — so a menu built three clicks from now
arrives already translated. The original English is kept beside every node it
touches, so switching language re-translates from the source instead of
translating a translation.

That buys full coverage of the interface chrome for one file of phrases, and
it has one honest consequence: **coverage is partial by design.** A phrase
missing from the book stays English. So the Language pane counts what it has
actually seen and could not translate, lists those phrases, and lets you type
the translations in — merged over the built-in book and remembered. There is
no pretending.

Two places are deliberately excluded. Shell output carries `data-noi18n`,
because translating `Desktop` to `Escritorio` inside an `ls` listing would
break the path it just printed; and anything with a digit in it is never
offered as a gap to fill, because clocks, dates and counters pass through
every second and are never the same string twice.

### Dates, times and direction

Every clock in this OS was already written `toLocaleTimeString([], …)` — an
empty locale list, meaning "whatever the browser is set to". Those three
methods are wrapped once at startup so an empty list means *the chosen*
locale, and so a 12/24-hour preference can be forced through everywhere at
once. Wrapping beat editing twenty call sites, and it keeps working for call
sites written after it. There is also a locale override (`en-GB`, `de-AT`,
`hi-IN`) and a first-day-of-the-week switch the Calendar reads.

Arabic sets `dir="rtl"` on the root, because that is how the script works, not
a preference. The structural rows — menu bar, dock, title bars, sidebars — are
pinned back to `ltr` so you get correctly-rendered Arabic in a layout you still
recognise, and **Mirror the whole interface** switches those exceptions off for
anyone who wants the real thing. Keys, paths and numbers stay left-to-right in
every language.

---

## The bug in the corner

A bead of glass shaped like a beetle sits at the bottom right of the desktop —
same backdrop, same rim, same dispersion at its edges as any other pane. It
breathes slowly. Click it and the Bug Reporter opens.

The point of it is that it is already listening. Anything unhandled that
reaches `window` — a thrown error, a rejected promise, a resource that failed
to load — is caught, deduplicated (the same error forty times reads as one line
with a count), and counted on the beetle's back, which stops breathing and
starts twitching. So the moment something goes wrong, the way to say so is
already glowing at you instead of needing to be found. The first error also
raises one notification with a **Report it** button on it; after that the count
is enough, because a stream of toasts about a broken thing is its own broken
thing.

A report asks for a title, what happened, steps, and how bad it is. What it
does *not* ask for is everything a report normally has to drag out of you:
theme, finish, refraction state, every optical value, zoom, language,
viewport, which window was in front, what else was open, storage used, the
user agent, and the errors themselves. **Settings › Bugs** and the reporter's
Diagnostics pane show the whole of that — there is nothing collected that is
not on those pages, and there is a *Break something* button so you can watch
the beetle notice.

Nothing is uploaded anywhere. Filing a report writes it into the file system
as Markdown under `Documents/Bug Reports`, so it is a file you can open in
Notes, `cat` in the shell and hand to someone — not a row in a list that only
one app can read. **Copy as Markdown** puts it on the clipboard.

Right-click the beetle to move it between corners, hide it (the reporter stays
reachable from Help, the launcher and `bug` in the shell), or squash it. It is
made of glass, so squashing it cracks the screen instead. From the shell:
`bug report`, `bug list`, `bug diag`, `bug throw`.

---

## Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl K` | Launcher (apps, files, actions) |
| `Alt Tab` | Cycle windows |
| `Ctrl W` | Close window |
| `Ctrl M` | Minimise window |
| `Ctrl ,` | Settings |
| `Ctrl Alt + / -` | Zoom the desktop by one stop |
| `Ctrl Alt 0` | Desktop back to 100% |
| `Ctrl Shift + / -` | Zoom the window in front |
| `Ctrl Shift 0` | That window back to 100% |
| `Ctrl` + wheel | Scale the desktop continuously |

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
  optics.css        the light, finishes, depth, caustics, shatter
  calendar.css      Calendar, and the shortcut recorder
  widgets.css       desktop widgets
  setup.css         setup wizard and greeting screen
  zoom.css          system zoom, window zoom, the menu-bar readout
  lang.css          per-script type, right-to-left, the language pane
  bugs.css          the beetle and the reporter
  tour.css          the guided tutorial: the spotlight and the coach
  games.css         the Games app: shelf, score bar, the seven boards,
                    the achievement wall and the locker
  responsive.css    the same OS on a phone — loaded last, so it wins
js/
  core/
    util.js         hyperscript + line-art icon set, avatar presets
    store.js        persisted state (one localStorage key)
    lang-data.js    the seven languages and the phrase book
    i18n.js         the language runtime: DOM translation, locale
                    wrapping, text direction
    zoom.js         system + window zoom, and the coordinate helpers
                    every pointer conversion goes through
    form.js         classifies the viewport (phone / tablet / desktop)
                    onto <html data-form>, so CSS and the window
                    manager agree about what machine this is
    glass.js        optical runtime: tokens, accent, presets, wallpaper,
                    refraction, sheen, dock geometry, perf mode
    fs.js           virtual file system (media-aware)
    lock.js         passcode hashing, the keypad, the challenge dialog
    users.js        accounts: each user owns a snapshot of the one
                    state key, and switching is save-mine, load-theirs
    bugs.js         error capture, the beetle, filing and diagnostics
    awards.js       the Games app's memory: per-game counters, the
                    achievements and unlockable looks that are
                    thresholds on them
    actions.js      the action registry + the custom shortcut engine
    tour.js         the guided tutorial, and DS.demo — tips that
                    perform themselves instead of describing
    media.js        IndexedDB blob store, import, export, quota
    time.js         synthesised chimes + the alarm daemon
    focus.js        the Flowmodoro / Pomodoro engine
    ui.js           menus, dialogs, toasts, glass control factories
    wm.js           app registry + window manager
    widgets.js      desktop widget system
  apps/*.js         one file per app; settings-panes.js and
                    settings-panes2.js add the deep customisation panes
                    via DS.settingsPanes; games.js is the Games shell
                    and the harness every game runs on
  games/*.js        one file per game, registered into DS.games
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

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, take the glass system and put it
in something else. Attribution is the only condition.

---

Built for **Hack Club WebOS 1**. The brief was a webpage with draggable
windows; the windows were finished in the first evening, and everything after
that — the five-layer glass, the three labs, the seven games, accounts, seven
languages — was the interesting part.
