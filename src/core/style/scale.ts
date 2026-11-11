/**
 * Tailwind v4 scales and the snapping rules from px values to class suffixes.
 * On-scale values get the readable class (gap 20 -> gap-5); anything else
 * becomes an arbitrary value (gap 17 -> gap-[17px]).
 */

/** Spacing utilities: v4 multiplies `--spacing` (4px) by any multiple of 0.25; we only snap even px to keep output tidy. */
export function spacing(px: number): string {
  if (px === 0) return '0';
  if (Number.isInteger(px) && px % 2 === 0) return trimNumber(px / 4);
  return `[${trimNumber(px)}px]`;
}

/** Spacing that may be negative (not used by structured styles yet, kept for margins later). */
export function trimNumber(n: number): string {
  return String(Number(n.toFixed(4)));
}

const FRACTIONS: Record<string, string> = {
  '100': 'full',
  '50': '1/2',
  '25': '1/4',
  '75': '3/4',
  '20': '1/5',
  '40': '2/5',
  '60': '3/5',
  '80': '4/5',
};

/**
 * A length for width/height/min/max utilities.
 * px number -> spacing scale; "50%" -> 1/2; "screen" -> screen; other CSS lengths -> arbitrary.
 */
export function length(value: number | string, axis: 'w' | 'h'): string {
  if (typeof value === 'number') return spacing(value);
  const v = value.trim();
  if (v === 'screen') return axis === 'w' ? 'screen' : 'screen';
  if (v === 'full') return 'full';
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(v);
  if (pct) {
    const fraction = FRACTIONS[pct[1]];
    if (fraction) return fraction;
    return `[${pct[1]}%]`;
  }
  return `[${v.replace(/\s+/g, '_')}]`;
}

/** v4 container scale, used for max-width when a px value matches exactly. */
const CONTAINER: Record<number, string> = {
  256: '3xs',
  288: '2xs',
  320: 'xs',
  384: 'sm',
  448: 'md',
  512: 'lg',
  576: 'xl',
  672: '2xl',
  768: '3xl',
  896: '4xl',
  1024: '5xl',
  1152: '6xl',
  1280: '7xl',
};

export function maxWidth(value: number | string): string {
  if (typeof value === 'number' && CONTAINER[value]) return CONTAINER[value];
  if (value === 'prose') return 'prose';
  return length(value, 'w');
}

const FONT_SIZE: Record<number, string> = {
  12: 'xs',
  14: 'sm',
  16: 'base',
  18: 'lg',
  20: 'xl',
  24: '2xl',
  30: '3xl',
  36: '4xl',
  48: '5xl',
  60: '6xl',
  72: '7xl',
  96: '8xl',
  128: '9xl',
};

export function fontSize(px: number): string {
  return FONT_SIZE[px] ?? `[${trimNumber(px)}px]`;
}

const FONT_WEIGHT: Record<number, string> = {
  100: 'thin',
  200: 'extralight',
  300: 'light',
  400: 'normal',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
  800: 'extrabold',
  900: 'black',
};

export function fontWeight(weight: number): string {
  return FONT_WEIGHT[weight] ?? `[${weight}]`;
}

const LEADING: Record<string, string> = {
  '1': 'none',
  '1.25': 'tight',
  '1.375': 'snug',
  '1.5': 'normal',
  '1.625': 'relaxed',
  '2': 'loose',
};

export function leading(multiplier: number): string {
  return LEADING[trimNumber(multiplier)] ?? `[${trimNumber(multiplier)}]`;
}

const TRACKING: Record<string, string> = {
  '-0.05': 'tighter',
  '-0.025': 'tight',
  '0': 'normal',
  '0.025': 'wide',
  '0.05': 'wider',
  '0.1': 'widest',
};

export function tracking(em: number): string {
  return TRACKING[trimNumber(em)] ?? `[${trimNumber(em)}em]`;
}

const RADIUS: Record<number, string> = {
  0: 'none',
  2: 'xs',
  4: 'sm',
  6: 'md',
  8: 'lg',
  12: 'xl',
  16: '2xl',
  24: '3xl',
  32: '4xl',
};

/** Suffix including the leading dash, because v4's 1px default radius has none: `rounded`. */
export function radius(value: number | 'full'): string {
  if (value === 'full') return '-full';
  const named = RADIUS[value];
  if (named) return `-${named}`;
  return `-[${trimNumber(value)}px]`;
}

export function opacity(value: number): string {
  const pct = Math.round(value * 100);
  if (Math.abs(pct - value * 100) < 1e-9) return String(pct);
  return `[${trimNumber(value)}]`;
}

export function borderWidth(px: number): string {
  if (px === 1) return '';
  if (Number.isInteger(px) && px >= 0) return `-${px}`;
  return `-[${trimNumber(px)}px]`;
}
