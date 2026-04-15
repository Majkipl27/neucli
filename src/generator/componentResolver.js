const BUILT_IN_COMPONENTS = [
  'navbar', 'hero', 'section', 'container', 'grid',
  'card', 'text', 'button', 'image', 'footer'
];

function toPascalCase(str) {
  return str
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function resolveComponentTemplate(type) {
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

export function collectComponentTypes(config) {
  const types = new Set();

  function walk(node) {
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

export function getBuiltInComponents() {
  return [...BUILT_IN_COMPONENTS];
}
