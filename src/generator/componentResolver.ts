import type { Config, Node } from './types.ts';

const BUILT_IN_COMPONENTS = [
  'navbar', 'hero', 'section', 'container', 'grid',
  'card', 'text', 'button', 'image', 'footer'
];

function toPascalCase(str: string): string {
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

export function collectComponentTypes(config: Config): string[] {
  const types = new Set<string>();

  function walk(node: Node) {
    if (node?.type) types.add(node.type);
    if (node?.children) node.children.forEach(walk);
  }

  if (config.globals?.navbar) walk(config.globals.navbar);
  if (config.globals?.footer) walk(config.globals.footer);
  config.pages?.forEach(page => {
    page.sections?.forEach(walk);
  });

  return [...types];
}

export function getBuiltInComponents(): string[] {
  return [...BUILT_IN_COMPONENTS];
}
