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
import { OVERRIDABLE } from './render.ts';
import { actionNeeds, attrCondition, INTERACTIVE_TAGS, parseAction, parseCondition, typeOfValue } from './interactions.ts';
import type { Condition, StateType } from './interactions.ts';
import { declaredNames } from './names.ts';

export interface ValidationResult {
  config?: Config;
  errors: string[];
  /** Things that parse fine but don't do anything yet (e.g. `file:` components). */
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

  // --- interactions ----------------------------------------------------------------
  /** State visible at a node: name -> type. Lexical: a page's tree, or one component's tree. */
  type StateScope = Map<string, StateType>;

  const checkCondition = (c: Condition | null, scope: StateScope, at: Path, what: string) => {
    if (!c) return;
    const type = scope.get(c.name);
    if (!type) {
      const known = [...scope.keys()];
      err(at, `${what} reads "${c.name}", which isn't state here${known.length ? ` (state: ${known.join(', ')})` : '; declare it with state: on an enclosing frame'}`);
      return;
    }
    if (!c.op) {
      if (type !== 'boolean') err(at, `"${c.name}" is a ${type}; compare it instead (e.g. ${c.name} == ${type === 'number' ? 0 : 'value'})`);
      return;
    }
    const valueType = typeOfValue(c.value!);
    if (['>', '<', '>=', '<='].includes(c.op) && (type !== 'number' || valueType !== 'number')) {
      err(at, `${c.op} compares numbers; "${c.name}" is a ${type}`);
    } else if (valueType !== type) {
      err(at, `"${c.name}" is a ${type}, compared with a ${valueType} (${JSON.stringify(c.value)})`);
    }
  };

  const checkInteractions = (node: Node, path: Path, scope: StateScope, ctx: WalkCtx): StateScope => {
    const n = node as unknown as Record<string, unknown>;
    if (typeof n.visibleWhen === 'string') {
      checkCondition(parseCondition(n.visibleWhen), scope, [...path, 'visibleWhen'], 'visibleWhen');
    }
    if (isInstance(node)) return scope;

    // State declared here is visible to this node's own on / when / attrs and to its subtree.
    let own = scope;
    const state = n.state as Record<string, string | number | boolean> | undefined;
    if (state) {
      own = new Map(scope);
      for (const [name, value] of Object.entries(state)) {
        if (scope.has(name)) err([...path, 'state', name], `"${name}" is already state on an enclosing frame; pick another name`);
        else if (ctx.reserved.has(name)) err([...path, 'state', name], `"${name}" is also a prop, slot or logic name of ${ctx.component}`);
        own.set(name, typeOfValue(value));
      }
    }

    const on = n.on as Record<string, string> | undefined;
    for (const [event, src] of Object.entries(on ?? {})) {
      const at = [...path, 'on', event];
      const action = parseAction(src);
      if (!action) continue; // schema already reported it
      const type = own.get(action.name);
      if (!type) {
        err(at, `"${src}" changes "${action.name}", which isn't state here; declare it with state: on this frame or an enclosing one`);
      } else if (actionNeeds(action) !== type) {
        err(at, `"${src}" needs ${actionNeeds(action) === 'boolean' ? 'a boolean' : `a ${actionNeeds(action)}`}, but "${action.name}" is a ${type}`);
      }
      if (event === 'submit' && !(node.type === 'frame' && (node as { tag?: string }).tag === 'form')) {
        err(at, 'submit only fires on a frame with tag: form');
      }
      if (event === 'click' && node.type === 'input') err(at, "inputs don't take click actions");
    }

    const when = n.when as Record<string, Record<string, unknown>> | undefined;
    for (const [key, style] of Object.entries(when ?? {})) {
      const at = [...path, 'when', key];
      checkCondition(parseCondition(key), own, at, 'when');
      const layout = style.layout as Record<string, unknown> | undefined;
      if (layout && 'direction' in layout) err([...at, 'layout', 'direction'], "when can't change layout.direction (children's sizing depends on it); use two frames with visibleWhen");
      if (ctx.isRoot) {
        const clash = OVERRIDABLE.filter(k => k in style);
        if (clash.length) err(at, `on a component's root, when can't set ${clash.join(', ')} (instances override those); put the state style on a frame inside`);
      }
    }

    for (const [key, value] of Object.entries((n.attrs as Record<string, unknown>) ?? {})) {
      const c = attrCondition(value, name => own.has(name));
      if (c) checkCondition(c, own, [...path, 'attrs', key], key);
    }

    if (node.type === 'frame' && (node as { tag?: string }).tag === 'dialog') {
      const c = typeof n.visibleWhen === 'string' ? parseCondition(n.visibleWhen) : null;
      if (!c || c.op || scope.get(c.name) !== 'boolean') {
        err(path, 'a dialog frame needs visibleWhen on a boolean (e.g. visibleWhen: open), so Esc and the backdrop can close it');
      }
    }
    if (on?.click && node.type === 'frame') {
      const tag = (node as { tag?: string }).tag;
      if (tag && !INTERACTIVE_TAGS.has(tag) && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table'].includes(tag)) {
        err([...path, 'on', 'click'], `a clickable ${tag} gets role=button, which hides its meaning from screen readers; use a frame (or tag: button) around it`);
      }
    }
    return own;
  };

  interface WalkCtx {
    component: string | null;
    /** Names a component already uses (props, slots, logic), which state can't reuse. */
    reserved: Set<string>;
    isRoot: boolean;
  }

  // --- trees ---------------------------------------------------------------------
  const walk = (node: Node, path: Path, inComponent: string | null, scope: StateScope, ctx: WalkCtx) => {
    if (node.type === 'slot') {
      if (!inComponent) err(path, 'slots only exist inside component definitions');
      return;
    }

    checkColors(node, path);
    const inner = checkInteractions(node, path, scope, ctx);
    const child: WalkCtx = { ...ctx, isRoot: false };

    if (isInstance(node)) {
      checkInstance(node, path);
      node.children?.forEach((c, i) => walk(c, [...path, 'children', i], inComponent, inner, child));
      for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
        nodes.forEach((c, i) => walk(c, [...path, 'slots', slot, i], inComponent, inner, child));
      }
      return;
    }
    if ('children' in node && node.children) {
      node.children.forEach((c, i) => walk(c, [...path, 'children', i], inComponent, inner, child));
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
    const when = n.when as Record<string, Record<string, unknown>> | undefined;
    for (const [key, style] of Object.entries(when ?? {})) visitStyle(style, [...path, 'when', key]);
  };

  for (const [name, def] of Object.entries(components)) {
    if (!def.root) continue;
    const slots = collectSlots(def);
    const reserved = new Set([...Object.keys(def.props ?? {}), ...slots.named, ...declaredNames(def.logic)]);
    walk(def.root, ['components', name, 'root'], name, new Map(), { component: name, reserved, isRoot: true });
  }
  config.pages.forEach((page, i) => {
    page.sections.forEach((node, j) =>
      walk(node, ['pages', i, 'sections', j], null, new Map(), { component: null, reserved: new Set(), isRoot: false }),
    );
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

  for (const [name, def] of Object.entries(components)) {
    if (def.file) warnings.push(`components.${name}.file: file components are parsed but not generated yet (Phase 8).`);
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
