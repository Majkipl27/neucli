/**
 * Structured styles -> Tailwind v4 classes.
 *
 * Each style key compiles into "groups": one CSS concern each (width,
 * padding-top, background-color...). Desktop is the base. A breakpoint only
 * emits the groups that differ from the breakpoint above it, prefixed with
 * `max-lg:` (tablet, < 1024px) or `max-md:` (phone, < 768px). Tailwind v4 sorts
 * `max-md` after `max-lg`, so phone wins over tablet, and both win over base.
 * A group that disappears at a smaller breakpoint gets its reset class, so
 * overrides never leave stale values behind.
 *
 * Sizing (`width: fill`) depends on the parent's direction, so compiling takes
 * the parent's flow at each breakpoint.
 */

import type { Breakpoint, Gradient, Responsive, Style } from '../types.ts';
import { colorSuffix } from './color.ts';
import * as scale from './scale.ts';

export type Flow = 'row' | 'column' | 'grid';
export type Flows = Record<Breakpoint, Flow>;
export type StyleKind = 'frame' | 'text' | 'image' | 'link' | 'input' | 'instance';

export const BREAKPOINTS: Breakpoint[] = ['desktop', 'tablet', 'phone'];
export const VARIANT: Record<Breakpoint, string> = { desktop: '', tablet: 'max-lg:', phone: 'max-md:' };
export const COLUMN_FLOWS: Flows = { desktop: 'column', tablet: 'column', phone: 'column' };

export interface StyleSource {
  kind: StyleKind;
  style: Style;
  responsive?: Responsive<Style>;
  /** Lays out children (frames always; links with `layout` or children). */
  container?: boolean;
  /** Display to restore when an instance un-hides at a smaller breakpoint (the component root's display). */
  displayReset?: string;
}

export type Part = 'all' | 'sizing' | 'rest';

export const STYLE_KEYS = [
  'layout', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'fill', 'color',
  'font', 'radius', 'border', 'shadow', 'opacity', 'clip', 'hidden', 'fit',
] as const;

export const SIZING_KEYS = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'hidden'] as const;

/** Pick the structured style keys off a node (or any object). */
export function styleOf(node: object): Style {
  const out: Record<string, unknown> = {};
  for (const key of STYLE_KEYS) {
    const value = (node as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as Style;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Objects merge key by key; arrays and scalars replace. */
export function mergeStyle<T extends object>(base: T, override: T | undefined): T {
  if (!override) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value === undefined) continue;
    const prev = out[key];
    out[key] = isPlainObject(prev) && isPlainObject(value) && !('gradient' in value) && !('gradient' in prev)
      ? { ...prev, ...value }
      : value;
  }
  return out as T;
}

/** The effective style at a breakpoint: desktop <- tablet <- phone. */
export function resolveStyle(style: Style, responsive: Responsive<Style> | undefined, bp: Breakpoint): Style {
  let out = style;
  if (bp === 'tablet' || bp === 'phone') out = mergeStyle(out, responsive?.tablet);
  if (bp === 'phone') out = mergeStyle(out, responsive?.phone);
  return out;
}

/** How this node lays out its children at each breakpoint. */
export function childFlows(src: Pick<StyleSource, 'style' | 'responsive'>): Flows {
  const flows = {} as Flows;
  for (const bp of BREAKPOINTS) {
    const direction = resolveStyle(src.style, src.responsive, bp).layout?.direction ?? 'column';
    flows[bp] = direction;
  }
  return flows;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

interface Entry {
  cls: string;
  /** Side families collapse (pt+pr+pb+pl -> p) when emitted together. */
  fam?: 'pad' | 'bw' | 'rad' | 'gap';
  side?: string;
  val?: string;
}

type Groups = Map<string, Entry>;

/** Groups an instance controls. `display` belongs here only for instances (where it comes from `hidden`). */
const SIZING_GROUPS = new Set([
  'width', 'height', 'grow', 'basis', 'shrink', 'self', 'min-w', 'min-h', 'max-w', 'max-h',
]);

/** Class that restores the initial value; '' means "nothing to restore". */
const RESET: Record<string, string> = {
  'display': 'block',
  'flex-dir': '',
  'grid-cols': '',
  'gap.x': 'gap-x-0',
  'gap.y': 'gap-y-0',
  'pad.t': 'pt-0',
  'pad.r': 'pr-0',
  'pad.b': 'pb-0',
  'pad.l': 'pl-0',
  'items': 'items-stretch',
  'justify': 'justify-start',
  'wrap': 'flex-nowrap',
  'width': 'w-auto',
  'height': 'h-auto',
  'grow': 'grow-0',
  'basis': 'basis-auto',
  'shrink': 'shrink',
  'self': 'self-auto',
  'min-w': 'min-w-auto',
  'min-h': 'min-h-auto',
  'max-w': 'max-w-none',
  'max-h': 'max-h-none',
  'bg-color': 'bg-transparent',
  'bg-image': 'bg-none',
  'from': '',
  'via': '',
  'to': '',
  'text-color': '',
  'font-family': '',
  'font-size': '',
  'font-weight': '',
  'leading': '',
  'tracking': '',
  'text-align': '',
  'text-transform': 'normal-case',
  'font-style': 'not-italic',
  'rad.tl': 'rounded-tl-none',
  'rad.tr': 'rounded-tr-none',
  'rad.br': 'rounded-br-none',
  'rad.bl': 'rounded-bl-none',
  'bw.t': 'border-t-0',
  'bw.r': 'border-r-0',
  'bw.b': 'border-b-0',
  'bw.l': 'border-l-0',
  'border-color': '',
  'border-style': 'border-solid',
  'shadow': 'shadow-none',
  'shadow-color': '',
  'opacity': 'opacity-100',
  'overflow': 'overflow-visible',
  'object-fit': 'object-fill',
};

/** Exposed for tests: every reset must be a real utility. */
export const RESET_CLASSES = Object.values(RESET).filter(Boolean);

const SIDE_PREFIX = {
  pad: { all: 'p', x: 'px', y: 'py', t: 'pt', r: 'pr', b: 'pb', l: 'pl' },
  bw: { all: 'border', x: 'border-x', y: 'border-y', t: 'border-t', r: 'border-r', b: 'border-b', l: 'border-l' },
  rad: {
    all: 'rounded', t: 'rounded-t', b: 'rounded-b', l: 'rounded-l', r: 'rounded-r',
    tl: 'rounded-tl', tr: 'rounded-tr', br: 'rounded-br', bl: 'rounded-bl',
  },
  gap: { all: 'gap', x: 'gap-x', y: 'gap-y' },
} as const;

/** pad/gap values join with a dash (p-4); bw/rad values carry their own (border-2, rounded-xl, border). */
function sideClass(fam: Entry['fam'] & string, side: string, val: string): string {
  const prefix = (SIDE_PREFIX[fam] as Record<string, string>)[side];
  return fam === 'pad' || fam === 'gap' ? `${prefix}-${val}` : `${prefix}${val}`;
}

function sideEntry(fam: 'pad' | 'bw' | 'rad' | 'gap', side: string, val: string): [string, Entry] {
  return [`${fam}.${side}`, { cls: sideClass(fam, side, val), fam, side, val }];
}

/** CSS shorthand -> [top, right, bottom, left]. */
function sides(value: number | number[]): [number, number, number, number] {
  if (typeof value === 'number') return [value, value, value, value];
  if (value.length === 2) return [value[0], value[1], value[0], value[1]];
  if (value.length === 3) return [value[0], value[1], value[2], value[1]];
  return [value[0], value[1], value[2], value[3]];
}

const ALIGN: Record<string, string> = {
  start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch', baseline: 'items-baseline',
};
const JUSTIFY: Record<string, string> = {
  start: 'justify-start', center: 'justify-center', end: 'justify-end',
  between: 'justify-between', around: 'justify-around', evenly: 'justify-evenly',
};
const TEXT_ALIGN: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify' };
const TRANSFORM: Record<string, string> = { uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' };

function compileGroups(src: StyleSource, style: Style, parent: Flow): Groups {
  const g: Groups = new Map();
  const set = (group: string, cls: string) => g.set(group, { cls });
  const container = src.container ?? src.kind === 'frame';

  // Display & auto layout
  if (style.hidden) {
    set('display', 'hidden');
  } else if (container) {
    const layout = style.layout ?? {};
    if (layout.direction === 'grid') {
      set('display', 'grid');
      set('grid-cols', `grid-cols-${layout.columns ?? 2}`);
    } else {
      set('display', 'flex');
      set('flex-dir', layout.direction === 'row' ? 'flex-row' : 'flex-col');
    }
  }

  if (container && style.layout) {
    const { gap, padding, align, justify, wrap } = style.layout;
    if (gap !== undefined) {
      const [y, x] = typeof gap === 'number' ? [gap, gap] : gap;
      for (const [k, v] of [sideEntry('gap', 'y', scale.spacing(y)), sideEntry('gap', 'x', scale.spacing(x))]) g.set(k, v);
    }
    if (padding !== undefined) {
      const [t, r, b, l] = sides(padding);
      for (const [side, v] of [['t', t], ['r', r], ['b', b], ['l', l]] as const) {
        const [k, e] = sideEntry('pad', side, scale.spacing(v));
        g.set(k, e);
      }
    }
    if (align) set('items', ALIGN[align]);
    if (justify) set('justify', JUSTIFY[justify]);
    if (wrap !== undefined) set('wrap', wrap ? 'flex-wrap' : 'flex-nowrap');
  }

  // Sizing, relative to the parent's flow
  sizeAxis(g, style.width, 'w', parent);
  sizeAxis(g, style.height, 'h', parent);
  if (style.minWidth !== undefined) set('min-w', `min-w-${scale.length(style.minWidth, 'w')}`);
  if (style.maxWidth !== undefined) set('max-w', `max-w-${scale.maxWidth(style.maxWidth)}`);
  if (style.minHeight !== undefined) set('min-h', `min-h-${scale.length(style.minHeight, 'h')}`);
  if (style.maxHeight !== undefined) set('max-h', `max-h-${scale.length(style.maxHeight, 'h')}`);

  // Fill
  if (style.fill !== undefined) {
    if (typeof style.fill === 'string') {
      set('bg-color', `bg-${colorSuffix(style.fill)}`);
    } else {
      const grad = style.fill as Gradient;
      const dir = typeof grad.gradient === 'number' ? String(grad.gradient) : grad.gradient;
      set('bg-image', `bg-linear-${dir}`);
      set('from', `from-${colorSuffix(grad.from)}`);
      if (grad.via) set('via', `via-${colorSuffix(grad.via)}`);
      set('to', `to-${colorSuffix(grad.to)}`);
    }
  }

  if (style.color !== undefined) set('text-color', `text-${colorSuffix(style.color)}`);

  // Typography
  const font = style.font;
  if (font) {
    if (font.family !== undefined) {
      set('font-family', `font-${font.family}`);
    }
    if (font.size !== undefined) set('font-size', `text-${scale.fontSize(font.size)}`);
    if (font.weight !== undefined) set('font-weight', `font-${scale.fontWeight(font.weight)}`);
    if (font.leading !== undefined) set('leading', `leading-${scale.leading(font.leading)}`);
    if (font.tracking !== undefined) set('tracking', `tracking-${scale.tracking(font.tracking)}`);
    if (font.align !== undefined) set('text-align', TEXT_ALIGN[font.align]);
    if (font.transform !== undefined) set('text-transform', TRANSFORM[font.transform]);
    if (font.italic !== undefined) set('font-style', font.italic ? 'italic' : 'not-italic');
  }

  // Radius
  if (style.radius !== undefined) {
    const corners = Array.isArray(style.radius) ? style.radius : [style.radius, style.radius, style.radius, style.radius];
    (['tl', 'tr', 'br', 'bl'] as const).forEach((corner, i) => {
      const [k, e] = sideEntry('rad', corner, scale.radius(corners[i] as number | 'full'));
      g.set(k, e);
    });
  }

  // Border
  if (style.border) {
    const { width = 1, color, style: lineStyle } = style.border;
    const wanted = new Set<string>();
    const sideList = style.border.sides === undefined ? ['all'] : ([] as string[]).concat(style.border.sides);
    for (const s of sideList) {
      if (s === 'all') ['t', 'r', 'b', 'l'].forEach(x => wanted.add(x));
      else if (s === 'x') ['l', 'r'].forEach(x => wanted.add(x));
      else if (s === 'y') ['t', 'b'].forEach(x => wanted.add(x));
      else wanted.add(s[0]);
    }
    for (const side of ['t', 'r', 'b', 'l']) {
      if (!wanted.has(side)) continue;
      const [k, e] = sideEntry('bw', side, scale.borderWidth(width));
      g.set(k, e);
    }
    if (color !== undefined) set('border-color', `border-${colorSuffix(color)}`);
    if (lineStyle !== undefined) set('border-style', `border-${lineStyle}`);
  }

  if (style.shadow !== undefined) {
    const shadow = typeof style.shadow === 'string' ? { size: style.shadow } : style.shadow;
    set('shadow', `shadow-${shadow.size}`);
    if ('color' in shadow && shadow.color) set('shadow-color', `shadow-${colorSuffix(shadow.color)}`);
  }

  if (style.opacity !== undefined) set('opacity', `opacity-${scale.opacity(style.opacity)}`);
  if (style.clip !== undefined) set('overflow', style.clip ? 'overflow-hidden' : 'overflow-visible');
  if (style.fit !== undefined) set('object-fit', `object-${style.fit}`);

  return g;
}

function sizeAxis(g: Groups, size: Style['width'], axis: 'w' | 'h', parent: Flow) {
  if (size === undefined) return;
  const set = (group: string, cls: string) => g.set(group, { cls });
  const dimension = axis === 'w' ? 'width' : 'height';
  // The parent's main axis: row lays out along width, column along height.
  const mainAxis = parent === 'row' ? 'w' : parent === 'column' ? 'h' : null;

  if (size === 'fill') {
    if (parent === 'grid') {
      set(dimension, `${axis}-full`);
    } else if (mainAxis === axis) {
      set('grow', 'grow');
      set('basis', 'basis-0');
      // Rows may shrink children below their content (long words, images) so they share space evenly.
      // Columns may not: a filling <main> that shrank below its content would let the footer overlap it.
      if (axis === 'w') set('min-w', 'min-w-0');
    } else {
      set('self', 'self-stretch');
    }
    return;
  }
  if (size === 'hug') {
    set(dimension, `${axis}-fit`);
    return;
  }
  set(dimension, `${axis}-${scale.length(size, axis)}`);
  if (mainAxis === axis) set('shrink', 'shrink-0');
}

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

function collapse(groups: Groups): string[] {
  // Side families collapse in place, at the position of their first member.
  const out: (string | { fam: NonNullable<Entry['fam']> })[] = [];
  const families = new Map<string, Map<string, string>>();
  for (const entry of groups.values()) {
    if (!entry.fam) {
      if (entry.cls) out.push(entry.cls);
      continue;
    }
    if (!families.has(entry.fam)) {
      families.set(entry.fam, new Map());
      out.push({ fam: entry.fam });
    }
    families.get(entry.fam)!.set(entry.side!, entry.val!);
  }
  return out.flatMap(item => (typeof item === 'string' ? [item] : collapseFamily(item.fam, families.get(item.fam)!)));
}

function collapseFamily(fam: NonNullable<Entry['fam']>, values: Map<string, string>): string[] {
  const cls = (side: string, val: string) => sideClass(fam, side, val);
  if (fam === 'gap') {
    const x = values.get('x');
    const y = values.get('y');
    if (x !== undefined && x === y) return [cls('all', x)];
    return [...(y !== undefined ? [cls('y', y)] : []), ...(x !== undefined ? [cls('x', x)] : [])];
  }
  if (fam === 'rad') {
    const [tl, tr, br, bl] = ['tl', 'tr', 'br', 'bl'].map(c => values.get(c));
    if (tl !== undefined && tl === tr && tl === br && tl === bl) return [cls('all', tl)];
    const pair = (a: string | undefined, b: string | undefined, side: string, ca: string, cb: string) => {
      if (a !== undefined && a === b) return [cls(side, a)];
      return [...(a !== undefined ? [cls(ca, a)] : []), ...(b !== undefined ? [cls(cb, b)] : [])];
    };
    // Prefer top/bottom pairs; fall back to left/right when those match instead.
    if ((tl === tr && tl !== undefined) || (bl === br && bl !== undefined) || !(tl === bl && tl !== undefined) && !(tr === br && tr !== undefined)) {
      return [...pair(tl, tr, 't', 'tl', 'tr'), ...pair(bl, br, 'b', 'bl', 'br')];
    }
    return [...pair(tl, bl, 'l', 'tl', 'bl'), ...pair(tr, br, 'r', 'tr', 'br')];
  }
  // Four sides: t r b l
  const [t, r, b, l] = ['t', 'r', 'b', 'l'].map(s => values.get(s));
  if (t !== undefined && t === r && t === b && t === l) return [cls('all', t)];
  const out: string[] = [];
  if (t !== undefined && t === b) out.push(cls('y', t));
  else {
    if (t !== undefined) out.push(cls('t', t));
    if (b !== undefined) out.push(cls('b', b));
  }
  if (l !== undefined && l === r) out.push(cls('x', l));
  else {
    if (r !== undefined) out.push(cls('r', r));
    if (l !== undefined) out.push(cls('l', l));
  }
  // Keep a stable, readable order: y/x before single sides is fine; sort px/py next to each other.
  return out;
}

function resetEntry(group: string, src: StyleSource): Entry {
  const cls = group === 'display' ? (src.displayReset ?? RESET.display) : (RESET[group] ?? '');
  const [fam, side] = group.includes('.') ? group.split('.') : [];
  if (fam && cls) {
    const val = fam === 'pad' || fam === 'gap' ? '0' : fam === 'bw' ? '-0' : '-none';
    return { cls, fam: fam as Entry['fam'], side, val };
  }
  return { cls };
}

function filterPart(groups: Groups, part: Part, kind: StyleKind): Groups {
  if (part === 'all') return groups;
  const out: Groups = new Map();
  for (const [k, v] of groups) {
    const sizing = SIZING_GROUPS.has(k) || (k === 'display' && kind === 'instance');
    if (sizing === (part === 'sizing')) out.set(k, v);
  }
  return out;
}

/** Drop desktop groups that only restate the initial value (items-stretch, pt-0...). */
function dropInitial(groups: Groups): Groups {
  const out: Groups = new Map();
  for (const [k, v] of groups) {
    if (RESET[k] && RESET[k] === v.cls && k !== 'display') continue;
    out.set(k, v);
  }
  return out;
}

/**
 * Compile a node's styles into a class string.
 * @param parent the parent's flow at each breakpoint (decides what `fill` means)
 * @param part 'sizing' or 'rest' to split a component root between the component file and its instances
 */
export function compileClasses(src: StyleSource, parent: Flows = COLUMN_FLOWS, part: Part = 'all'): string {
  const perBp = BREAKPOINTS.map(bp => {
    const style = resolveStyle(src.style, src.responsive, bp);
    return filterPart(compileGroups(src, style, parent[bp]), part, src.kind);
  });

  const classes: string[] = collapse(dropInitial(perBp[0]));

  for (let i = 1; i < perBp.length; i++) {
    const prev = perBp[i - 1];
    const cur = perBp[i];
    const diff: Groups = new Map();
    for (const [k, v] of cur) {
      if (prev.get(k)?.cls !== v.cls) diff.set(k, v);
    }
    for (const k of prev.keys()) {
      if (!cur.has(k)) {
        const reset = resetEntry(k, src);
        if (reset.cls) diff.set(k, reset);
      }
    }
    const variant = VARIANT[BREAKPOINTS[i]];
    classes.push(...collapse(diff).map(c => variant + c));
  }

  return classes.join(' ');
}

/** Join class strings, skipping empties. */
export function joinClasses(...parts: (string | undefined | false | null)[]): string {
  return parts.filter(Boolean).join(' ').trim();
}
