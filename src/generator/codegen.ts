/**
 * Config -> TSX source for pages, components and App.
 *
 * Every node renders through a primitive (Frame, Text, Image, Link, Input) or
 * a generated component. Styles compile to Tailwind classes here, with the
 * parent's flow known at every breakpoint, so `width: fill` comes out right.
 */

import {
  COLUMN_FLOWS, childFlows, compileClasses, joinClasses, PRIMITIVE_COMPONENTS, collectSlots, pageComponentName, isInstance,
  sourceOf, isLinkContainer, slotParentFlows, rootOverrides, componentRestClasses, layoutOf,
} from '../core/index.ts';
import type { ComponentDef, Config, Flows, InstanceNode, Node, Page, PropDef } from '../core/index.ts';
import { attr, declaredNames, element, textChild, valueAttr } from './jsx.ts';
import type { Scope } from './jsx.ts';

interface Ctx {
  config: Config;
  scope: Scope;
  /** Primitive component names used by the file. */
  primitives: Set<string>;
  /** Generated components used by the file. */
  components: Set<string>;
  /** Inside a component definition: emit `{children}` / `{name}` for slots. */
  inComponent: boolean;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function commonAttrs(node: Exclude<Node, { type: 'slot' }>, ctx: Ctx): string[] {
  const out: string[] = [];
  if (node.id) out.push(attr('id', node.id, null));
  return out;
}

function extraAttrs(node: Exclude<Node, { type: 'slot' }>, ctx: Ctx): string[] {
  return Object.entries(node.attrs ?? {}).map(([k, v]) => valueAttr(k === 'class' ? 'className' : k, v, ctx.scope));
}

/** When emitting a component's root: its className merges with the instance's, and rest props land on it. */
interface RootEmit {
  classExpr: string;
}

function classAttrs(classes: string, root?: RootEmit): string[] {
  if (root) return [`className={${root.classExpr}}`];
  return classes ? [`className="${classes}"`] : [];
}

export function emitNode(node: Node, indent: number, parent: Flows, ctx: Ctx, root?: RootEmit): string {
  const pad = ' '.repeat(indent);

  if (node.type === 'slot') {
    const name = node.name ?? 'children';
    return `${pad}{${name}}`;
  }

  if (isInstance(node)) return emitInstance(node, indent, parent, ctx, null);

  const use = (name: string) => {
    ctx.primitives.add(name);
    return name;
  };

  switch (node.type) {
    case 'frame': {
      const cls = joinClasses(compileClasses(sourceOf(node, 'frame', true), parent), node.className);
      const attrs = [
        ...(node.tag && node.tag !== 'div' ? [`tag="${node.tag}"`] : []),
        ...commonAttrs(node, ctx),
        ...classAttrs(cls, root),
        ...extraAttrs(node, ctx),
        ...(root ? ['{...rest}'] : []),
      ];
      const flows = childFlows(sourceOf(node, 'frame'));
      const children = (node.children ?? []).map(c => emitNode(c, indent + 2, flows, ctx));
      return element(use('Frame'), attrs, children, indent);
    }
    case 'text': {
      const cls = joinClasses(compileClasses(sourceOf(node, 'text'), parent), node.className);
      const attrs = [
        ...(node.tag && node.tag !== 'p' ? [`tag="${node.tag}"`] : []),
        ...commonAttrs(node, ctx),
        ...classAttrs(cls, root),
        ...extraAttrs(node, ctx),
        ...(root ? ['{...rest}'] : []),
      ];
      return element(use('Text'), attrs, [textChild(node.content, ctx.scope)], indent);
    }
    case 'image': {
      const cls = joinClasses(compileClasses(sourceOf(node, 'image'), parent), node.className);
      const attrs = [
        attr('src', node.src, ctx.scope),
        ...(node.alt !== undefined ? [attr('alt', node.alt, ctx.scope)] : []),
        ...commonAttrs(node, ctx),
        ...classAttrs(cls, root),
        ...extraAttrs(node, ctx),
        ...(root ? ['{...rest}'] : []),
      ];
      return element(use('Image'), attrs, null, indent);
    }
    case 'link': {
      const container = isLinkContainer(node);
      const cls = joinClasses(compileClasses(sourceOf(node, 'link', container), parent), node.className);
      const attrs = [
        attr('href', node.href, ctx.scope),
        ...(node.newTab ? ['newTab'] : []),
        ...commonAttrs(node, ctx),
        ...classAttrs(cls, root),
        ...extraAttrs(node, ctx),
        ...(root ? ['{...rest}'] : []),
      ];
      let children: string[] = [];
      if (node.content !== undefined) children = [textChild(node.content, ctx.scope)];
      else if (node.children) {
        const flows = childFlows(sourceOf(node, 'link'));
        children = node.children.map(c => emitNode(c, indent + 2, flows, ctx));
      }
      return element(use('Link'), attrs, children, indent);
    }
    case 'input': {
      const cls = joinClasses(compileClasses(sourceOf(node, 'input'), parent), node.className);
      const attrs = [
        ...(node.multiline ? ['multiline'] : node.inputType && node.inputType !== 'text' ? [`type="${node.inputType}"`] : []),
        ...(node.field ? [attr('name', node.field, null)] : []),
        ...(node.placeholder !== undefined ? [attr('placeholder', node.placeholder, ctx.scope)] : []),
        ...(node.required ? ['required'] : []),
        ...commonAttrs(node, ctx),
        ...classAttrs(cls, root),
        ...extraAttrs(node, ctx),
        ...(root ? ['{...rest}'] : []),
      ];
      return element(use('Input'), attrs, null, indent);
    }
  }
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
  const attrs: string[] = [];

  for (const [prop, value] of Object.entries(node.props ?? {})) {
    const type = declared[prop]?.type;
    const v = typeof value === 'number' && type && type !== 'number' ? String(value) : value;
    attrs.push(valueAttr(prop, v, ctx.scope));
  }

  for (const [slot, list] of Object.entries(node.slots ?? {})) {
    const flows = slotParentFlows(ctx.config, node.type, slot);
    // Wrapped attributes sit at indent + 2, so the fragment goes one level deeper.
    const inner = list.map(c => emitNode(c, indent + 6, flows, ctx));
    const pad = (n: number) => ' '.repeat(indent + n);
    attrs.push(`${slot}={\n${pad(4)}<>\n${inner.join('\n')}\n${pad(4)}</>\n${pad(2)}}`);
  }

  if (forward) {
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

function primitiveImport(ctx: Ctx, from: string, extra: string[] = []): string | null {
  const order = Object.values(PRIMITIVE_COMPONENTS);
  const names = [...order.filter(n => ctx.primitives.has(n)), ...extra];
  return names.length ? `import { ${names.join(', ')} } from '${from}';` : null;
}

export function pageSource(config: Config, page: Page, parent: Flows): string {
  const ctx: Ctx = { config, scope: null, primitives: new Set(), components: new Set(), inComponent: false };
  const sections = page.sections.map(s => emitNode(s, 6, parent, ctx));
  const name = pageComponentName(page.name);

  const imports = [
    primitiveImport(ctx, '../primitives'),
    ...[...ctx.components].sort().map(c => `import ${c} from '../components/${c}';`),
    `import useSEO from '../hooks/useSEO';`,
  ].filter(Boolean);

  const seo = `useSEO({ title: ${JSON.stringify(page.title ?? page.name)}, description: ${JSON.stringify(page.description ?? '')} });`;
  const body = sections.length ? `    <>\n${sections.join('\n')}\n    </>` : '    <></>';

  return `${imports.join('\n')}

export default function ${name}() {
  ${seo}

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
  const ctx: Ctx = { config, scope: scopeNames, primitives: new Set(), components: new Set(), inComponent: true };
  const root = def.root!;
  const overridesDefault = rootOverrides(config, def, null, COLUMN_FLOWS);

  let body: string;
  if (isInstance(root)) {
    body = emitInstance(root, 4, COLUMN_FLOWS, ctx, { overridesDefault });
  } else {
    // Overridable styles (sizing, hidden, fill, color, border) travel per instance through the `overrides` prop.
    const rest = componentRestClasses(def);
    body = emitNode(root, 4, COLUMN_FLOWS, ctx, { classExpr: `cx(${JSON.stringify(rest)}, overrides, className)` });
  }

  const propLines = Object.entries(props).map(([p, d]) => `  ${p}?: ${TS_TYPE[d.type]};`);
  if (slots.hasDefault) propLines.push('  children?: ReactNode;');
  for (const s of slots.named) propLines.push(`  ${s}?: ReactNode;`);
  propLines.push('  /** Sizing classes from where the instance is placed; replaces the root\'s defaults. */');
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
  const imports = [
    `import type { ${reactTypes.join(', ')} } from 'react';`,
    ...(def.imports ?? []),
    primitiveImport(ctx, '../primitives', isInstance(root) ? [] : ['cx']),
    ...[...ctx.components].filter(c => c !== name).sort().map(c => `import ${c} from './${c}';`),
  ].filter(Boolean);

  const logic = def.logic
    ? def.logic.trimEnd().split('\n').map(l => (l ? `  ${l}` : '')).join('\n') + '\n\n'
    : '';

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
    ...layouts.sort().map(l => `import ${l} from './components/${l}';`),
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

