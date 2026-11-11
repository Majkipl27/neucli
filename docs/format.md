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
- Prop types: `text`, `url`, `image`, `number`, `boolean`. `children`, `className`, `sizing`, `id`, `key`, `ref`, `tag`, `style` are reserved.
- `{prop}` inside a component's strings interpolates (`content`, `src`, `alt`, `href`, `placeholder`, `attrs`, instance props). Outside components braces are literal text.
- `logic:` is placed at the top of the component function; `imports:` at the top of the file. Variables `logic` declares can be interpolated too (`content: "{count}"`), and an attribute whose whole value is `{expr}` is passed as code (`onClick: "{increment}"`). Use this for state until interactions land.

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

## Interactions (Phase 6, parsed only)

`state` on frames, `on: { click: "toggle open" }` and `visibleWhen: "open"` are validated now and generate nothing yet; the CLI prints a warning.

## Output

- `src/primitives/` — verbatim copies of `src/core/primitives` (`InternalLink.tsx` becomes a React Router link when there's more than one page).
- `src/components/` — one file per component that pages or layouts actually use.
- `src/pages/`, `src/App.tsx`, `src/ScrollToHash.tsx` (routing only: scrolls to `#anchors` and to the top on navigation).
- `src/index.css` — `@import "tailwindcss"` plus an `@theme` block from `theme`. `body` becomes the default font, `heading` applies to h1-h6.

All output paths live in `src/generator/paths.ts`.

## Not covered by structured styles yet

Positioning (`sticky`, `absolute`, `z-*`), margins, hover/focus states, transitions, backdrop effects and padding on inputs. Use `className` for these; the editor panel (Phase 4) is where structured versions would go.
