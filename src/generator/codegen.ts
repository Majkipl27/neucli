/**
 * Config -> TSX source for pages, components and App.
 *
 * Every node renders through a primitive (Frame, Text, Image, Link, Input) or
 * a generated component. Styles compile to Tailwind classes here, with the
 * parent's flow known at every breakpoint, so `width: fill` comes out right.
 */

import {
  COLUMN_FLOWS, childFlows, PRIMITIVE_COMPONENTS, collectSlots, pageComponentName, isInstance,
  sourceOf, isLinkContainer, slotParentFlows, rootOverrides, layoutOf,
  nodeClassVariants, componentRestVariants, splitVariants, parseAction, parseCondition, conditionJs, negatedConditionJs,
  actionJs, attrCondition, INTERACTIVE_TAGS, typeOfValue, declaredNames, isFileComponent,
} from '../core/index.ts';
import type {
  ClassVariants, ComponentDef, Condition, Config, Flows, InstanceNode, Node, Page, PropDef, StateType,
} from '../core/index.ts';
import { attr, element, identityScope, textChild, valueAttr } from './jsx.ts';
import type { Scope } from './jsx.ts';
import { fileComponentPath } from './paths.ts';

/** Where a generated file sits under src/neucli/, for relative imports. */
type FileAt = 'pages' | 'components' | 'app';

/** Import path of a component (generated, or your own `file:` one) from a generated file. */
export function componentImport(config: Config, name: string, from: FileAt): string {
  const def = config.components?.[name];
  if (isFileComponent(def)) {
    const target = fileComponentPath(def.file).replace(/\.(tsx|ts|jsx|js)$/, '');
    return `${from === 'app' ? '../' : '../../'}${target}`;
  }
  if (from === 'components') return `./${name}`;
  return `${from === 'app' ? './' : '../'}components/${name}`;
}

/** Ids written inside a component: prefixed per instance with `useId()` so copies don't collide. */
interface IdScope {
  names: Set<string>;
  /** The variable holding `useId()`. */
  uid: string;
}

/** Attributes whose value names other elements' ids. */
const ID_REF_ATTRS = new Set([
  'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'aria-activedescendant',
  'aria-details', 'aria-errormessage', 'aria-flowto', 'for', 'htmlFor', 'list', 'form', 'headers',
]);

/** `id={`${uid}-panel`}`, or null when nothing in the value is a component-local id. */
function idAttr(key: string, value: unknown, ids: IdScope | null): string | null {
  if (!ids || typeof value !== 'string') return null;
  const parts = value.split(/\s+/).filter(Boolean);
  if (!parts.some(p => ids.names.has(p))) return null;
  const esc = (t: string) => t.replace(/[\\`]/g, m => `\\${m}`).replace(/\$\{/g, '\\${');
  const tpl = parts.map(p => (ids.names.has(p) ? `\${${ids.uid}}-${esc(p)}` : esc(p))).join(' ');
  return `${key}={\`${tpl}\`}`;
}

/** A state variable in scope: the names generated code uses for it. */
interface StateRef {
  js: string;
  setter: string;
  type: StateType;
  /** Some node inside shows/hides with it (so a toggle reports aria-expanded). */
  controls: boolean;
  /** The id of the first such node, for aria-controls. */
  controlsId?: string;
  /** A dialog opens with it (aria-haspopup on whatever sets it true). */
  dialog: boolean;
}

interface Ctx {
  config: Config;
  /** Props and logic names (components only). */
  scope: Scope;
  /** State visible here, by its YAML name. */
  state: ReadonlyMap<string, StateRef>;
  /** `useState` lines for the file's function, in tree order. Shared by the whole file. */
  hooks: string[];
  /** Identifiers the function already uses; state names avoid them. Shared by the whole file. */
  used: Set<string>;
  /** Primitive component names used by the file. */
  primitives: Set<string>;
  /** Generated components used by the file. */
  components: Set<string>;
  /** Inside a component definition: emit `{children}` / `{name}` for slots. */
  inComponent: boolean;
  /** Component-local ids (components only). */
  ids: IdScope | null;
}

/** Interpolation scope: props/logic plus state. */
function scopeOf(ctx: Ctx): Scope {
  if (ctx.state.size === 0) return ctx.scope;
  const out = new Map(ctx.scope ?? []);
  for (const [name, ref] of ctx.state) out.set(name, ref.js);
  return out;
}

const refOf = (ctx: Ctx) => (name: string) => ctx.state.get(name)!.js;
const setterOf = (ctx: Ctx) => (name: string) => ctx.state.get(name)!.setter;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function freshName(name: string, used: Set<string>): string {
  let out = name;
  for (let n = 2; used.has(out); n++) out = `${name}${n}`;
  used.add(out);
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Nodes below `node` in the same file (through instance children and slots, not into components). */
function descendants(node: Node): Node[] {
  const out: Node[] = [];
  const visit = (n: Node) => {
    out.push(n);
    if (isInstance(n)) {
      n.children?.forEach(visit);
      Object.values(n.slots ?? {}).forEach(list => list.forEach(visit));
    } else if ('children' in n && n.children) n.children.forEach(visit);
  };
  if (isInstance(node)) {
    node.children?.forEach(visit);
    Object.values(node.slots ?? {}).forEach(list => list.forEach(visit));
  } else if ('children' in node && node.children) node.children.forEach(visit);
  return out;
}

function controlsOf(node: Node, name: string): Pick<StateRef, 'controls' | 'controlsId' | 'dialog'> {
  let controls = false;
  let controlsId: string | undefined;
  let dialog = false;
  for (const d of descendants(node)) {
    const n = d as unknown as Record<string, unknown>;
    const shows = typeof n.visibleWhen === 'string' && parseCondition(n.visibleWhen)?.name === name;
    const hides = Object.entries((n.when as Record<string, Record<string, unknown>>) ?? {})
      .some(([k, style]) => parseCondition(k)?.name === name && 'hidden' in style);
    if (!shows && !hides) continue;
    controls = true;
    if (!controlsId && typeof n.id === 'string') controlsId = n.id;
    if (shows && d.type === 'frame' && (d as { tag?: string }).tag === 'dialog') dialog = true;
  }
  return { controls, controlsId, dialog };
}

/** A frame's `state:` becomes `useState` hooks in the file's function; returns the context its subtree sees. */
function declareState(node: Node, ctx: Ctx): Ctx {
  const state = (node as { state?: Record<string, string | number | boolean> }).state;
  if (!state || Object.keys(state).length === 0) return ctx;
  const next = new Map(ctx.state);
  for (const [name, value] of Object.entries(state)) {
    const js = freshName(name, ctx.used);
    const setter = freshName(`set${capitalize(js)}`, ctx.used);
    ctx.hooks.push(`const [${js}, ${setter}] = useState(${JSON.stringify(value)});`);
    next.set(name, { js, setter, type: typeOfValue(value), ...controlsOf(node, name) });
  }
  return { ...ctx, state: next };
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function commonAttrs(node: Exclude<Node, { type: 'slot' }>, ctx: Ctx): string[] {
  const out: string[] = [];
  if (node.id) out.push(idAttr('id', node.id, ctx.ids) ?? attr('id', node.id, null));
  return out;
}

/** `attrs:`; a whole-value `{condition}` over state becomes a live expression (`aria-selected={tab === 0}`). */
function extraAttrs(node: Exclude<Node, { type: 'slot' }>, ctx: Ctx): string[] {
  return Object.entries(node.attrs ?? {}).map(([k, v]) => {
    const key = k === 'class' ? 'className' : k;
    const c = attrCondition(v, name => ctx.state.has(name));
    if (c) return `${key}={${conditionJs(c, refOf(ctx))}}`;
    const ref = key === 'id' || ID_REF_ATTRS.has(key) ? idAttr(key, v, ctx.ids) : null;
    if (ref) return ref;
    return valueAttr(key, v, scopeOf(ctx), ctx.inComponent);
  });
}

/** When emitting a component's root: its classes merge with the instance's, and rest props land on it. */
interface RootEmit {
  variants: ClassVariants;
}

/** The part of the className that changes with state: `open ? "a" : "b"`, `tab === 1 ? "a" : undefined`. */
function variantExpr(v: ClassVariants, ctx: Ctx): string | null {
  const split = splitVariants(v);
  const ref = refOf(ctx);
  const lit = (classes: string) => (classes ? JSON.stringify(classes) : 'undefined');
  if (split.variants.every(x => !x.classes) && !split.base) return null;
  if (split.variants.length === 1) {
    const [only] = split.variants;
    if (!split.base) return `${conditionJs(only.condition, ref)} && ${lit(only.classes)}`;
    if (!only.classes) return `${negatedConditionJs(only.condition, ref)} && ${lit(split.base)}`;
    return `${conditionJs(only.condition, ref)} ? ${lit(only.classes)} : ${lit(split.base)}`;
  }
  const chain = split.variants.map(x => `${conditionJs(x.condition, ref)} ? ${lit(x.classes)} : `).join('');
  return chain + lit(split.base);
}

function classAttrs(v: ClassVariants, ctx: Ctx, root?: RootEmit): string[] {
  const live = v.variants.length ? variantExpr(v, ctx) : null;
  const split = live ? splitVariants(v) : null;
  const fixed = split ? split.common : v.base;
  if (root) {
    const parts = [JSON.stringify(fixed), ...(live ? [live] : []), 'overrides', 'className'];
    return [`className={cx(${parts.join(', ')})}`];
  }
  if (!live) return fixed ? [`className="${fixed}"`] : [];
  ctx.primitives.add('cx');
  return [`className={cx(${[...(fixed ? [JSON.stringify(fixed)] : []), live].join(', ')})}`];
}

/** `on:` as React handlers, plus the ARIA state a reader needs to follow along. */
function eventAttrs(node: Exclude<Node, { type: 'slot' }>, ctx: Ctx): string[] {
  const on = (node as { on?: Record<string, string> }).on;
  if (!on) return [];
  const out: string[] = [];
  for (const [event, src] of Object.entries(on)) {
    const action = parseAction(src);
    if (!action || !ctx.state.has(action.name)) continue;
    const stmt = actionJs(action, refOf(ctx), setterOf(ctx));
    const ref = ctx.state.get(action.name)!;

    if (event === 'click') {
      if (node.type === 'link') {
        out.push((node as { href: string }).href.startsWith('#')
          ? `onClick={(event) => { event.preventDefault(); ${stmt}; }}`
          : `onClick={() => ${stmt}}`);
      } else {
        const tag = (node as { tag?: string }).tag ?? (node.type === 'text' ? 'p' : 'div');
        if (INTERACTIVE_TAGS.has(tag)) {
          if (tag === 'button' && !node.attrs?.type) out.push('type="button"');
          out.push(`onClick={() => ${stmt}}`);
        } else {
          ctx.primitives.add('onPress');
          out.push(`{...onPress(() => ${stmt})}`);
        }
      }
      if (action.kind === 'toggle' && ref.controls) {
        out.push(`aria-expanded={${ref.js}}`);
        if (ref.controlsId) out.push(idAttr('aria-controls', ref.controlsId, ctx.ids) ?? attr('aria-controls', ref.controlsId, null));
      }
      if (action.kind === 'set' && action.value === true && ref.dialog) out.push('aria-haspopup="dialog"');
    } else if (event === 'submit') {
      out.push(`onSubmit={(event) => { event.preventDefault(); ${stmt}; }}`);
    } else {
      out.push(`${event === 'mouseenter' ? 'onMouseEnter' : 'onMouseLeave'}={() => ${stmt}}`);
    }
  }
  return out;
}

/** `{open && (...)}` around a node with `visibleWhen`. */
function wrapVisible(node: Node, emitted: string, indent: number, ctx: Ctx): string {
  const src = (node as { visibleWhen?: string }).visibleWhen;
  const c = src ? parseCondition(src) : null;
  if (!c || !ctx.state.has(c.name)) return emitted;
  const pad = ' '.repeat(indent);
  return `${pad}{${conditionJs(c, refOf(ctx))} && (\n${emitted}\n${pad})}`;
}

export function emitNode(node: Node, indent: number, parent: Flows, ctx: Ctx, root?: RootEmit): string {
  const pad = ' '.repeat(indent);

  if (node.type === 'slot') {
    const name = node.name ?? 'children';
    return `${pad}{${name}}`;
  }

  if (isInstance(node)) {
    return wrapVisible(node, emitInstance(node, indent + (node.visibleWhen ? 2 : 0), parent, ctx, null), indent, ctx);
  }

  const visibleWhen = (node as { visibleWhen?: string }).visibleWhen;
  const dialog = node.type === 'frame' && node.tag === 'dialog' ? parseCondition(visibleWhen ?? '') : null;
  const visible = !!visibleWhen && !dialog && ctx.state.has(parseCondition(visibleWhen)?.name ?? '');
  const at = indent + (visible ? 2 : 0);
  const own = declareState(node, ctx);
  const scope = scopeOf(own);
  const use = (name: string) => {
    ctx.primitives.add(name);
    return name;
  };
  const classes = (n: Exclude<Node, { type: 'slot' }>) => classAttrs(root ? root.variants : nodeClassVariants(n, parent), own, root);
  const tail = (n: Exclude<Node, { type: 'slot' }>) => [
    ...commonAttrs(n, own),
    ...classes(n),
    ...extraAttrs(n, own),
    ...eventAttrs(n, own),
    ...(root ? ['{...rest}'] : []),
  ];

  let out: string;
  switch (node.type) {
    case 'frame': {
      const flows = childFlows(sourceOf(node, 'frame'));
      const children = (node.children ?? []).map(c => emitNode(c, at + 2, flows, own));
      if (dialog && ctx.state.has(dialog.name)) {
        const ref = ctx.state.get(dialog.name)!;
        const attrs = [
          `open={${conditionJs(dialog, refOf(ctx))}}`,
          `onClose={() => ${ref.setter}(${dialog.negate ? 'true' : 'false'})}`,
          ...tail(node),
        ];
        out = element(use('Dialog'), attrs, children, at);
        break;
      }
      const attrs = [...(node.tag && node.tag !== 'div' ? [`tag="${node.tag}"`] : []), ...tail(node)];
      out = element(use('Frame'), attrs, children, at);
      break;
    }
    case 'text': {
      const attrs = [...(node.tag && node.tag !== 'p' ? [`tag="${node.tag}"`] : []), ...tail(node)];
      out = element(use('Text'), attrs, [textChild(node.content, scope)], at);
      break;
    }
    case 'image': {
      const attrs = [
        attr('src', node.src, scope),
        ...(node.alt !== undefined ? [attr('alt', node.alt, scope)] : []),
        ...tail(node),
      ];
      out = element(use('Image'), attrs, null, at);
      break;
    }
    case 'link': {
      const attrs = [attr('href', node.href, scope), ...(node.newTab ? ['newTab'] : []), ...tail(node)];
      let children: string[] = [];
      if (node.content !== undefined) children = [textChild(node.content, scope)];
      else if (node.children) {
        const flows = childFlows(sourceOf(node, 'link'));
        children = node.children.map(c => emitNode(c, at + 2, flows, own));
      }
      out = element(use('Link'), attrs, children, at);
      break;
    }
    case 'input': {
      const attrs = [
        ...(node.multiline ? ['multiline'] : node.inputType && node.inputType !== 'text' ? [`type="${node.inputType}"`] : []),
        ...(node.field ? [attr('name', node.field, null)] : []),
        ...(node.placeholder !== undefined ? [attr('placeholder', node.placeholder, scope)] : []),
        ...(node.required ? ['required'] : []),
        ...tail(node),
      ];
      out = element(use('Input'), attrs, null, at);
      break;
    }
  }
  return visible ? wrapVisible(node, out, indent, ctx) : out;
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

/**
 * @param forward when this instance is a component's root, the outer component's
 *   `overrides` / `className` / rest props are forwarded to it.
 */
function emitInstance(node: InstanceNode, indent: number, parent: Flows, ctx: Ctx, forward: { overridesDefault: string } | null): string {
  const def = ctx.config.components![node.type];
  ctx.components.add(node.type);
  const declared = (def.props ?? {}) as Record<string, PropDef>;
  const scope = scopeOf(ctx);
  const attrs: string[] = [];

  for (const [prop, value] of Object.entries(node.props ?? {})) {
    const type = declared[prop]?.type;
    const v = typeof value === 'number' && type && type !== 'number' ? String(value) : value;
    attrs.push(valueAttr(prop, v, scope, ctx.inComponent));
  }

  for (const [slot, list] of Object.entries(node.slots ?? {})) {
    const flows = slotParentFlows(ctx.config, node.type, slot);
    // Wrapped attributes sit at indent + 2, so the fragment goes one level deeper.
    const inner = list.map(c => emitNode(c, indent + 6, flows, ctx));
    const pad = (n: number) => ' '.repeat(indent + n);
    attrs.push(`${slot}={\n${pad(4)}<>\n${inner.join('\n')}\n${pad(4)}</>\n${pad(2)}}`);
  }

  if (isFileComponent(def)) {
    // Your own component: instance styles arrive as plain classes on className.
    if (forward) {
      ctx.primitives.add('cx');
      attrs.push(`className={cx(overrides ?? ${JSON.stringify(forward.overridesDefault)}, className)}`, '{...rest}');
    } else {
      const classes = [rootOverrides(ctx.config, def, node, parent), node.className].filter(Boolean).join(' ');
      attrs.push(...commonAttrs(node, ctx));
      if (classes) attrs.push(`className="${classes}"`);
      attrs.push(...extraAttrs(node, ctx));
    }
  } else if (forward) {
    attrs.push(`overrides={overrides ?? ${JSON.stringify(forward.overridesDefault)}}`, 'className={className}', '{...rest}');
  } else {
    const overrides = rootOverrides(ctx.config, def, node, parent);
    const fallback = rootOverrides(ctx.config, def, null, COLUMN_FLOWS);
    if (overrides !== fallback) attrs.push(`overrides="${overrides}"`);
    attrs.push(...commonAttrs(node, ctx));
    if (node.className) attrs.push(`className="${node.className}"`);
    attrs.push(...extraAttrs(node, ctx));
  }

  const flows = slotParentFlows(ctx.config, node.type, undefined);
  const children = (node.children ?? []).map(c => emitNode(c, indent + 2, flows, ctx));
  return element(node.type, attrs, children, indent);
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** Primitive components first (Frame, Text...), then helpers (Dialog, cx, onPress). */
const PRIMITIVE_ORDER = [...Object.values(PRIMITIVE_COMPONENTS), 'Dialog', 'cx', 'onPress'];

function primitiveImport(ctx: Ctx, from: string): string | null {
  const names = PRIMITIVE_ORDER.filter(n => ctx.primitives.has(n));
  return names.length ? `import { ${names.join(', ')} } from '${from}';` : null;
}

/** Names generated code itself uses in a file, which state variables must not shadow. */
function baseUsed(config: Config): Set<string> {
  return new Set([...PRIMITIVE_ORDER, ...Object.keys(config.components ?? {}), 'useState', 'useSEO', 'React']);
}

function hookLines(ctx: Ctx): string {
  return ctx.hooks.map(h => `  ${h}\n`).join('');
}

export function pageSource(config: Config, page: Page, parent: Flows): string {
  const ctx: Ctx = {
    config, scope: null, state: new Map(), hooks: [], used: baseUsed(config),
    primitives: new Set(), components: new Set(), inComponent: false, ids: null,
  };
  const sections = page.sections.map(s => emitNode(s, 6, parent, ctx));
  const name = pageComponentName(page.name);

  const imports = [
    ...(ctx.hooks.length ? [`import { useState } from 'react';`] : []),
    primitiveImport(ctx, '../primitives'),
    ...[...ctx.components].sort().map(c => `import ${c} from '${componentImport(config, c, 'pages')}';`),
    `import useSEO from '../hooks/useSEO';`,
  ].filter(Boolean);

  const seo = `useSEO({ title: ${JSON.stringify(page.title ?? page.name)}, description: ${JSON.stringify(page.description ?? '')} });`;
  const body = sections.length ? `    <>\n${sections.join('\n')}\n    </>` : '    <></>';

  return `${imports.join('\n')}

export default function ${name}() {
  ${seo}
${ctx.hooks.length ? '\n' + hookLines(ctx) : ''}
  return (
${body}
  );
}
`;
}

const TS_TYPE: Record<PropDef['type'], string> = {
  text: 'string', url: 'string', image: 'string', number: 'number', boolean: 'boolean',
};

export function componentSource(config: Config, name: string, def: ComponentDef): string {
  const props = (def.props ?? {}) as Record<string, PropDef>;
  const scopeNames = new Set([...Object.keys(props), ...declaredNames(def.logic)]);
  const slots = collectSlots(def);
  slots.named.forEach(s => scopeNames.add(s));
  if (slots.hasDefault) scopeNames.add('children');
  const used = baseUsed(config);
  [...scopeNames, 'overrides', 'className', 'rest', 'children'].forEach(n => used.add(n));
  const root = def.root!;
  const localIds = new Set([root, ...descendants(root)]
    .flatMap(n => [(n as { id?: string }).id, (n as { attrs?: Record<string, unknown> }).attrs?.id])
    .filter((id): id is string => typeof id === 'string' && id.length > 0));
  const ids: IdScope | null = localIds.size ? { names: localIds, uid: freshName('uid', used) } : null;
  const ctx: Ctx = {
    config, scope: identityScope(scopeNames), state: new Map(), hooks: [], used,
    primitives: new Set(), components: new Set(), inComponent: true, ids,
  };
  const overridesDefault = rootOverrides(config, def, null, COLUMN_FLOWS);

  let body: string;
  if (isInstance(root)) {
    body = emitInstance(root, 4, COLUMN_FLOWS, ctx, { overridesDefault });
  } else {
    // Overridable styles (sizing, hidden, fill, color, border) travel per instance through the `overrides` prop.
    ctx.primitives.add('cx');
    body = emitNode(root, 4, COLUMN_FLOWS, ctx, { variants: componentRestVariants(def) });
  }

  const propLines = Object.entries(props).map(([p, d]) => `  ${p}?: ${TS_TYPE[d.type]};`);
  if (slots.hasDefault) propLines.push('  children?: ReactNode;');
  for (const s of slots.named) propLines.push(`  ${s}?: ReactNode;`);
  propLines.push('  /** Size, fill, color and border classes for this copy; they replace the component\'s defaults. */');
  propLines.push('  overrides?: string;');

  // Declared props and slots win over same-named HTML attributes (title, color, ...).
  const omit = [...Object.keys(props), ...slots.named];
  const extendsClause = omit.length
    ? `Omit<HTMLAttributes<HTMLElement>, ${omit.map(o => `'${o}'`).join(' | ')}>`
    : 'HTMLAttributes<HTMLElement>';

  const params = [
    ...Object.entries(props).map(([p, d]) => (d.default !== undefined ? `${p} = ${JSON.stringify(d.default)}` : p)),
    ...(slots.hasDefault ? ['children'] : []),
    ...slots.named,
    isInstance(root) || !overridesDefault ? 'overrides' : `overrides = ${JSON.stringify(overridesDefault)}`,
    'className',
    '...rest',
  ];

  const reactTypes = ['HTMLAttributes', ...(slots.hasDefault || slots.named.size ? ['ReactNode'] : [])];
  // A component whose `imports:` already bring useState (hand-written logic) doesn't get a second one.
  const importsFromReact = (hook: string) =>
    (def.imports ?? []).some(l => new RegExp(`\\b${hook}\\b`).test(l) && /from\s+['"]react['"]/.test(l));
  const reactHooks = [
    ...(ids && !importsFromReact('useId') ? ['useId'] : []),
    ...(ctx.hooks.length && !importsFromReact('useState') ? ['useState'] : []),
  ];
  const imports = [
    ...(reactHooks.length ? [`import { ${reactHooks.join(', ')} } from 'react';`] : []),
    `import type { ${reactTypes.join(', ')} } from 'react';`,
    ...(def.imports ?? []),
    primitiveImport(ctx, '../primitives'),
    ...[...ctx.components].filter(c => c !== name).sort().map(c => `import ${c} from '${componentImport(config, c, 'components')}';`),
  ].filter(Boolean);

  if (ids) ctx.hooks.unshift(`const ${ids.uid} = useId();`);
  const logic = hookLines(ctx) + (ctx.hooks.length && def.logic ? '\n' : '') + (def.logic
    ? def.logic.trimEnd().split('\n').map(l => (l ? `  ${l}` : '')).join('\n') + '\n'
    : '') + (ctx.hooks.length || def.logic ? '\n' : '');

  return `${imports.join('\n')}

export interface ${name}Props extends ${extendsClause} {
${propLines.join('\n')}
}

export default function ${name}({ ${params.join(', ')} }: ${name}Props) {
${logic}  return (
${body}
  );
}
`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function appSource(config: Config, routing: boolean): string {
  const pages = config.pages.map(p => ({ page: p, name: pageComponentName(p.name), layout: layoutOf(config, p) }));
  const layouts = [...new Set(pages.map(p => p.layout).filter((l): l is string => !!l))];
  const imports = [
    ...(routing ? [`import { BrowserRouter, Routes, Route${layouts.length ? ', Outlet' : ''} } from 'react-router-dom';`, `import ScrollToHash from './ScrollToHash';`] : []),
    ...layouts.sort().map(l => `import ${l} from '${componentImport(config, l, 'app')}';`),
    ...(routing ? pages : pages.slice(0, 1)).map(p => `import ${p.name} from './pages/${p.name}';`),
  ];

  if (!routing) {
    const { name, layout } = pages[0];
    const inner = layout ? `    <${layout}>\n      <${name} />\n    </${layout}>` : `    <${name} />`;
    return `${imports.join('\n')}

export default function App() {
  return (
${inner}
  );
}
`;
  }

  const route = (p: (typeof pages)[number], pad: string) => `${pad}<Route path=${JSON.stringify(p.page.path)} element={<${p.name} />} />`;
  const lines: string[] = [];
  for (const layout of layouts) {
    lines.push(`        <Route element={<${layout}><Outlet /></${layout}>}>`);
    pages.filter(p => p.layout === layout).forEach(p => lines.push(route(p, '          ')));
    lines.push('        </Route>');
  }
  pages.filter(p => !p.layout).forEach(p => lines.push(route(p, '        ')));

  return `${imports.join('\n')}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToHash />
      <Routes>
${lines.join('\n')}
      </Routes>
    </BrowserRouter>
  );
}
`;
}

