/**
 * Theme -> Tailwind v4 CSS. Shared by the generated project's index.css and
 * the editor canvas, so both resolve `bg-primary` / `font-heading` the same way.
 */

import type { Theme } from './types.ts';

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'BlinkMacSystemFont',
]);

/** "Inter, system-ui, sans-serif" -> ['Inter', 'system-ui', 'sans-serif'] */
function families(stack: string): string[] {
  return stack.split(',').map(f => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function cssFontStack(stack: string): string {
  const list = families(stack);
  if (!list.some(f => GENERIC_FAMILIES.has(f))) list.push('sans-serif');
  return list.map(f => (GENERIC_FAMILIES.has(f) || !/\s/.test(f) ? f : `"${f}"`)).join(', ');
}

/** The `@theme` block plus base styles for body and heading fonts. */
export function themeCss(theme: Theme | undefined): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(theme?.colors ?? {})) {
    lines.push(`  --color-${name}: ${value};`);
  }
  const fonts = theme?.fonts ?? {};
  for (const [name, stack] of Object.entries(fonts)) {
    lines.push(`  --font-${name}: ${cssFontStack(stack)};`);
  }
  if (fonts.body) lines.push('  --default-font-family: var(--font-body);');

  let css = lines.length ? `@theme {\n${lines.join('\n')}\n}\n` : '';
  if (fonts.heading) {
    css += `\n@layer base {\n  h1, h2, h3, h4, h5, h6 {\n    font-family: var(--font-heading);\n  }\n}\n`;
  }
  return css;
}

/** Google Fonts stylesheet URL for the first family of each theme font, or null. */
export function googleFontsUrl(theme: Theme | undefined): string | null {
  const names = new Set<string>();
  for (const stack of Object.values(theme?.fonts ?? {})) {
    const first = families(stack)[0];
    if (first && !GENERIC_FAMILIES.has(first)) names.add(first);
  }
  if (names.size === 0) return null;
  const params = [...names].map(f => `family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`;
}
