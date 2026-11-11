# The neucli format (v2)

One YAML file describes the site. Everything here is also what the web editor reads and writes. The source of truth is `src/core/types.ts` (types) and `src/core/schema.ts` (validation); this page is the readable version.

```yaml
meta:
  name: Nova                 # required
  description: ...
  lang: en
  favicon: /favicon.svg

theme:
  colors: { primary: "#7c3aed", surface: "#0f172a" }
  fonts:  { heading: Space Grotesk, body: "IBM Plex Sans, sans-serif" }

dependencies: { lucide-react: ^1.0.0 }   # extra npm packages

layout: Site                 # default layout component for every page

components:
  Site: { root: ... }
  Card: { props: ..., root: ... }

pages:
  - path: /
    name: Home               # becomes Home.tsx
    title: Nova              # <title>, via useSEO
    description: ...
    layout: Site             # override, or false for none
    sections: [ ...nodes ]
```

## Nodes

Lowercase types are primitives. PascalCase types are instances of your components.

| type | what it is | own keys |
|---|---|---|
| `frame` | auto layout box (Figma's frame) | `tag` (default `div`), `layout`, `children` |
| `text` | text | `content`, `tag` (default `p`) |
| `image` | `<img>` | `src`, `alt`, `fit` |
| `link` | anchor; a text link with `content`, or a box with `layout` + `children` | `href`, `newTab`, `content` or `children`, `layout` |
| `input` | form field | `field` (name), `inputType`, `multiline`, `placeholder`, `required` |
| `slot` | where an instance's content goes (components only) | `name` (omit for the default slot) |
| `Card` etc. | component instance | `props`, `children` (default slot), `slots`, sizing keys |

Every node except `slot` also takes `id` (HTML id, used for `#anchors`), `name` (layer name for the editor, no effect on output), `className` (extra Tailwind classes, appended last) and `attrs` (extra HTML attributes: `aria-label`, `data-x`, `type`...).

Unknown keys are errors, so typos don't silently do nothing.

## Styles

Structured values compile to Tailwind v4 classes. On-scale values get the normal class (`gap: 20` → `gap-5`), anything else an arbitrary value (`gap: 17` → `gap-[17px]`). Spacing snaps when the px value is even.

```yaml
layout:
  direction: row | column | grid     # default column; every frame is flex or grid
  columns: 3                          # grid only
  gap: 16 | [vertical, horizontal]
  padding: 24 | [y, x] | [top, x, bottom] | [top, right, bottom, left]
  align: start | center | end | stretch | baseline    # cross axis, default stretch
  justify: start | center | end | between | around | evenly
  wrap: true
width / height: fill | hug | 320 | "50%" | screen | "60vh"
minWidth / maxWidth / minHeight / maxHeight: 320 | "50%" | screen | "60vh"   # maxWidth 1280 -> max-w-7xl
fill: primary | slate-950/80 | "#0f172a" | { gradient: to-b, from: primary/20, via: ..., to: slate-950 }
color: white/60                       # text color, inherited
font: { family: heading, size: 48, weight: 700, leading: 1.5, tracking: -0.025, align: center, transform: uppercase, italic: true }
radius: 12 | full | [tl, tr, br, bl]
border: { width: 1, color: white/10, sides: all | x | y | top | [top, bottom], style: dashed }
shadow: xl | { size: xl, color: violet-500/30 }
opacity: 0.8
clip: true                            # overflow hidden
hidden: true
fit: cover                            # images
```

Colors are a theme token (`primary`), a Tailwind palette color (`slate-950`, `white`), or hex, each with an optional `/opacity` (0-100). Theme tokens are checked against `theme.colors`.

### Sizing follows the parent

`fill` means "take the remaining space" along the parent's direction and "stretch" across it, like Figma. In a row, `width: fill` → `grow basis-0 min-w-0`; in a column it's `self-stretch`; in a grid, `w-full`. `hug` → `w-fit`. Fixed sizes also get `shrink-0` on the parent's main axis.

One deliberate difference from Figma: children stretch across a column by default (CSS's `align: stretch`), because that's what hand-written layouts expect. Set `align` on the parent or `width: hug` on the child to change it.

`height: fill` in a column doesn't add `min-h-0`, so a filling `<main>` can't shrink below its content (which would let a footer overlap it).

### Responsive

Desktop is the base. `responsive.tablet` applies below 1024px (`max-lg:`), `responsive.phone` below 768px (`max-md:`). Overrides merge into the base key by key (`layout: { gap: 16 }` keeps the direction), and phone builds on tablet.

```yaml
layout: { direction: row, gap: 32 }
responsive:
  tablet: { layout: { gap: 16 } }
  phone:  { layout: { direction: column }, hidden: false }
# -> flex flex-row gap-8 max-lg:gap-4 max-md:flex-col
```

Each breakpoint only emits what changed. When a value switches mode (fill at desktop, fixed on phone), the classes the old mode needed are reset, so nothing stale leaks through.

## Components

```yaml
components:
  Card:
    props:
      title: text                         # shorthand for { type: text }
      count: { type: number, default: 0 }
    root:
      type: frame
      layout: { gap: 8, padding: 24 }
      children:
        - { type: text, tag: h3, content: "{title}" }
        - type: slot                       # default slot: the instance's children
        - { type: slot, name: actions }    # named slot
```

- Names are PascalCase and must match exactly. `InnerNote` and `inner-note` can't both exist, so files can't collide on case-insensitive disks. Names that the generated code uses (`Frame`, `Text`, `Image`, `Link`, `Input`, `App`, `Router`...) are rejected.
- Prop types: `text`, `url`, `image`, `number`, `boolean`. `children`, `className`, `overrides`, `id`, `key`, `ref`, `tag`, `style` are reserved.
- `{prop}` inside a component's strings interpolates (`content`, `src`, `alt`, `href`, `placeholder`, `attrs`, instance props). So does `{name}` for state from an enclosing frame (see Interactions). Anything else in braces is literal text.
- `logic:` is placed at the top of the component function; `imports:` at the top of the file. Variables `logic` declares can be interpolated too (`content: "{icon}"`), and an attribute whose whole value is `{expr}` is passed as code (`onClick: "{increment}"`). Prefer `state:` / `on:` for state; `logic:` is the escape hatch for what YAML can't say (an icon component, a fetch).
- **Ids inside a component are per copy.** An `id` (on a node or under `attrs:`) written in a component's tree becomes `` `${uid}-name` `` with `uid` from React's `useId()`, so two copies on a page never share an id. References to those ids inside the same component (`aria-controls`, `aria-labelledby`, `aria-describedby`, `htmlFor`, `list`, `form`...) follow. Ids on pages stay literal, so `/#features` links keep working; to link to a section, give the id to the instance on the page, not to a node inside the component.

### Your own components (`file:`)

```yaml
components:
  Pricing:
    file: ./custom/Pricing.tsx      # relative to the generated project's src/
    props:
      plan: text
      seats: number
```

A component can point at your own React file instead of a `root` tree. Pages, layouts and other components use it like any component: props are checked against `props:`, instances can have `children`, and instance styles (sizing, `fill`, `color`, `border`) plus `className` arrive as one `className` string. The file needs a default export. It lives in `src/` but outside `src/neucli/`, usually in `src/custom/`. neucli never changes it; if it doesn't exist yet, the first run writes a small starter there for you.

`logic:` and `imports:` don't apply to `file:` components (the code is in the file), and named slots are up to the component (pass them as props). The editor canvas can't run your file; core's `isFileComponent(def)` tells it to show a labelled placeholder instead.

### Instances

```yaml
- type: Card
  props: { title: Hello }
  width: fill                 # sizing keys only
  responsive: { phone: { hidden: true } }
  className: hover:border-violet-500/40
  children: [ ... ]           # default slot
  slots: { actions: [ ... ] }
```

An instance can set props, sizing (`width`, `height`, min/max, `hidden`), `fill`, `color`, `border` and `className`, at the base and per breakpoint under `responsive`. This works like overrides on a Figma instance: the copy stays linked to its component, and only the keys you set differ.

```yaml
- type: Card
  props: { title: Pro }
  fill: { gradient: to-br, from: violet-600, to: indigo-700 }
  border: { color: violet-400 }   # keeps the Card's border width and sides
```

The instance's values are merged over the component root's (`border` merges key by key; a new `fill` replaces the old one, solid or gradient). The result is compiled where the instance is placed and passed to the root as the `overrides` prop, which replaces the root's defaults for those keys. That way two background classes never compete. Anything else (padding, radius, font...) comes from the component; to change it on one copy, detach it in the editor, which turns it into plain nodes.

`className` on an instance is appended to the root's classes. Use it for what the structured keys don't cover (hover states, shadows). When it sets the same property as the root, which one wins isn't defined.

## Layouts

A layout is a component with a default `slot` where the page goes. With routing, pages that share a layout render inside one React Router layout route, so the layout stays mounted while you navigate.

### Presets

`neucli/core` ships ready-made components as plain format data (`src/core/presets/`): layouts `Marketing` (navbar, page, footer), `SidebarApp` (with a Menu button on phone) and `Dashboard`, blocks `Navbar`, `Hero`, `Section`, `Card`, `Button`, `Stat`, `Footer`, and interactive blocks `Accordion` (with `AccordionItem`), `Tabs`, `Carousel` and `Modal`. They use Tailwind palette colors only, so they fit any theme. `insertPreset(config, id)` copies a preset's definitions into `components:`; after that they're ordinary components you own. An identical definition already in the config (under any name) is reused, and a name clash gets a free name (`Navbar2`) with references following.

## Interactions

Four keys, small enough to write by hand:

```yaml
- type: frame
  state: { open: false }              # declares state for this frame and everything inside it
  children:
    - type: frame
      tag: button
      on: { click: toggle open }      # an action
      children:
        - type: text
          content: '+'
          when: { open: { className: rotate-45 } }   # style while a condition holds
    - type: text
      visibleWhen: open               # rendered only while the condition holds
      content: The answer.
```

### `state`

On a frame: `name: initial value`. The value sets the type (`false` boolean, `0` number, `pricing` string). The frame's own `on`, `when` and `attrs` and everything inside it can read and change it, including instance children and slot content written in the same file. A component's state is per instance, so three `AccordionItem`s open independently. State can't reuse a name an enclosing frame already declared, or a prop, slot or `logic` name of its component. Inside text it interpolates like a prop: `content: "Count: {count}"`.

### `on`

`click`, `submit` (frames with `tag: form`), `mouseenter`, `mouseleave`, each with one action:

| Action | Needs | Does |
|---|---|---|
| `toggle open` | boolean | flips it |
| `set tab 2` / `set open true` / `set plan pro` | same type as the value | sets it |
| `increment count` / `decrement count` | number | adds / subtracts 1 |
| `next slide of 3` / `prev slide of 3` | number | steps through 0..2 and wraps |

### Conditions

`visibleWhen`, the keys of `when`, and `{...}` attribute values use the same conditions: `open`, `!open`, `tab == 2`, `tab != 0`, `count >= 3`, `plan == pro`. A bare name must be a boolean (write `count != 0` for a number). One comparison per condition; nest frames or add state for anything more.

`visibleWhen` reads the state of enclosing frames, not the node's own (the node would hide the thing that shows it). An attribute whose whole value is a condition becomes live: `attrs: { aria-selected: "{tab == 0}" }`.

### `when`

`when: { <condition>: <style overrides> }` on frames, text, images, links and inputs. While the condition holds, its styles go on top of the node's style at every breakpoint; `className` inside adds classes. The first condition that holds wins; they don't stack, so put the most specific first.

Why a map of conditions instead of per-state style blocks: it reads like CSS's `:hover` and the rest of this format (`responsive:` is also "override these keys in this situation"), it needs no new concept for multi-value state (`tab == 0`, `tab == 1`), and the generated code is one plain expression: `cx("flex px-3", tab === 0 ? "text-slate-900" : "text-slate-500")`.

Two limits keep the output simple: `when` can't change `layout.direction` (children's sizing depends on it; use two frames with `visibleWhen`), and on a component's root it can't set the keys instances override (`fill`, `color`, `border`, sizing); put state styles on a frame inside.

### Generated code

State becomes `useState` at the top of the page or component function that owns the frame (`const [open, setOpen] = useState(false)`; a name taken twice in one file becomes `open2`). Actions become handlers using React's updater form (`setSlide((slide) => (slide + 1) % 3)`), `visibleWhen` becomes `{open && (...)}`, and `when` becomes a `cx(...)` expression with the shared classes kept static.

Accessibility comes with it:

- **`tag: button` frames.** These get `type="button"` and a plain `onClick`. Use them for clickable things whose content is text.
- **Other clickable frames and text.** These get `{...onPress(...)}`, a small helper in `src/neucli/primitives/press.ts` that adds `role="button"`, `tabIndex`, and Enter/Space handling.
- **`aria-expanded`.** A `toggle` reports it when something inside the same state frame shows or hides with that state (`visibleWhen`, or a `when` that sets `hidden`). It also reports `aria-controls` when that thing has an `id`.
- **`tag: dialog` frames.** These need `visibleWhen` on a boolean. They become the `Dialog` primitive, a native `<dialog>` opened with `showModal()`, which gives `aria-modal`, an inert page behind, focus inside, and the `::backdrop` (style it with `className: backdrop:bg-black/50`). Esc and a click on the backdrop set the state back to false, and focus returns to the button that opened it. Add `m-auto` to center it, since Tailwind's reset removes the browser's auto margins.

## Output

Generated code goes under `src/neucli/`, which neucli rewrites on every run. Everything outside it is yours; see [cli.md](cli.md) for who owns what, the manifest, and how hand edits are protected.

- `src/neucli/primitives/` — verbatim copies of `src/core/primitives` (`InternalLink.tsx` becomes a React Router link when there's more than one page).
- `src/neucli/components/` — one file per component that pages or layouts actually use (`file:` components are imported from where they are instead).
- `src/neucli/pages/`, `src/neucli/App.tsx`, `src/neucli/ScrollToHash.tsx` (routing only: scrolls to `#anchors` and to the top on navigation).
- `src/neucli/theme.css` — an `@theme` block from `theme`. `body` becomes the default font, `heading` applies to h1-h6. `src/index.css` (yours) imports Tailwind and this file.
- `index.html` — title, language, favicon and Google Fonts from `meta` and `theme`.

All output paths live in `src/generator/paths.ts`.

## Not covered by structured styles yet

Positioning (`sticky`, `absolute`, `z-*`), margins, hover/focus states, transitions, backdrop effects and padding on inputs. Use `className` for these; the editor panel (Phase 4) is where structured versions would go.
