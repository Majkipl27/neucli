import { Config } from './types.js';

export function buildTailwindExtend(theme: Config['theme']) {
  const extend: any = {};

  if (theme?.colors) {
    extend.colors = { ...theme.colors };
  }

  if (theme?.fonts) {
    extend.fontFamily = {};
    if (theme.fonts.heading) {
      extend.fontFamily.heading = [theme.fonts.heading, 'sans-serif'];
    }
    if (theme.fonts.body) {
      extend.fontFamily.body = [theme.fonts.body, 'sans-serif'];
    }
  }

  if (theme?.extend) {
    Object.assign(extend, theme.extend);
  }

  return extend;
}

export function buildGoogleFontsUrl(theme: Config['theme']): string | null {
  if (!theme?.fonts) return null;

  const fonts = new Set<string>();
  if (theme.fonts.heading) fonts.add(theme.fonts.heading);
  if (theme.fonts.body) fonts.add(theme.fonts.body);

  if (fonts.size === 0) return null;

  const families = [...fonts].map(
    f => `family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700`
  );

  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}
