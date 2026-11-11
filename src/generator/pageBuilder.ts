import { resolveComponentTemplate } from './componentResolver.ts';
import type { Page, Config, Node } from './types.ts';

export function buildPageSource(page: Page, globals: Config['globals']): string {
  const imports = new Map<string, string>();

  function collectImports(node: Node) {
    if (!node) return;
    const { componentName } = resolveComponentTemplate(node.type);
    if (!imports.has(componentName)) {
      imports.set(componentName, `../components/${componentName}`);
    }
    if (node.children) node.children.forEach(collectImports);
  }

  page.sections.forEach(collectImports);
  imports.set('useSEO', '../hooks/useSEO');

  const importLines = [...imports.entries()]
    .map(([name, importPath]) => `import ${name} from '${importPath}';`)
    .join('\n');

  const sections: string[] = [];
  page.sections.forEach(s => {
    const jsx = buildJSX(s, 6);
    if (jsx) sections.push(jsx);
  });

  const pageName = sanitizeName(page.name);
  const pageTitle = page.title || pageName;
  const pageDescription = page.meta?.description || '';

  return `${importLines}

export default function ${pageName}() {
  useSEO({ title: ${JSON.stringify(pageTitle)}, description: ${JSON.stringify(pageDescription)} });

  return (
    <>

${sections.join('\n')}
    </>
  );
}
`;
}

/**
 * @param interpolate Treat `{ident}` inside strings as references to in-scope
 *   variables. Only custom component children have a scope (their `logic`),
 *   so pages and globals render braces literally.
 */
export function buildJSX(node: Node, indent: number, interpolate = false): string | undefined {
  const { componentName } = resolveComponentTemplate(node.type);
  const spaces = ' '.repeat(indent);
  const propsStr = serializeProps(node, interpolate);

  const hasChildren = node.children && node.children.length > 0;
  const hasText = node.text != null;

  if (!hasChildren && !hasText) {
    return `${spaces}<${componentName}${propsStr} />`;
  }

  if (hasChildren && node.children) {
    const childrenJSX = node.children.map(c => buildJSX(c, indent + 2, interpolate)).filter(Boolean).join('\n');
    return `${spaces}<${componentName}${propsStr}>\n${childrenJSX}\n${spaces}</${componentName}>`;
  }

  if (hasText) {
    return `${spaces}<${componentName}${propsStr}>${textChild(String(node.text), interpolate)}</${componentName}>`;
  }
}

function serializeProps(node: Node, interpolate: boolean): string {
  const parts: string[] = [];

  if (node.tag) parts.push(`tag=${literalAttr(node.tag)}`);
  if (node.id) parts.push(`id=${literalAttr(node.id)}`);
  if (node.className) parts.push(`className=${literalAttr(node.className)}`);

  if (node.props) {
    for (const [key, value] of Object.entries(node.props)) {
      parts.push(serializeProp(key, value, interpolate));
    }
  }

  if (node.attrs) {
    for (const [key, value] of Object.entries(node.attrs)) {
      parts.push(serializeProp(key, value, interpolate));
    }
  }

  if (parts.length === 0) return '';

  if (parts.length <= 3) {
    return ' ' + parts.join(' ');
  }

  const indent = '  ';
  return '\n' + parts.map(p => `${indent}${p}`).join('\n') + '\n';
}

/**
 * `{name}` or `{obj.field}` inside a string is treated as an interpolation of an
 * in-scope variable (used by custom components with `logic`). Anything else in
 * braces, e.g. `{not code}`, stays literal text.
 */
const INTERPOLATION = /\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}/g;

function hasInterpolation(str: string): boolean {
  INTERPOLATION.lastIndex = 0;
  return INTERPOLATION.test(str);
}

/** Build a JS template literal, interpolating `{ident}` and escaping the rest. */
function toTemplateLiteral(str: string): string {
  let out = '';
  let last = 0;
  INTERPOLATION.lastIndex = 0;
  for (const match of str.matchAll(INTERPOLATION)) {
    out += escapeTemplateChunk(str.slice(last, match.index));
    out += '${' + match[1] + '}';
    last = match.index! + match[0].length;
  }
  out += escapeTemplateChunk(str.slice(last));
  return '`' + out + '`';
}

function escapeTemplateChunk(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** A JSX attribute value holding the literal string. */
function literalAttr(str: string): string {
  // JSX attribute strings decode HTML entities and cannot contain `"`, so fall
  // back to a JS string expression whenever either would matter.
  if (/["&]/.test(str)) return `{${JSON.stringify(str)}}`;
  return `"${str}"`;
}

/** A JSX child expression rendering the string as text. */
function textChild(str: string, interpolate: boolean): string {
  if (interpolate && hasInterpolation(str)) return `{${toTemplateLiteral(str)}}`;
  if (/[{}<>&]/.test(str)) return `{${JSON.stringify(str)}}`;
  return str;
}

function serializeProp(key: string, value: any, interpolate: boolean): string {
  if (typeof value === 'string') {
    // Whole value wrapped in braces is a raw JS expression, e.g. onClick: "{increment}".
    if (value.startsWith('{') && value.endsWith('}')) {
      return `${key}=${value}`;
    }
    if (interpolate && hasInterpolation(value)) {
      return `${key}={${toTemplateLiteral(value)}}`;
    }
    return `${key}=${literalAttr(value)}`;
  }
  if (typeof value === 'number') return `${key}={${value}}`;
  if (typeof value === 'boolean') return value ? key : `${key}={false}`;
  if (value === null || value === undefined) return `${key}={undefined}`;
  if (Array.isArray(value) || typeof value === 'object') {
    return `${key}={${JSON.stringify(value)}}`;
  }
  return `${key}=${literalAttr(String(value))}`;
}

export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Page' + cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
