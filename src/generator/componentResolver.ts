import type { Config, Node, ComponentDef } from './types.ts';

const BUILT_IN_COMPONENTS = [
  'navbar', 'hero', 'section', 'container', 'grid',
  'card', 'text', 'button', 'image', 'footer'
];

export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export interface ResolvedComponent {
  templatePath: string;
  componentName: string;
  isBuiltIn: boolean;
  originalType?: string;
}

export function resolveComponentTemplate(type: string): ResolvedComponent {
  const normalized = type.toLowerCase();

  if (BUILT_IN_COMPONENTS.includes(normalized)) {
    const componentName = toPascalCase(type);
    return {
      templatePath: `components/${componentName}.tsx.ejs`,
      componentName,
      isBuiltIn: true
    };
  }

  return {
    templatePath: "components/Raw.tsx.ejs",
    componentName: toPascalCase(type),
    isBuiltIn: false,
    originalType: normalized
  };
}

/**
 * Find the `components:` entry for a node type. Keys match case-insensitively,
 * ignoring - _ and spaces, so `promo-box`, `promo_box` and `PromoBox` are the same component.
 * Built-in types never resolve to a custom definition.
 */
export function componentKey(type: string): string {
  return type.toLowerCase().replace(/[-_\s]+/g, '');
}

export function findComponentDef(config: Config, type: string): ComponentDef | undefined {
  if (!config.components) return undefined;
  if (BUILT_IN_COMPONENTS.includes(type.toLowerCase())) return undefined;
  const target = componentKey(type);
  for (const [key, def] of Object.entries(config.components)) {
    if (componentKey(key) === target) return def;
  }
  return undefined;
}

export function collectComponentTypes(config: Config): string[] {
  const types = new Map<string, string>(); // componentName -> first-seen type
  const expanded = new Set<string>();

  function walk(node: Node) {
    if (!node?.type) return;
    const { componentName } = resolveComponentTemplate(node.type);
    if (!types.has(componentName)) types.set(componentName, node.type);
    node.children?.forEach(walk);

    // Types used only inside a custom component's own children still need files.
    if (!expanded.has(componentName)) {
      expanded.add(componentName);
      findComponentDef(config, node.type)?.children?.forEach(walk);
    }
  }

  if (config.globals?.navbar) walk(config.globals.navbar);
  if (config.globals?.footer) walk(config.globals.footer);
  config.pages?.forEach(page => {
    page.sections?.forEach(walk);
  });

  return [...types.values()];
}

export function getBuiltInComponents(): string[] {
  return [...BUILT_IN_COMPONENTS];
}
