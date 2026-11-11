# neucli roadmap

Agreed 2026-11-11. This file is the plan; update it when a decision changes.

## What neucli is

A YAML file describes a site. The CLI turns it into a plain React + TypeScript + Tailwind project you'd be happy to read. The web editor edits that same YAML file the way Figma edits a design. Hand-written YAML and the editor are equal citizens: anything you can do in one, you can do in the other, and the file stays readable and diffable in git.

It's a portfolio piece with no deadline. It should be finished and polished, not wide.

## Decisions

| Topic | Decision |
|---|---|
| Building blocks | Figma-style primitives: `frame` (auto layout box), `text`, `image`, `link`, `slot`, plus component instances. `hero`, `navbar`, `card` etc. stop being hard-coded types and become editable presets. |
| Styling | Structured values (`layout`, `fill`, `radius`, `text`...) are the source of truth. `className` stays as an escape hatch for anything the panel doesn't cover. |
| Responsive | Desktop is the base. Any node can override values for `tablet` / `phone` under `responsive:`. |
| Components | Components declare their props. An instance fills them in. Like Figma, a copy can override `fill`, `color`, `border` and sizing while staying linked; the copy's value wins. You can also **detach** an instance (Figma's "detach instance"): it turns into a plain copy you edit freely. |
| Layouts (AppShell) | A layout is a component with a `slot` where the page goes. Pages pick one with `layout:`. Navbar/footer, sidebar and dashboard shells ship as presets. |
| Interactivity | Generic state + actions. A node can hold `state`, children trigger actions (`on: { click: toggle open }`), and `visibleWhen` shows/hides. Accordion, Modal, Carousel, Tabs are presets built on this. |
| Generated code | Safe zones. neucli owns `src/neucli/` and overwrites it every run. You own `src/custom/`, which neucli never touches. Custom `.tsx` plugs in from YAML via `file:`. Inline `logic:` in YAML stays supported. Hand-editing a generated file gets a warning instead of a silent overwrite. |
| Repos | Two repos stay. The CLI stays standalone. Shared code (schema, style compiler, primitives) lives in this repo and is exported as `neucli/core`. The editor depends on it. |
| Old format | Breaks. The two example configs get migrated once by hand. No permanent migrator. |
| Browser export | The editor can download the generated project as a zip. Phase 9, only when Tomasz asks for it. |
| Tailwind | v4 for generated projects and the editor canvas. |
| License | MIT, both repos. |

### What the format looks like

```yaml
meta:
  name: Nova

theme:
  colors: { primary: "#7c3aed", surface: "#0f172a" }
  fonts: { heading: "Space Grotesk", body: "IBM Plex Sans" }

components:
  Card:
    props:
      title: { type: text, default: Card title }
      image: { type: image }
    root:
      type: frame
      layout: { direction: column, gap: 12, padding: 24 }
      fill: surface
      radius: 12
      children:
        - type: image
          src: "{image}"
        - type: text
          tag: h3
          content: "{title}"
          text: { size: 20, weight: 600 }

  Marketing:              # a layout: navbar, page slot, footer
    root:
      type: frame
      layout: { direction: column }
      children:
        - type: Navbar
        - type: slot
        - type: Footer

pages:
  - path: /
    name: Home
    layout: Marketing
    sections:
      - type: frame
        layout: { direction: row, gap: 32, padding: [96, 24] }
        responsive:
          phone:
            layout: { direction: column, gap: 16 }
        children:
          - type: Card
            props: { title: Fast, image: /fast.png }
```

Exact key names were settled in Phase 1; the reference is [docs/format.md](docs/format.md).

## Phases

The order puts the canvas feel first, as agreed (direct manipulation → panel → components). Before any of that, the canvas has to show the truth. Right now it renders Tailwind classes only if they happen to appear in the editor's own source, so it doesn't match what the CLI builds.

### Phase 0 — CLI hardening ✅ (uncommitted)
- [x] Text with `{ } < > &` no longer breaks generated TSX
- [x] Types used only inside custom components get generated
- [x] Custom components respect `tag:`
- [x] Validator catches component cycles, page name/path collisions, reserved names
- [x] `npm test` smoke test: generates the examples and typechecks the output

### Phase 1 — New format and `neucli/core` (CLI repo) ✅ (uncommitted)
- [x] zod schema for the new format, used by both the CLI and the editor
- [x] Style compiler: structured values + responsive overrides → Tailwind classes (on-scale values snap to the scale, e.g. gap 20 → `gap-5`; off-scale values use arbitrary classes)
- [x] Primitive React components (`Frame`, `Text`, `Image`, `Link`), one source used both in generated projects and on the editor canvas
- [x] Code generator rewritten on top of core; incremental rebuild kept
- [x] Migrate `examples/nova.yml` and `examples/landing-page.yaml`
- [x] Export `neucli/core` for the editor
- [x] The three issues folded in below

Deviations and additions:
- **`input` primitive added.** The landing page has a contact form and nothing else could render `<input>`/`<textarea>`.
- **Typography key is `font`, not `text`** (the sample above used `text: { size, weight }`), because `text` is already a node type.
- **Generated projects moved to React 19, Vite 7, Tailwind v4** (`@tailwindcss/vite`, no tailwind.config.js or PostCSS config). Fonts and colors live in an `@theme` block in `src/index.css`.
- **`neucli/core` is split in two exports**: `neucli/core` (pure TS: types, schema, validation, style compiler, theme CSS) and `neucli/core/primitives` (the React components). The CLI runs on Node's native TypeScript support, which can't load `.tsx`.
- **`file:` components and `state`/`on`/`visibleWhen` are in the schema but not generated**, as planned for Phases 8 and 6. `file:` fails with a clear error; interactions print a warning.
- **Unused components aren't generated** any more; only those reachable from pages and layouts get files.
- **Old pages wrapped content in `<main className="flex-grow">`**; now the layout component decides everything, including the `<main>`.
- **`removeStaleFiles` still deletes anything in the generated folders it didn't write** (Phase 8 fixes this with a manifest).

### Phase 2 — Truthful canvas (editor)
- [x] Editor document model switched to `neucli/core`'s schema
- [x] Canvas renders inside an iframe with Tailwind compiled at runtime from the config's theme
- [x] Selection and hover drawn as an overlay above the iframe, never as classes on the element (no more ring/shadow clashes, no "+ Add inside" layout jump)
- [x] Zoom to fit on load, zoom to selection

Checked against real builds: for every page of both examples the canvas DOM matches the CLI's built site (classes, tags, attributes), and on Nova's home page all 81 element boxes match to the pixel at 1280×800.

Deviations and additions:
- **Class computation moved into core** (`src/core/render.ts`: `nodeClasses`, `componentRestClasses`, `rootSizing`, `slotParentFlows`, `pageParentFlows`, `layoutOf`). The code generator and the canvas both call it, so they can't drift. Generated output is byte-identical to before the move.
- **The editor keeps the document as written** (prop shorthands, key order) and validates it with core on every change. While an edit leaves it invalid, the canvas keeps the last valid version and lists the errors.
- **`logic:` doesn't run on the canvas.** Names it declares stay as literal `{name}` text and `{expr}` event handlers are dropped. Everything else, props and slots included, renders like the build.
- **Viewport units are pinned to the simulated 1280×800 viewport.** The iframe grows to the page's full height, so `100vh` would otherwise mean the whole page.
- **Zoom to fit fits the page width** (Shift+1), not the whole page; a full long page would be unreadably small. Zoom to selection is Shift+2.
- **The right panel is minimal**: content fields per node type, instance props from the component's declared props, layer name / id / classes, and the node's YAML, editable and only applied when the whole document still validates. The real auto layout panel is Phase 4.
- **Inserting** lives in the toolbar: the five primitives plus a Component menu. A new node goes inside the selection if it can hold children, after it otherwise, or at the end of the page.
- **The editor bundles the CLI repo's examples** (`neucli/examples/*` export) and opens on Nova. Open ▸ switches between Nova, the landing page and a blank site.

### Phase 3 — Direct manipulation
- [x] Selection box with handles; hover outline; parent/child selection with Enter / Shift+Enter, Esc to deselect
- [x] Drag to reorder inside auto layout, with a drop indicator; drag between frames
- [x] Resize handles that set width/height as fixed, or switch to hug / fill (Figma's sizing modes)
- [x] Double-click text to edit inline
- [x] Multi-select (Shift+click), group into frame

Checked in the editor on both examples with real mouse and keyboard input (plus scripted pointer events for timing-sensitive drags), then exported, generated with the CLI and built.

How it behaves, and where it differs from Figma:
- **Click picks the outermost node not yet entered**: siblings of the selection and of its ancestors are directly clickable; going deeper takes a double-click, or Cmd/Ctrl+click to jump straight to the deepest node. Hover shows what a click would pick. Esc selects the parent (clears at the top), Enter the first child, Shift+Enter the parent. Enter on a text node starts editing it.
- **Dragging** reorders inside the parent's flow (line across a column, down a row, beside the nearest cell in a grid) and drops into whatever container is under the pointer. Hovering a *sibling* container only reorders; resting on it for half a second enters it (spring-loading), so reordering a row of cards doesn't nest them. Drops are checked with core's validator first: an invalid target turns the indicator red and is refused. Esc cancels. Named slots accept drops next to their existing content, not when empty.
- **Resize** previews on the element and writes `width` / `height` in px once, on release (Shift snaps to 8). The right panel's new Size section switches each axis between Fixed (starts from the rendered size), Hug and Fill, or unsets it. Values always go to the base style; per-breakpoint editing is Phase 4.
- **Inline text editing** works on text nodes and text-only links (Enter commits, Shift+Enter is a newline, Esc cancels). Text inside a component instance that is exactly one of its text props (`{title}`) edits that prop on the instance; other component text can't be edited from the canvas.
- **Multi-select**: Shift+click on the canvas or in the layers panel; delete, duplicate (Cmd+D) and drag work on all of them. Cmd+G wraps selected siblings in a frame that keeps the parent's direction and gap, so nothing moves; Cmd+Shift+G unwraps a frame (its own styles are dropped). Copy/paste still uses the primary selection only.
- Dev builds expose the stores as `window.__neucli` for poking at state from the console.

### Phase 4 — Auto layout panel
- [x] Right panel reads and writes structured values exactly: direction, gap, padding, alignment, sizing, fill (theme tokens or hex), radius, border, shadow, typography
- [x] Breakpoint switcher: edits go to the base or to the `tablet`/`phone` override, and overridden values are marked
- [x] Theme editor: colors and fonts

Checked in the editor on both examples with real input, then exported, generated with the CLI and built; every edit showed up in the generated classes.
- **The panel** (`neucli-web/src/panel/`) has sections for auto layout (direction, columns, wrap, Figma's 3×3 alignment box plus justify/align menus, gap with an optional row/column split, padding as one value, x/y or per side), size (W/H with Fixed/Hug/Fill, min/max, shown/hidden), fill (solid or gradient with direction and from/via/to), typography (color, family from theme fonts, size, weight, line height, letter spacing, align, case, italic), appearance (radius or per-corner radius, opacity, shadow size and color, clip, image fit) and border (color, width, style, sides). Content fields sit above it, and layer name / id / classes / the node's YAML are under Advanced.
- **Number fields** scrub when you drag their label (Shift ×10), take arrow keys (±1, Shift ±10) and typed values. A typed value is one undo step, a whole scrub is one step however long it pauses (new `sticky` dispatch option), and arrow presses coalesce while you keep pressing. Length fields also take `50%`, `screen`, `60vh`...
- **The color picker** shows the theme tokens, the full Tailwind v4 palette (swatches read from Tailwind's own theme.css, so they're the exact oklch colors), white/black/transparent, a hex field and opacity.
- **Breakpoints**: Desktop / Tablet (834px) / Phone (390px) above the canvas. Switching resizes the canvas and sends every panel edit and resize-handle drag to `responsive.tablet` / `.phone`. Values set at the active breakpoint get a blue dot; clicking it drops the override. Choosing a default on tablet/phone (column, stretch, radius 0...) writes it explicitly, since unset there means "same as the bigger breakpoint".
- **Instances** show only what a copy may set (props, size, fill, text color, border), displaying the component's values merged with the copy's. Values the copy sets itself get a violet dot that resets to the component; "Reset all overrides" clears them all. **Detach** turns the copy into plain layers in one undo step: props substituted, slot content placed where the slots were, overrides merged into the root, nested instances kept. It refuses components with `logic:`/`imports:` (plain layers can't carry code) and checks the result validates.
- **Theme tokens**: renaming a token rewrites every reference (structured colors at every breakpoint, gradient stops, border/shadow colors, `font.family`, and classes like `hover:bg-primary/50`); deleting one that's still used is refused with a count. Token values are editable as text, so non-hex CSS colors work.
- **New keys go where a person would write them** (`fill` after `layout`, `direction` first inside `layout`); existing keys never move, so hand-written files keep their shape.
- The Open menu asks with an in-app dialog instead of `window.confirm`.
- Core gained one export for the picker: `PALETTE_FAMILIES` / `PALETTE_SHADES`.
- On an instance at tablet/phone, a value the copy sets anywhere shows the violet dot, and resetting it clears the copy's value at every breakpoint, not just the active one.
- Removing a fill or border while on tablet/phone drops that breakpoint's override (back to the desktop value) rather than clearing it there; to clear it only on phone, set it to `transparent`.
- Several border sides (`sides: [top, bottom]`) show read-only in the panel; edit them in the YAML.

### Phase 5 — Components, instances, layouts
- [ ] "Create component" from a selection; declared props; instances
- [ ] Editing the main component updates every instance
- [ ] Detach instance
- [ ] Slots
- [ ] Layouts / AppShell: page `layout:` + presets (marketing navbar/footer, sidebar app, dashboard)
- [ ] Preset library: Navbar, Hero, Card, Footer as editable components

### Phase 6 — Interactions
- [ ] `state`, `on`, `visibleWhen` in the schema; generated as `useState` + handlers
- [ ] Live on the canvas in a "preview" mode
- [ ] Presets: Accordion, Modal, Carousel, Tabs

### Phase 7 — Infinite canvas
- [ ] All pages on one zoomable board
- [ ] Each page shown at desktop / tablet / phone side by side

### Phase 8 — Code safe zones (CLI; can run in parallel with Phases 3–7)
- [ ] Generated files move to `src/neucli/`; `src/custom/` is never touched
- [ ] Manifest of what neucli wrote, with hashes. Only files in the manifest get cleaned up (today, stale-file cleanup deletes *any* file it didn't generate, including your own)
- [ ] Warn when a generated file was hand-edited
- [ ] `file:` components pointing at your own `.tsx`; `logic:` kept

### Phase 9 — Ship it (on hold: only start when Tomasz says so)
- [ ] Download project as zip from the editor
- [ ] Hosted editor demo with an example site loaded
- [ ] README rewrite with a GIF; docs for the format

## Folded into Phase 1 ✅

- [x] `InnerNote` and `inner-note` produce different file names that collide on macOS. Component names must now be PascalCase and match exactly; near-misses get a "did you mean".
- [x] `/#anchor` links don't scroll when React Router is on. Generated apps with routing include `ScrollToHash`.
- [x] A custom component named like a built-in is silently ignored. There are no built-ins any more, and names the generated code uses (`Frame`, `Text`, `App`...) are rejected with an error.
