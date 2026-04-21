import type { Config, Node } from './types.ts';

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

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return config;
}

function validateNode(node: Node, path: string, errors: string[]) {
  if (!node.type) {
    errors.push(`${path}.type is required`);
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
