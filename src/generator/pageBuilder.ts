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
  useSEO({ title: \`${pageTitle}\`, description: \`${pageDescription}\` });

  return (
    <>

${sections.join('\n')}
    </>
  );
}
`;
}

export function buildJSX(node: Node, indent: number): string | undefined {
  const { componentName } = resolveComponentTemplate(node.type);
  const spaces = ' '.repeat(indent);
  const propsStr = serializeProps(node);

  const hasChildren = node.children && node.children.length > 0;
  const hasText = node.text != null;

  if (!hasChildren && !hasText) {
    return `${spaces}<${componentName}${propsStr} />`;
  }

  if (hasChildren && node.children) {
    const childrenJSX = node.children.map(c => buildJSX(c, indent + 2)).filter(Boolean).join('\n');
    return `${spaces}<${componentName}${propsStr}>\n${childrenJSX}\n${spaces}</${componentName}>`;
  }

  if (hasText) {
    return `${spaces}<${componentName}${propsStr}>${escapeJSX(String(node.text))}</${componentName}>`;
  }
}

function serializeProps(node: Node): string {
  const parts: string[] = [];

  if (node.tag) parts.push(`tag="${escapeAttr(node.tag)}"`);
  if (node.id) parts.push(`id="${escapeAttr(node.id)}"`);
  if (node.className) parts.push(`className="${escapeAttr(node.className)}"`);

  if (node.props) {
    for (const [key, value] of Object.entries(node.props)) {
      parts.push(serializeProp(key, value));
    }
  }

  if (node.attrs) {
    for (const [key, value] of Object.entries(node.attrs)) {
      parts.push(serializeProp(key, value));
    }
  }

  if (parts.length === 0) return '';

  if (parts.length <= 3) {
    return ' ' + parts.join(' ');
  }

  const indent = '  ';
  return '\n' + parts.map(p => `${indent}${p}`).join('\n') + '\n';
}

function serializeProp(key: string, value: any): string {
  if (typeof value === 'string') {
    if (value.startsWith('{') && value.endsWith('}')) {
      return `${key}=${value}`;
    }
    if (value.includes('{') && value.includes('}')) {
      return `${key}={\`${value.replace(/\{([^}]+)\}/g, '${$1}')}\`}`;
    }
    return `${key}="${escapeAttr(value)}"`;
  }
  if (typeof value === 'number') return `${key}={${value}}`;
  if (typeof value === 'boolean') return value ? key : `${key}={false}`;
  if (Array.isArray(value) || typeof value === 'object') {
    return `${key}={${JSON.stringify(value)}}`;
  }
  return `${key}="${value}"`;
}

function escapeJSX(str: string): string {
  return str;
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;');
}

export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Page' + cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
