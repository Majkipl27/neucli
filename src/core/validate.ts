/**
 * Full validation: structure (schema.ts) plus everything that needs the whole
 * config — component references, props, slots, layouts, theme tokens, cycles
 * and name collisions. Used by the CLI and the editor.
 */

import type { ComponentDef, Config, InstanceNode, Node, PropDef } from './types.ts';
import { isInstance } from './types.ts';
import { parseStructure, formatPath } from './schema.ts';
import { parseColor } from './style/color.ts';
import { RESERVED_NAMES, RESERVED_PROPS, pageComponentName } from './names.ts';
import { COMPONENT_NAME } from './schema.ts';

export interface ValidationResult {
  config?: Config;
  errors: string[];
  /** Things that parse fine but don't do anything yet (e.g. Phase 6 interactions). */
  warnings: string[];
}

type Path = (string | number)[];

export function validate(raw: unknown): ValidationResult {
  const parsed = parseStructure(raw);
  if (!parsed.config) return { errors: parsed.errors, warnings: [] };
  const config = parsed.config;
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (path: Path, message: string) => errors.push(path.length ? `${formatPath(path)}: ${message}` : message);

  const components = config.components ?? {};
  const themeColors = new Set(Object.keys(config.theme?.colors ?? {}));
  const themeFonts = new Set(Object.keys(config.theme?.fonts ?? {}));
  let usesInteractions = false;

  // --- component definitions -------------------------------------------------
  for (const [name, def] of Object.entries(components)) {
    const at: Path = ['components', name];
    if (!COMPONENT_NAME.test(name)) {
      err(at, `component names are PascalCase (e.g. ${pageComponentName(name)}), so they can't clash on case-insensitive filesystems`);
    } else if (RESERVED_NAMES.has(name)) {
      err(at, `"${name}" is reserved by the generated code; pick another name`);
    }
    const slotNames = collectSlots(def);
    for (const prop of Object.keys(def.props ?? {})) {
      if (RESERVED_PROPS.has(prop)) err([...at, 'props', prop], `"${prop}" is reserved for every component`);
      if (slotNames.named.has(prop)) err([...at, 'props', prop], `"${prop}" is also a slot name`);
      const p = def.props![prop] as PropDef;
      if (p.default !== undefined && !matchesPropType(p, p.default)) {
        err([...at, 'props', prop, 'default'], `default doesn't match type ${p.type}`);
      }
    }
    if (def.root?.type === 'slot') err([...at, 'root'], 'the root of a component can\'t be a slot; wrap it in a frame');
    for (const dup of slotNames.duplicates) err([...at, 'root'], `slot "${dup || 'default'}" appears more than once`);
  }

  // --- trees ---------------------------------------------------------------------
  const walk = (node: Node, path: Path, inComponent: string | null) => {
    if (node.type === 'slot') {
      if (!inComponent) err(path, 'slots only exist inside component definitions');
      return;
    }

    if ('state' in node || 'on' in node || ('visibleWhen' in node && node.visibleWhen !== undefined)) usesInteractions = true;
    checkColors(node, path);

    if (isInstance(node)) {
      checkInstance(node, path);
      node.children?.forEach((c, i) => walk(c, [...path, 'children', i], inComponent));
      for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
        nodes.forEach((c, i) => walk(c, [...path, 'slots', slot, i], inComponent));
      }
      return;
    }
    if ('children' in node && node.children) {
      node.children.forEach((c, i) => walk(c, [...path, 'children', i], inComponent));
    }
  };

  const checkInstance = (node: InstanceNode, path: Path) => {
    const def = components[node.type];
    if (!def) {
      const near = Object.keys(components).find(k => k.toLowerCase() === node.type.toLowerCase());
      err([...path, 'type'], `no component named ${node.type}${near ? ` (did you mean ${near}?)` : ''}`);
      return;
    }
    if (node.hidden === true) {
      err([...path, 'hidden'], 'an instance can only be hidden per breakpoint (under responsive:); remove it to hide it everywhere');
    }
    const declared = def.props ?? {};
    for (const [prop, value] of Object.entries(node.props ?? {})) {
      const p = declared[prop] as PropDef | undefined;
      if (!p) {
        const list = Object.keys(declared);
        err([...path, 'props', prop], `${node.type} has no prop "${prop}"${list.length ? ` (props: ${list.join(', ')})` : ''}`);
      } else if (!matchesPropType(p, value)) {
        err([...path, 'props', prop], `expected ${p.type}, got ${typeof value}`);
      }
    }
    const slots = collectSlots(def);
    if (node.children?.length && !slots.hasDefault) {
      err([...path, 'children'], `${node.type} has no slot for children; add { type: slot } to it or remove the children`);
    }
    for (const slot of Object.keys(node.slots ?? {})) {
      if (!slots.named.has(slot)) err([...path, 'slots', slot], `${node.type} has no slot named "${slot}"`);
    }
  };

  const checkColors = (node: Node, path: Path) => {
    const check = (value: unknown, at: Path) => {
      if (typeof value !== 'string') return;
      const res = parseColor(value, themeColors);
      if (!res.ok) err(at, res.error!);
    };
    const visitStyle = (style: Record<string, unknown>, at: Path) => {
      const fill = style.fill;
      if (typeof fill === 'string') check(fill, [...at, 'fill']);
      else if (fill && typeof fill === 'object') {
        const g = fill as Record<string, unknown>;
        for (const k of ['from', 'via', 'to']) check(g[k], [...at, 'fill', k]);
      }
      check(style.color, [...at, 'color']);
      const border = style.border as Record<string, unknown> | undefined;
      if (border) check(border.color, [...at, 'border', 'color']);
      const shadow = style.shadow;
      if (shadow && typeof shadow === 'object') check((shadow as Record<string, unknown>).color, [...at, 'shadow', 'color']);
      const family = (style.font as Record<string, unknown> | undefined)?.family;
      if (typeof family === 'string' && !['sans', 'serif', 'mono'].includes(family) && !themeFonts.has(family)) {
        err([...at, 'font', 'family'], `"${family}" is not a theme font (theme.fonts: ${[...themeFonts].join(', ') || 'empty'}) or sans/serif/mono`);
      }
    };
    const n = node as unknown as Record<string, unknown>;
    visitStyle(n, path);
    const responsive = n.responsive as Record<string, Record<string, unknown>> | undefined;
    for (const bp of ['tablet', 'phone']) {
      if (responsive?.[bp]) visitStyle(responsive[bp], [...path, 'responsive', bp]);
    }
  };

  for (const [name, def] of Object.entries(components)) {
    if (def.root) walk(def.root, ['components', name, 'root'], name);
  }
  config.pages.forEach((page, i) => {
    page.sections.forEach((node, j) => walk(node, ['pages', i, 'sections', j], null));
  });

  // --- layouts -------------------------------------------------------------------
  const checkLayout = (name: string, path: Path) => {
    const def = components[name];
    if (!def) {
      err(path, `layout "${name}" is not a component`);
      return;
    }
    if (def.root && !collectSlots(def).hasDefault) {
      err(path, `layout "${name}" needs a { type: slot } where the page goes`);
    }
  };
  if (config.layout) checkLayout(config.layout, ['layout']);
  config.pages.forEach((page, i) => {
    if (typeof page.layout === 'string') checkLayout(page.layout, ['pages', i, 'layout']);
  });

  // --- cycles & pages ----------------------------------------------------------
  if (errors.length === 0) checkCycles(components, errors);
  checkPages(config, errors);

  if (usesInteractions) {
    warnings.push('state / on / visibleWhen are parsed but not generated yet (Phase 6); they have no effect on the output.');
  }

  return errors.length ? { errors, warnings } : { config, errors, warnings };
}

function matchesPropType(p: PropDef, value: unknown): boolean {
  if (p.type === 'number') return typeof value === 'number';
  if (p.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' || typeof value === 'number';
}

export interface SlotInfo {
  hasDefault: boolean;
  named: Set<string>;
  duplicates: string[];
}

/** Slots declared in a component's own tree (not inside instances' slot content of other components). */
export function collectSlots(def: ComponentDef): SlotInfo {
  const info: SlotInfo = { hasDefault: false, named: new Set(), duplicates: [] };
  const seen = new Set<string>();
  const visit = (node: Node) => {
    if (node.type === 'slot') {
      const key = node.name ?? '';
      if (seen.has(key)) info.duplicates.push(key);
      seen.add(key);
      if (node.name) info.named.add(node.name);
      else info.hasDefault = true;
      return;
    }
    if ('children' in node && node.children) node.children.forEach(visit);
    if (isInstance(node)) Object.values(node.slots ?? {}).forEach(list => list.forEach(visit));
  };
  if (def.root) visit(def.root);
  return info;
}

/** Components used (as instances) anywhere in a tree, including slot content. */
export function instancesIn(node: Node, out = new Set<string>()): Set<string> {
  if (isInstance(node)) {
    out.add(node.type);
    Object.values(node.slots ?? {}).forEach(list => list.forEach(n => instancesIn(n, out)));
  }
  if ('children' in node && node.children) node.children.forEach(n => instancesIn(n, out));
  return out;
}

function checkCycles(components: Record<string, ComponentDef>, errors: string[]) {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string, trail: string[]) => {
    const def = components[name];
    if (!def?.root) return;
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      errors.push(`components: cycle detected (${[...trail, name].join(' -> ')})`);
      return;
    }
    state.set(name, 'visiting');
    for (const used of instancesIn(def.root)) visit(used, [...trail, name]);
    state.set(name, 'done');
  };
  Object.keys(components).forEach(name => visit(name, []));
}

/** Page files and identifiers share a scope with component imports; compare case-insensitively for macOS. */
function checkPages(config: Config, errors: string[]) {
  const componentNames = new Map(Object.keys(config.components ?? {}).map(n => [n.toLowerCase(), n]));
  const byName = new Map<string, number>();
  const byPath = new Map<string, number>();

  config.pages.forEach((page, i) => {
    const id = pageComponentName(page.name);
    const key = id.toLowerCase();
    const prev = byName.get(key);
    if (prev !== undefined) {
      errors.push(`pages[${i}].name: "${page.name}" collides with pages[${prev}].name (both become ${id}.tsx)`);
    } else {
      byName.set(key, i);
    }
    const clash = componentNames.get(key);
    if (clash) errors.push(`pages[${i}].name: "${page.name}" collides with the component ${clash}; rename the page`);
    if (RESERVED_NAMES.has(id)) errors.push(`pages[${i}].name: "${page.name}" is reserved; rename the page`);

    const prevPath = byPath.get(page.path);
    if (prevPath !== undefined) errors.push(`pages[${i}].path: "${page.path}" is already used by pages[${prevPath}]`);
    else byPath.set(page.path, i);
  });
}
