/**
 * Where things go in the generated project, relative to its root.
 *
 * - `src/neucli/` is neucli's: rewritten on every run, tracked in the manifest.
 * - `src/custom/` (and anything else not in the manifest) is yours: never touched.
 * - A few root files are written once and then left to you (SEEDED), and
 *   package.json is merged (see project.ts).
 */
export const OUT = {
  root: 'src/neucli',
  components: 'src/neucli/components',
  pages: 'src/neucli/pages',
  primitives: 'src/neucli/primitives',
  hooks: 'src/neucli/hooks',
  app: 'src/neucli/App.tsx',
  scrollToHash: 'src/neucli/ScrollToHash.tsx',
  theme: 'src/neucli/theme.css',
  custom: 'src/custom',
  html: 'index.html',
  packageJson: 'package.json',
  lock: '.neucli/config.lock.yaml',
  manifest: '.neucli/manifest.json',
} as const;

/**
 * Paths the pre-manifest generator wrote (Phases 1–7, and the original v0 layout).
 * `--migrate` removes these so an old output folder can switch to `src/neucli/`.
 */
export const OLD_LAYOUT = {
  dirs: ['src/components', 'src/pages', 'src/primitives'],
  files: ['src/App.tsx', 'src/ScrollToHash.tsx', 'src/hooks/useSEO.ts', 'tailwind.config.js', 'postcss.config.js'],
  /** Root files the old generator owned; a migration replaces them with today's versions. */
  replaced: ['index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'src/main.tsx', 'src/index.css', 'src/vite-env.d.ts'],
} as const;

/** `file:` paths are relative to the generated project's `src/`; `./custom/X.tsx` and `custom/X.tsx` both work. */
export function fileComponentPath(file: string): string {
  return file.replace(/^\.\//, '').replace(/^src\//, '');
}
