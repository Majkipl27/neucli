/**
 * Class computation shared by the code generator and the editor canvas.
 *
 * Anything that decides which Tailwind classes a node ends up with lives here,
 * so the canvas can't drift from what the CLI writes.
 */

import { COLUMN_FLOWS, BREAKPOINTS, childFlows, compileClasses, joinClasses, mergeStyle, resolveStyle, styleOf } from './style/compile.ts';
import type { Flows, StyleKind, StyleSource } from './style/compile.ts';
import type { ComponentDef, Config, InstanceNode, LinkNode, Node, Page, Style, WhenStyle } from './types.ts';
import { isInstance } from './types.ts';
import { evalCondition, parseCondition } from './interactions.ts';
import type { Condition, StateValue } from './interactions.ts';

/** Flow of the element that holds a component's slot (where slot content lands). */
export function slotParentFlows(config: Config, componentName: string, slot: string | undefined, seen = new Set<string>()): Flows {
  const def = config.components?.[componentName];
  if (!def?.root || seen.has(componentName)) return COLUMN_FLOWS;
  seen.add(componentName);

  let found: Flows | null = null;
  const visit = (node: Node, parent: Flows) => {
    if (found) return;
    if (node.type === 'slot') {
      if ((node.name ?? undefined) === slot) found = parent;
      return;
    }
    if (isInstance(node)) {
      node.children?.forEach(c => visit(c, slotParentFlows(config, node.type, undefined, seen)));
      for (const [name, list] of Object.entries(node.slots ?? {})) {
        list.forEach(c => visit(c, slotParentFlows(config, node.type, name, seen)));
      }
      return;
    }
    if ('children' in node && node.children) {
      const flows = childFlows({ style: styleOf(node), responsive: (node as { responsive?: object }).responsive as never });
      node.children.forEach(c => visit(c, flows));
    }
  };
  visit(def.root, COLUMN_FLOWS);
  return found ?? COLUMN_FLOWS;
}

export function sourceOf(node: Node, kind: StyleKind, container?: boolean): StyleSource {
  return {
    kind,
    style: styleOf(node),
    responsive: (node as { responsive?: StyleSource['responsive'] }).responsive,
    container,
  };
}

export function isLinkContainer(node: LinkNode): boolean {
  return !!(node.layout || node.responsive?.tablet?.layout || node.responsive?.phone?.layout || node.children?.length);
}

/** Style keys an instance may set on its component's root. The instance's value wins. */
export const OVERRIDABLE = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'hidden', 'fill', 'color', 'border'] as const;

export function pickOverridable(style: Style | undefined): Style {
  const out: Record<string, unknown> = {};
  for (const k of OVERRIDABLE) if (style?.[k] !== undefined) out[k] = style[k];
  return out as Style;
}

export function omitOverridable(style: Style): Style {
  const out: Record<string, unknown> = { ...style };
  for (const k of OVERRIDABLE) delete out[k];
  return out as Style;
}

export function rootKind(def: ComponentDef): { kind: StyleKind; container: boolean } {
  const root = def.root!;
  if (isInstance(root)) return { kind: 'instance', container: false };
  if (root.type === 'frame') return { kind: 'frame', container: true };
  if (root.type === 'link') return { kind: 'link', container: isLinkContainer(root) };
  if (root.type === 'text' || root.type === 'image' || root.type === 'input') return { kind: root.type, container: false };
  return { kind: 'instance', container: false };
}

/** The root's display, restored when an instance un-hides at a smaller breakpoint. */
function rootDisplay(def: ComponentDef): string {
  const root = def.root!;
  if (isInstance(root)) return 'block';
  if (root.type === 'frame' || (root.type === 'link' && isLinkContainer(root))) {
    return (root as { layout?: { direction?: string } }).layout?.direction === 'grid' ? 'grid' : 'flex';
  }
  return 'block';
}

/**
 * Overridable classes (sizing, fill, color, border) for a component root, given
 * where it's placed. The instance's values are merged over the root's, so they win.
 */
export function rootOverrides(config: Config, def: ComponentDef, instance: InstanceNode | null, parent: Flows): string {
  const root = def.root!;
  if (isInstance(root)) {
    // Root is itself an instance: its own overrides are what the inner component receives.
    const inner = config.components?.[root.type];
    if (!inner?.root) return '';
    return rootOverrides(config, inner, mergeInstance(root, instance), parent);
  }
  const rootResponsive = (root as { responsive?: StyleSource['responsive'] }).responsive;
  const perBp = BREAKPOINTS.map(bp => {
    const fromRoot = pickOverridable(resolveStyle(styleOf(root), rootResponsive, bp));
    const fromInstance = instance ? pickOverridable(resolveStyle(styleOf(instance), instance.responsive as never, bp)) : {};
    return mergeStyle(fromRoot, fromInstance);
  });
  return compileClasses(
    { kind: 'instance', container: false, style: perBp[0], responsive: { tablet: perBp[1], phone: perBp[2] }, displayReset: rootDisplay(def) },
    parent,
    'overrides',
  );
}

function mergeInstance(inner: InstanceNode, outer: InstanceNode | null): InstanceNode {
  if (!outer) return inner;
  return {
    ...inner,
    ...mergeStyle(pickOverridable(inner as Style), pickOverridable(outer as Style)),
    responsive: {
      tablet: mergeStyle(pickOverridable(inner.responsive?.tablet as Style), pickOverridable(outer.responsive?.tablet as Style)),
      phone: mergeStyle(pickOverridable(inner.responsive?.phone as Style), pickOverridable(outer.responsive?.phone as Style)),
    },
  } as InstanceNode;
}

export function layoutOf(config: Config, page: Page): string | null {
  if (page.layout === false) return null;
  return page.layout ?? config.layout ?? null;
}

/** Classes for a primitive node (not a component root, not an instance). */
export function nodeClasses(node: Exclude<Node, { type: 'slot' }>, parent: Flows): string {
  if (isInstance(node)) return '';
  const container = node.type === 'frame' ? true : node.type === 'link' ? isLinkContainer(node) : undefined;
  return joinClasses(compileClasses(sourceOf(node, node.type, container), parent), node.className);
}

/**
 * A component root's own classes minus the overridable ones, which come per
 * instance via `rootOverrides`; the generated component joins them as
 * `cx(rest, overrides, className)`.
 */
export function componentRestClasses(def: ComponentDef): string {
  const root = def.root!;
  if (isInstance(root)) return '';
  const { kind, container } = rootKind(def);
  const src = sourceOf(root, kind, container);
  const unsized = { ...src, style: omitOverridable(src.style), responsive: src.responsive && {
    tablet: src.responsive.tablet && omitOverridable(src.responsive.tablet),
    phone: src.responsive.phone && omitOverridable(src.responsive.phone),
  } };
  return joinClasses(compileClasses(unsized, COLUMN_FLOWS, 'rest'), (root as { className?: string }).className);
}

/** Flow of the element that holds the page content for a page. */
export function pageParentFlows(config: Config, page: Page): Flows {
  const layout = layoutOf(config, page);
  return layout ? slotParentFlows(config, layout, undefined) : COLUMN_FLOWS;
}

// ---------------------------------------------------------------------------
// State styles (`when:`)
// ---------------------------------------------------------------------------

export interface ClassVariant {
  /** The `when` key as written, e.g. "tab == 1". */
  when: string;
  condition: Condition;
  /** The node's full classes while this condition holds. */
  classes: string;
}

/**
 * A node's classes with no condition holding (`base`), and its full classes
 * under each `when` condition, in order. The first condition that holds wins.
 */
export interface ClassVariants {
  base: string;
  variants: ClassVariant[];
}

/** `when` styles go on top of every breakpoint's resolved style. */
function withWhen(src: StyleSource, extra: Style): StyleSource {
  const perBp = BREAKPOINTS.map(bp => mergeStyle(resolveStyle(src.style, src.responsive, bp), extra));
  return { ...src, style: perBp[0], responsive: { tablet: perBp[1], phone: perBp[2] } };
}

function splitWhen(style: WhenStyle): { style: Style; className?: string } {
  const { className, ...rest } = style;
  return { style: rest as Style, className };
}

function variantsFor(node: Node, compile: (src: StyleSource) => string, src: StyleSource, baseClass: string | undefined): ClassVariants {
  const base = joinClasses(compile(src), baseClass);
  const when = (node as { when?: Record<string, WhenStyle> }).when ?? {};
  const variants: ClassVariant[] = [];
  for (const [key, override] of Object.entries(when)) {
    const condition = parseCondition(key);
    if (!condition) continue;
    const { style, className } = splitWhen(override);
    variants.push({ when: key, condition, classes: joinClasses(compile(withWhen(src, style)), baseClass, className) });
  }
  return { base, variants };
}

/** Classes for a primitive node, per state condition. `nodeClasses` is `base`. */
export function nodeClassVariants(node: Exclude<Node, { type: 'slot' }>, parent: Flows): ClassVariants {
  if (isInstance(node)) return { base: '', variants: [] };
  const container = node.type === 'frame' ? true : node.type === 'link' ? isLinkContainer(node) : undefined;
  return variantsFor(node, src => compileClasses(src, parent), sourceOf(node, node.type, container), node.className);
}

/** `componentRestClasses`, per state condition (validation keeps overridable keys out of a root's `when`). */
export function componentRestVariants(def: ComponentDef): ClassVariants {
  const root = def.root!;
  if (isInstance(root)) return { base: '', variants: [] };
  const { kind, container } = rootKind(def);
  const src = sourceOf(root, kind, container);
  const unsized: StyleSource = { ...src, style: omitOverridable(src.style), responsive: src.responsive && {
    tablet: src.responsive.tablet && omitOverridable(src.responsive.tablet),
    phone: src.responsive.phone && omitOverridable(src.responsive.phone),
  } };
  return variantsFor(root, s => compileClasses(s, COLUMN_FLOWS, 'rest'), unsized, (root as { className?: string }).className);
}

/** The classes for the current state: the first variant whose condition holds, else the base. */
export function pickVariant(v: ClassVariants, get: (name: string) => StateValue | undefined): string {
  for (const variant of v.variants) if (evalCondition(variant.condition, get)) return variant.classes;
  return v.base;
}

/**
 * Split variants into classes every state shares (`common`) and what differs,
 * so generated code reads `cx("flex p-4", open ? "bg-slate-100" : "bg-white")`.
 */
export function splitVariants(v: ClassVariants): { common: string; base: string; variants: { when: string; condition: Condition; classes: string }[] } {
  const lists = [v.base, ...v.variants.map(x => x.classes)].map(c => c.split(/\s+/).filter(Boolean));
  const shared = lists.reduce((acc, list) => acc.filter(t => list.includes(t)));
  const rest = (list: string[]) => list.filter(t => !shared.includes(t)).join(' ');
  return {
    common: shared.join(' '),
    base: rest(lists[0]),
    variants: v.variants.map((x, i) => ({ when: x.when, condition: x.condition, classes: rest(lists[i + 1]) })),
  };
}
