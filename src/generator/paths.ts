/**
 * Where generated files go, relative to the output directory. Kept in one
 * place so Phase 8 (moving neucli-owned output under src/neucli/) is a change
 * here plus the relative imports in codegen.
 */
export const OUT = {
  components: 'src/components',
  pages: 'src/pages',
  primitives: 'src/primitives',
  hooks: 'src/hooks',
  app: 'src/App.tsx',
  scrollToHash: 'src/ScrollToHash.tsx',
  lock: '.neucli/config.lock.yaml',
} as const;
