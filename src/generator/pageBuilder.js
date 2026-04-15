import { resolveComponentTemplate } from './componentResolver.js';

export function buildPageSource(page, globals) {
  const imports = new Map();

  function collectImports(node) {
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

  const sections = [];
  page.sections.forEach(s => sections.push(buildJSX(s, 6)));

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

export function buildJSX(node, indent) {
  const { componentName } = resolveComponentTemplate(node.type);
  const spaces = ' '.repeat(indent);
  const propsStr = serializeProps(node);

  const hasChildren = node.children && node.children.length > 0;
  const hasText = node.text != null;

  if (!hasChildren && !hasText) {
    return `${spaces}<${componentName}${propsStr} />`;
  }

  if (hasChildren) {
    const childrenJSX = node.children.map(c => buildJSX(c, indent + 2)).join('\n');
    return `${spaces}<${componentName}${propsStr}>\n${childrenJSX}\n${spaces}</${componentName}>`;
  }

  if (hasText) {
    return `${spaces}<${componentName}${propsStr}>${escapeJSX(String(node.text))}</${componentName}>`;
  }
}

function serializeProps(node) {
  const parts = [];

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

function serializeProp(key, value) {
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

function escapeJSX(str) {
  // Pass unescaped to allow `{variable}` bindings natively inside text nodes
  return str;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

export function sanitizeName(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Page' + cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
