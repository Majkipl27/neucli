/**
 * Color values: theme tokens, Tailwind palette colors and hex, each with an
 * optional `/opacity` suffix (0-100).
 */

/** Tailwind v4 palette families, in Tailwind's own order (the editor's color picker shows them). */
export const PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'mauve', 'olive', 'mist', 'taupe',
] as const;
export const PALETTE_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

const PALETTE = new Set<string>(PALETTE_FAMILIES);
const SHADES = new Set<string>(PALETTE_SHADES);
const KEYWORDS = new Set(['white', 'black', 'transparent', 'current', 'inherit']);

export interface ColorCheck {
  ok: boolean;
  /** Utility suffix, e.g. `primary`, `white/60`, `[#0f172a]`. */
  suffix?: string;
  error?: string;
}

/**
 * @param themeColors token names from `theme.colors`; pass null to skip the
 *   token check (the schema runs before the theme is known to be valid).
 */
export function parseColor(value: string, themeColors: Set<string> | null): ColorCheck {
  const match = /^(.+?)(?:\/(\d{1,3}))?$/.exec(value.trim());
  if (!match) return { ok: false, error: `"${value}" is not a color` };
  const [, base, alpha] = match;
  if (alpha !== undefined && Number(alpha) > 100) {
    return { ok: false, error: `"${value}": opacity after / must be 0-100` };
  }
  const withAlpha = (s: string) => (alpha !== undefined ? `${s}/${alpha}` : s);

  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(base)) {
    return { ok: true, suffix: withAlpha(`[${base}]`) };
  }
  if (KEYWORDS.has(base)) return { ok: true, suffix: withAlpha(base) };

  const palette = /^([a-z]+)-(\d{2,3})$/.exec(base);
  if (palette && PALETTE.has(palette[1]) && SHADES.has(palette[2])) {
    return { ok: true, suffix: withAlpha(base) };
  }

  if (/^[a-z][a-z0-9-]*$/i.test(base)) {
    if (themeColors === null || themeColors.has(base)) return { ok: true, suffix: withAlpha(base) };
    const known = themeColors.size ? ` Theme colors: ${[...themeColors].join(', ')}.` : ' theme.colors is empty.';
    return { ok: false, error: `"${base}" is not a theme color or a Tailwind color.${known}` };
  }

  return { ok: false, error: `"${value}" is not a color (use a theme token, a Tailwind color like slate-900, or #hex)` };
}

export function colorSuffix(value: string): string {
  const parsed = parseColor(value, null);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.suffix!;
}
