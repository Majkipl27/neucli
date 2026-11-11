import type { Config, Node } from './types.ts';
import { sanitizeName } from './pageBuilder.ts';
import { resolveComponentTemplate, findComponentDef, collectComponentTypes, componentKey } from './componentResolver.ts';

export function validateConfig(config: Config): Config {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    throw new Error('Config must be a valid YAML object');
  }

  if (!config.meta?.name) {
    errors.push('meta.name is required');
  }

  if (!config.pages || !Array.isArray(config.pages) || config.pages.length === 0) {
    errors.push('At least one page is required in pages[]');
  }

  config.pages?.forEach((page, i) => {
    if (!page.path) errors.push(`pages[${i}].path is required`);
    if (!page.name) errors.push(`pages[${i}].name is required`);
    if (!page.sections || !Array.isArray(page.sections)) {
      errors.push(`pages[${i}].sections must be an array`);
    }
    page.sections?.forEach((section, j) => {
      validateNode(section, `pages[${i}].sections[${j}]`, errors);
    });
  });

  if (config.globals?.navbar) {
    validateNode(config.globals.navbar, 'globals.navbar', errors);
  }

  if (config.globals?.footer) {
    validateNode(config.globals.footer, 'globals.footer', errors);
  }

  if (config.components && typeof config.components === 'object') {
    for (const [key, def] of Object.entries(config.components)) {
      if (!def || typeof def !== 'object') {
        errors.push(`components.${key} must be an object`);
        continue;
      }
      if (def.children && !Array.isArray(def.children)) {
        errors.push(`components.${key}.children must be an array`);
      }
      if (Array.isArray(def.children)) {
        def.children.forEach((child, k) => validateNode(child, `components.${key}.children[${k}]`, errors));
      }
    }
  }

  if (errors.length === 0) {
    checkComponentCycles(config, errors);
    checkPageCollisions(config, errors);
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return config;
}

const PROP_KEY = /^[A-Za-z_$][\w$]*(?:[-:][\w$]+)*$/;

function validateNode(node: Node, path: string, errors: string[]) {
  if (!node || typeof node !== 'object') {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!node.type || typeof node.type !== 'string') {
    errors.push(`${path}.type is required`);
  } else if (!/^[A-Za-z][\w-]*$/.test(node.type)) {
    errors.push(`${path}.type "${node.type}" must start with a letter and use only letters, digits, - or _`);
  }

  for (const bag of ['props', 'attrs'] as const) {
    const values = node[bag];
    if (values == null) continue;
    if (typeof values !== 'object' || Array.isArray(values)) {
      errors.push(`${path}.${bag} must be a mapping`);
      continue;
    }
    for (const key of Object.keys(values)) {
      if (!PROP_KEY.test(key)) errors.push(`${path}.${bag}.${key} is not a valid JSX attribute name`);
    }
  }

  if (node.children && !Array.isArray(node.children)) {
    errors.push(`${path}.children must be an array`);
  }

  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child, k) => {
      validateNode(child, `${path}.children[${k}]`, errors);
    });
  }
}

/** A custom component that renders itself (directly or via others) would recurse forever. */
function checkComponentCycles(config: Config, errors: string[]) {
  if (!config.components) return;
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (type: string, trail: string[]) => {
    const name = componentKey(type);
    const def = findComponentDef(config, type);
    if (!def) return;
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      errors.push(`components: cycle detected (${[...trail, type].join(' -> ')})`);
      return;
    }
    state.set(name, 'visiting');
    const walk = (n: Node) => {
      visit(n.type, [...trail, type]);
      n.children?.forEach(walk);
    };
    def.children?.forEach(walk);
    state.set(name, 'done');
  };

  Object.keys(config.components).forEach(key => visit(key, []));
}

/**
 * Page files and identifiers come from sanitizeName(page.name), and they share
 * a scope with component imports in App.tsx and in the page itself.
 */
function checkPageCollisions(config: Config, errors: string[]) {
  const componentNames = new Set(
    collectComponentTypes(config).map(t => resolveComponentTemplate(t).componentName),
  );
  const byName = new Map<string, number>();
  const byPath = new Map<string, number>();

  config.pages.forEach((page, i) => {
    const id = sanitizeName(page.name);
    const prevName = byName.get(id);
    if (prevName !== undefined) {
      errors.push(`pages[${i}].name "${page.name}" collides with pages[${prevName}].name (both become ${id}.tsx)`);
    } else {
      byName.set(id, i);
    }
    if (componentNames.has(id)) {
      errors.push(`pages[${i}].name "${page.name}" collides with the component ${id}; rename the page`);
    }
    if (id === 'App' || id === 'Router' || id === 'Routes' || id === 'Route') {
      errors.push(`pages[${i}].name "${page.name}" is reserved; rename the page`);
    }

    const prevPath = byPath.get(page.path);
    if (prevPath !== undefined) {
      errors.push(`pages[${i}].path "${page.path}" is already used by pages[${prevPath}]`);
    } else {
      byPath.set(page.path, i);
    }
  });
}
