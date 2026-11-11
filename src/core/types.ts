/**
 * The neucli config format (v2). See docs/format.md for the prose version.
 *
 * Hand-written YAML and the web editor both produce exactly these shapes, so
 * keep them readable: every key here is something a person might type.
 */

export interface Config {
  meta: Meta;
  theme?: Theme;
  /** Extra npm packages for the generated project, e.g. { "lucide-react": "^1.0.0" }. */
  dependencies?: Record<string, string>;
  /** Default layout component for every page. A page can override it or opt out with `layout: false`. */
  layout?: string;
  /** Reusable components, keyed by PascalCase name. */
  components?: Record<string, ComponentDef>;
  pages: Page[];
}

export interface Meta {
  name: string;
  description?: string;
  lang?: string;
  favicon?: string;
}

export interface Theme {
  /** Token name -> CSS color. Used as `fill: primary`, `color: primary/60`. */
  colors?: Record<string, string>;
  /**
   * Token name -> font stack. `body` becomes the default font, `heading`
   * applies to h1-h6. Any other key is usable as `font: { family: key }`.
   */
  fonts?: Record<string, string>;
}

export interface Page {
  path: string;
  name: string;
  title?: string;
  description?: string;
  /** Layout component name, or false to render without the default layout. */
  layout?: string | false;
  sections: Node[];
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export type PropType = 'text' | 'url' | 'image' | 'number' | 'boolean';

export interface PropDef {
  type: PropType;
  default?: string | number | boolean;
}

export interface ComponentDef {
  /** Declared props. Shorthand `title: text` equals `title: { type: text }`. */
  props?: Record<string, PropType | PropDef>;
  /** The component's tree. Required unless `file` is set. */
  root?: Node;
  /** Extra import lines for the generated component file. */
  imports?: string[];
  /** Code placed at the top of the generated component's function body. */
  logic?: string;
  /** Phase 8: path to your own .tsx file instead of `root`. Parsed, not generated yet. */
  file?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** px number, a percentage like "50%", "screen", or a raw CSS length like "60vh". */
export type Length = number | string;

/** `fill` = take the remaining space, `hug` = fit the content, or a fixed Length. */
export type Size = 'fill' | 'hug' | Length;

/**
 * A color: a theme token (`primary`), a Tailwind palette color (`slate-950`,
 * `white`), either with an optional `/opacity` (`white/60`), or a hex value.
 */
export type Color = string;

/** CSS-shorthand order: all | [vertical, horizontal] | [top, horizontal, bottom] | [top, right, bottom, left]. */
export type Spacing = number | [number, number] | [number, number, number] | [number, number, number, number];

export interface Layout {
  /** Default `column`. `grid` uses `columns`. */
  direction?: 'row' | 'column' | 'grid';
  /** Grid only. */
  columns?: number;
  /** Space between children, px. A pair is [vertical, horizontal]. */
  gap?: number | [number, number];
  padding?: Spacing;
  /** Cross-axis alignment. Default `stretch`. */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Main-axis distribution. Default `start`. */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?: boolean;
}

export interface Gradient {
  /** `to-b`, `to-br`, ... or an angle in degrees. */
  gradient: 'to-t' | 'to-tr' | 'to-r' | 'to-br' | 'to-b' | 'to-bl' | 'to-l' | 'to-tl' | number;
  from: Color;
  via?: Color;
  to: Color;
}

export interface Font {
  /** A theme font key (`heading`, `body`, ...) or `sans` / `serif` / `mono`. */
  family?: string;
  /** px */
  size?: number;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  /** Line height as a multiplier, e.g. 1.5. */
  leading?: number;
  /** Letter spacing in em, e.g. 0.2 or -0.025. */
  tracking?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  italic?: boolean;
}

export type BorderSide = 'all' | 'x' | 'y' | 'top' | 'right' | 'bottom' | 'left';

export interface Border {
  /** px, default 1 */
  width?: number;
  color?: Color;
  /** Default `all`. */
  sides?: BorderSide | BorderSide[];
  style?: 'solid' | 'dashed' | 'dotted';
}

export type ShadowSize = 'none' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Every structured style key. Which ones a node accepts depends on its type. */
export interface Style {
  layout?: Layout;
  width?: Size;
  height?: Size;
  minWidth?: Length;
  maxWidth?: Length;
  minHeight?: Length;
  maxHeight?: Length;
  fill?: Color | Gradient;
  /** Text color, inherited by children. */
  color?: Color;
  font?: Font;
  /** px, `full`, or [top-left, top-right, bottom-right, bottom-left]. */
  radius?: number | 'full' | [number, number, number, number];
  border?: Border;
  shadow?: ShadowSize | { size: ShadowSize; color?: Color };
  /** 0..1 */
  opacity?: number;
  /** Clip content that overflows (Figma's "clip content"). */
  clip?: boolean;
  hidden?: boolean;
  /** Images only. */
  fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

export type Breakpoint = 'desktop' | 'tablet' | 'phone';

export interface Responsive<S> {
  tablet?: S;
  phone?: S;
}

// ---------------------------------------------------------------------------
// Interactions (Phase 6) — parsed and validated, not generated yet.
// ---------------------------------------------------------------------------

export interface Interactions {
  /** Local state on a frame, e.g. { open: false, tab: 1 }. */
  state?: Record<string, string | number | boolean>;
  /** Event -> action, e.g. { click: "toggle open" }. */
  on?: Partial<Record<'click' | 'submit' | 'mouseenter' | 'mouseleave', string>>;
  /** Show the node only when this is true, e.g. "open", "!open", "tab == 2". */
  visibleWhen?: string;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

interface NodeBase {
  /** HTML id, e.g. for `#features` anchors. */
  id?: string;
  /** Layer name shown in the editor. No effect on output. */
  name?: string;
  /** Escape hatch: extra Tailwind classes appended after the structured ones. */
  className?: string;
  /** Extra HTML attributes (aria-*, data-*, target, ...). */
  attrs?: Record<string, string | number | boolean>;
  visibleWhen?: string;
}

type StyleKeys = Omit<Style, 'layout' | 'fit'>;

export interface FrameNode extends NodeBase, StyleKeys, Pick<Interactions, 'state' | 'on'> {
  type: 'frame';
  /** HTML tag, default `div`. */
  tag?: string;
  layout?: Layout;
  responsive?: Responsive<Omit<Style, 'fit'>>;
  children?: Node[];
}

export interface TextNode extends NodeBase, StyleKeys, Pick<Interactions, 'on'> {
  type: 'text';
  /** Default `p`. */
  tag?: string;
  content: string;
  responsive?: Responsive<Omit<Style, 'layout' | 'fit'>>;
}

export interface ImageNode extends NodeBase, StyleKeys {
  type: 'image';
  src: string;
  alt?: string;
  fit?: Style['fit'];
  responsive?: Responsive<Omit<Style, 'layout'>>;
}

export interface LinkNode extends NodeBase, StyleKeys, Pick<Interactions, 'on'> {
  type: 'link';
  href: string;
  /** Open in a new tab. */
  newTab?: boolean;
  /** Text-only link. Use `children` for anything richer. */
  content?: string;
  layout?: Layout;
  responsive?: Responsive<Omit<Style, 'fit'>>;
  children?: Node[];
}

export interface InputNode extends NodeBase, StyleKeys {
  type: 'input';
  /** HTML input type, default `text`. */
  inputType?: string;
  /** Render a <textarea>. */
  multiline?: boolean;
  /** Form field name. */
  field?: string;
  placeholder?: string;
  required?: boolean;
  responsive?: Responsive<Omit<Style, 'layout' | 'fit'>>;
}

export interface SlotNode {
  type: 'slot';
  /** Named slot; omit for the default slot (children / page content). */
  name?: string;
}

/** Sizing keys an instance may override; everything else comes from the component. */
export type SizingStyle = Pick<Style, 'width' | 'height' | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight' | 'hidden'>;

export interface InstanceNode extends NodeBase, SizingStyle {
  /** A component name from `components:` (PascalCase). */
  type: string;
  props?: Record<string, string | number | boolean>;
  /** Content for the component's default slot. */
  children?: Node[];
  /** Content for named slots. */
  slots?: Record<string, Node[]>;
  responsive?: Responsive<SizingStyle>;
}

export type PrimitiveNode = FrameNode | TextNode | ImageNode | LinkNode | InputNode | SlotNode;
export type Node = PrimitiveNode | InstanceNode;

export const PRIMITIVE_TYPES = ['frame', 'text', 'image', 'link', 'input', 'slot'] as const;
export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

export function isPrimitive(node: Node): node is PrimitiveNode {
  return (PRIMITIVE_TYPES as readonly string[]).includes(node.type);
}

export function isInstance(node: Node): node is InstanceNode {
  return !isPrimitive(node);
}
