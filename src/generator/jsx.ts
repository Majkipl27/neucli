/**
 * Low-level JSX source helpers: escaping, attribute values, interpolation.
 */

/** `{name}` or `{obj.field}` inside a string, when name is in scope. */
const INTERPOLATION = /\{\s*([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)\s*\}/g;

/**
 * Variables a string may interpolate. Outside components there are none, so
 * braces render literally. Inside a component: its props and whatever its
 * `logic` declares.
 */
export type Scope = Set<string> | null;

function interpolations(str: string, scope: Scope): RegExpMatchArray[] {
  if (!scope) return [];
  return [...str.matchAll(INTERPOLATION)].filter(m => scope.has(m[1]));
}

function escapeTemplateChunk(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** A JS expression for the string, interpolating in-scope `{ident}`. */
export function stringExpr(str: string, scope: Scope): string {
  const matches = interpolations(str, scope);
  if (matches.length === 0) return JSON.stringify(str);
  if (matches.length === 1 && matches[0][0] === str) return matches[0][1] + matches[0][2];
  let out = '';
  let last = 0;
  for (const m of matches) {
    out += escapeTemplateChunk(str.slice(last, m.index));
    out += '${' + m[1] + m[2] + '}';
    last = m.index! + m[0].length;
  }
  out += escapeTemplateChunk(str.slice(last));
  return '`' + out + '`';
}

/** `key="value"` or `key={expr}` for a string attribute. */
export function attr(key: string, value: string, scope: Scope): string {
  if (interpolations(value, scope).length > 0) return `${key}={${stringExpr(value, scope)}}`;
  // JSX attribute strings decode HTML entities and can't contain `"`.
  if (/["&]/.test(value)) return `${key}={${JSON.stringify(value)}}`;
  return `${key}="${value}"`;
}

/**
 * Any attribute value. Inside a component, a value that is entirely `{expr}`
 * is passed through as code, e.g. `onClick: "{increment}"`.
 */
export function valueAttr(key: string, value: unknown, scope: Scope): string {
  if (typeof value === 'string') {
    if (scope && /^\{[^{}]+\}$/.test(value)) return `${key}=${value}`;
    return attr(key, value, scope);
  }
  if (typeof value === 'number') return `${key}={${value}}`;
  if (typeof value === 'boolean') return value ? key : `${key}={false}`;
  return `${key}={${JSON.stringify(value)}}`;
}

/** A JSX child rendering the string as text. */
export function textChild(str: string, scope: Scope): string {
  if (interpolations(str, scope).length > 0) return `{${stringExpr(str, scope)}}`;
  if (/[{}<>&]/.test(str) || str !== str.trim() || str === '') return `{${JSON.stringify(str)}}`;
  return str;
}

/** Names a component's `logic` declares (const/let/var/function, including destructuring). */
export function declaredNames(logic: string | undefined): string[] {
  if (!logic) return [];
  const names = new Set<string>();
  for (const m of logic.matchAll(/\b(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/g)) {
    for (const id of m[1].matchAll(/[A-Za-z_$][\w$]*/g)) names.add(id[0]);
  }
  for (const m of logic.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return [...names];
}

/**
 * Render an element. Short attribute lists stay on one line; long ones wrap
 * one attribute per line.
 */
export function element(name: string, attrs: string[], children: string[] | null, indent: number): string {
  const pad = ' '.repeat(indent);
  const oneLine = attrs.length ? ' ' + attrs.join(' ') : '';
  const wrap = attrs.length > 3 || attrs.some(a => a.includes('\n')) || (pad + '<' + name + oneLine + '>').length > 100;
  const attrStr = wrap ? '\n' + attrs.map(a => `${pad}  ${a}`).join('\n') + `\n${pad}` : oneLine;

  if (!children || children.length === 0) return `${pad}<${name}${attrStr}${wrap ? '' : ' '}/>`;
  // Single short text child stays inline: <Text>Hello</Text>
  if (children.length === 1 && !children[0].includes('\n') && !children[0].startsWith(' ')) {
    const inline = `${pad}<${name}${attrStr}>${children[0]}</${name}>`;
    if (!wrap && inline.length <= 120) return inline;
    return `${pad}<${name}${attrStr}>\n${pad}  ${children[0]}\n${pad}</${name}>`;
  }
  return `${pad}<${name}${attrStr}>\n${children.join('\n')}\n${pad}</${name}>`;
}
