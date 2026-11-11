/**
 * Project scaffolding: package.json, Vite + Tailwind v4 setup, index.css with
 * the theme, and the primitives copied from core.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderTemplate } from './renderer.ts';
import { writeIfChanged, DiffReport } from './differ.ts';
import { OUT } from './paths.ts';
import { themeCss, googleFontsUrl } from '../core/index.ts';
import type { Config } from '../core/index.ts';

const PRIMITIVES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'primitives');

export const BASE_DEPENDENCIES = {
  react: '^19.2.0',
  'react-dom': '^19.2.0',
};
export const ROUTER_DEPENDENCY = { 'react-router-dom': '^7.9.0' };
export const DEV_DEPENDENCIES = {
  '@tailwindcss/vite': '^4.1.0',
  '@types/react': '^19.2.0',
  '@types/react-dom': '^19.2.0',
  '@vitejs/plugin-react': '^5.0.0',
  tailwindcss: '^4.1.0',
  typescript: '~5.9.0',
  vite: '^7.1.0',
};

export function usesRouting(config: Config): boolean {
  return config.pages.length > 1;
}

function sorted(deps: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

const PROJECT_FILES: [template: string, output: string][] = [
  ['project/package.json.ejs', 'package.json'],
  ['project/vite.config.ts.ejs', 'vite.config.ts'],
  ['project/tsconfig.json.ejs', 'tsconfig.json'],
  ['project/tsconfig.app.json.ejs', 'tsconfig.app.json'],
  ['project/index.html.ejs', 'index.html'],
  ['project/src/main.tsx.ejs', 'src/main.tsx'],
  ['project/src/index.css.ejs', 'src/index.css'],
  ['project/src/vite-env.d.ts.ejs', 'src/vite-env.d.ts'],
  ['project/src/hooks/useSEO.ts.ejs', `${OUT.hooks}/useSEO.ts`],
];

/** Writes project-level files; returns the primitives file names it wrote. */
export function scaffoldProject(config: Config, outputDir: string, report: DiffReport): Set<string> {
  const routing = usesRouting(config);
  const data = {
    packageName: config.meta.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'neucli-site',
    siteName: config.meta.name,
    siteDescription: config.meta.description ?? '',
    siteLang: config.meta.lang ?? 'en',
    favicon: config.meta.favicon ?? '',
    fontsUrl: googleFontsUrl(config.theme),
    themeCss: themeCss(config.theme),
    dependencies: sorted({ ...BASE_DEPENDENCIES, ...(routing ? ROUTER_DEPENDENCY : {}), ...config.dependencies }),
    devDependencies: sorted(DEV_DEPENDENCIES),
  };

  for (const [template, output] of PROJECT_FILES) {
    writeIfChanged(path.join(outputDir, output), renderTemplate(template, data), report);
  }

  const scrollToHash = path.join(outputDir, OUT.scrollToHash);
  if (routing) {
    writeIfChanged(scrollToHash, renderTemplate('project/src/ScrollToHash.tsx.ejs', data), report);
  } else if (fs.existsSync(scrollToHash)) {
    fs.unlinkSync(scrollToHash);
    report.remove(scrollToHash);
  }

  // Primitives: verbatim copies of core, except InternalLink, which uses the router when there is one.
  const written = new Set<string>();
  for (const file of fs.readdirSync(PRIMITIVES_DIR)) {
    let content = fs.readFileSync(path.join(PRIMITIVES_DIR, file), 'utf-8');
    if (file === 'InternalLink.tsx' && routing) content = renderTemplate('project/src/InternalLink.router.tsx.ejs', data);
    writeIfChanged(path.join(outputDir, OUT.primitives, file), content, report);
    written.add(file);
  }
  return written;
}
