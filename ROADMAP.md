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
| Components | Components declare their props. An instance fills them in. You can also **detach** an instance (Figma's "detach instance"): it turns into a plain copy you edit freely. |
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
- [ ] Editor document model switched to `neucli/core`'s schema
- [ ] Canvas renders inside an iframe with Tailwind compiled at runtime from the config's theme
- [ ] Selection and hover drawn as an overlay above the iframe, never as classes on the element (no more ring/shadow clashes, no "+ Add inside" layout jump)
- [ ] Zoom to fit on load, zoom to selection

### Phase 3 — Direct manipulation
- [ ] Selection box with handles; hover outline; parent/child selection with Enter / Shift+Enter, Esc to deselect
- [ ] Drag to reorder inside auto layout, with a drop indicator; drag between frames
- [ ] Resize handles that set width/height as fixed, or switch to hug / fill (Figma's sizing modes)
- [ ] Double-click text to edit inline
- [ ] Multi-select (Shift+click), group into frame

### Phase 4 — Auto layout panel
- [ ] Right panel reads and writes structured values exactly: direction, gap, padding, alignment, sizing, fill (theme tokens or hex), radius, border, shadow, typography
- [ ] Breakpoint switcher: edits go to the base or to the `tablet`/`phone` override, and overridden values are marked
- [ ] Theme editor: colors and fonts

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
