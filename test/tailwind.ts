/**
 * Ask Tailwind v4 itself whether class names are real utilities.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { __unstable__loadDesignSystem } from 'tailwindcss';

const require = createRequire(import.meta.url);
const base = path.dirname(require.resolve('tailwindcss/package.json'));

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;
let cached: Promise<DesignSystem> | null = null;

function load(): Promise<DesignSystem> {
  // Theme tokens the fixtures and examples use, so bg-primary etc. resolve.
  const css = `@import "tailwindcss";
@theme {
  --color-primary: #000; --color-accent: #000; --color-highlight: #000; --color-surface: #000;
  --color-secondary: #000; --color-brand: #000;
  --font-heading: x; --font-body: x;
}`;
  cached ??= __unstable__loadDesignSystem(css, {
    base,
    async loadStylesheet(id: string, from: string) {
      const file = id === 'tailwindcss' ? path.join(base, 'index.css') : path.resolve(from, id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf-8') };
    },
  });
  return cached;
}

/** Classes Tailwind doesn't recognise. */
export async function invalidClasses(classes: string[]): Promise<string[]> {
  const ds = await load();
  const unique = [...new Set(classes.filter(Boolean))];
  const css = ds.candidatesToCss(unique);
  return unique.filter((_, i) => !css[i]);
}

/** Pull class strings out of generated TSX: className="...", cx("...", ...), sizing="...", sizing = "...". */
export function classesInSource(source: string): string[] {
  const out: string[] = [];
  const patterns = [/className="([^"]*)"/g, /sizing="([^"]*)"/g, /sizing = "([^"]*)"/g, /sizing \?\? "([^"]*)"/g, /cx\("([^"]*)"/g];
  for (const re of patterns) for (const m of source.matchAll(re)) out.push(...m[1].split(/\s+/));
  return out.filter(Boolean);
}
