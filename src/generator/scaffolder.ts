import fs from 'fs';
import path from 'path';
import { renderTemplate } from './renderer.js';
import { buildTailwindExtend, buildGoogleFontsUrl } from './themeBuilder.js';
import { sanitizeName } from './pageBuilder.js';
import { writeIfChanged, DiffReport } from './differ.js';
import { Config, Features } from './types.js';

const DIRS = ['', 'src', 'src/components', 'src/pages', 'src/hooks', 'public', '.neucli'];

const PROJECT_FILES = [
  ['project/package.json.ejs', 'package.json'],
  ['project/vite.config.ts.ejs', 'vite.config.ts'],
  ['project/tailwind.config.js.ejs', 'tailwind.config.js'],
  ['project/postcss.config.js.ejs', 'postcss.config.js'],
  ['project/tsconfig.json.ejs', 'tsconfig.json'],
  ['project/tsconfig.app.json.ejs', 'tsconfig.app.json'],
  ['project/index.html.ejs', 'index.html'],
  ['project/src/main.tsx.ejs', 'src/main.tsx'],
  ['project/src/App.tsx.ejs', 'src/App.tsx'],
  ['project/src/index.css.ejs', 'src/index.css'],
  ['project/src/vite-env.d.ts.ejs', 'src/vite-env.d.ts'],
  ['project/src/hooks/useSEO.ts.ejs', 'src/hooks/useSEO.ts'],
];

export function scaffoldProject(
  config: Config, 
  outputDir: string, 
  report: DiffReport, 
  features: Features, 
  dependencies: Record<string, string>, 
  navbarJSX: string | null, 
  footerJSX: string | null, 
  globalImports: string[]
) {
  DIRS.forEach(dir => {
    fs.mkdirSync(path.join(outputDir, dir), { recursive: true });
  });

  const tailwindExtend = buildTailwindExtend(config.theme);
  const fontsUrl = buildGoogleFontsUrl(config.theme);

  const data = {
    siteName: config.meta.name,
    siteDescription: config.meta?.description || '',
    siteLang: config.meta?.lang || 'en',
    favicon: config.meta?.favicon || '',
    tailwindExtend: JSON.stringify(tailwindExtend, null, 6),
    fontsUrl,
    pages: config.pages,
    sanitizeName,
    features,
    dependencies,
    globals: config.globals,
    navbarJSX,
    footerJSX,
    globalImports,
  };

  PROJECT_FILES.forEach(([template, output]) => {
    const content = renderTemplate(template, data);
    writeIfChanged(path.join(outputDir, output), content, report);
  });
}
