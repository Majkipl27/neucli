/**
 * Class computation shared by the code generator and the editor canvas.
 *
 * Anything that decides which Tailwind classes a node ends up with lives here,
 * so the canvas can't drift from what the CLI writes.
 */

import { COLUMN_FLOWS, BREAKPOINTS, childFlows, compileClasses, joinClasses, mergeStyle, resolveStyle, styleOf } from './style/compile.ts';
import type { Flows, StyleKind, StyleSource } from './style/compile.ts';
import type { ComponentDef, Config, InstanceNode, LinkNode, Node, Page, Style } from './types.ts';
import { isInstance } from './types.ts';

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

const SIZING = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'hidden'] as const;

export function pickSizing(style: Style | undefined): Style {
  const out: Record<string, unknown> = {};
  for (const k of SIZING) if (style?.[k] !== undefined) out[k] = style[k];
  return out as Style;
}

export function omitSizing(style: Style): Style {
  const out: Record<string, unknown> = { ...style };
  for (const k of SIZING) delete out[k];
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

/** Sizing classes for a component root, given where it's placed. */
export function rootSizing(config: Config, def: ComponentDef, instance: InstanceNode | null, parent: Flows): string {
  const root = def.root!;
  if (isInstance(root)) {
    // Root is itself an instance: its own sizing is what the inner component receives.
    const inner = config.components?.[root.type];
    if (!inner?.root) return '';
    return rootSizing(config, inner, mergeInstance(root, instance), parent);
  }
  const rootResponsive = (root as { responsive?: StyleSource['responsive'] }).responsive;
  const perBp = BREAKPOINTS.map(bp => {
    const fromRoot = pickSizing(resolveStyle(styleOf(root), rootResponsive, bp));
    const fromInstance = instance ? pickSizing(resolveStyle(styleOf(instance), instance.responsive as never, bp)) : {};
    return mergeStyle(fromRoot, fromInstance);
  });
  return compileClasses(
    { kind: 'instance', container: false, style: perBp[0], responsive: { tablet: perBp[1], phone: perBp[2] }, displayReset: rootDisplay(def) },
    parent,
    'sizing',
  );
}

function mergeInstance(inner: InstanceNode, outer: InstanceNode | null): InstanceNode {
  if (!outer) return inner;
  return {
    ...inner,
    ...pickSizing(outer as Style),
    responsive: {
      tablet: mergeStyle(pickSizing(inner.responsive?.tablet as Style), pickSizing(outer.responsive?.tablet as Style)),
      phone: mergeStyle(pickSizing(inner.responsive?.phone as Style), pickSizing(outer.responsive?.phone as Style)),
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
 * A component root's own classes minus sizing. Sizing comes per instance via
 * `rootSizing`; the generated component joins them as `cx(rest, sizing, className)`.
 */
export function componentRestClasses(def: ComponentDef): string {
  const root = def.root!;
  if (isInstance(root)) return '';
  const { kind, container } = rootKind(def);
  const src = sourceOf(root, kind, container);
  const unsized = { ...src, style: omitSizing(src.style), responsive: src.responsive && {
    tablet: src.responsive.tablet && omitSizing(src.responsive.tablet),
    phone: src.responsive.phone && omitSizing(src.responsive.phone),
  } };
  return joinClasses(compileClasses(unsized, COLUMN_FLOWS, 'rest'), (root as { className?: string }).className);
}

/** Flow of the element that holds the page content for a page. */
export function pageParentFlows(config: Config, page: Page): Flows {
  const layout = layoutOf(config, page);
  return layout ? slotParentFlows(config, layout, undefined) : COLUMN_FLOWS;
}
