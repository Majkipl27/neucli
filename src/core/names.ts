/** Identifiers the generated code uses, which pages and components must not shadow. */

/** Primitive component names in generated code. */
export const PRIMITIVE_COMPONENTS: Record<string, string> = {
  frame: 'Frame',
  text: 'Text',
  image: 'Image',
  link: 'Link',
  input: 'Input',
};

export const RESERVED_NAMES = new Set([
  ...Object.values(PRIMITIVE_COMPONENTS),
  'Slot', 'App', 'Router', 'Routes', 'Route', 'Outlet', 'Fragment', 'React', 'ScrollToHash', 'UseSEO',
]);

/** Props every generated component already has. */
export const RESERVED_PROPS = new Set(['children', 'className', 'overrides', 'id', 'key', 'ref', 'tag', 'style']);

/** Page name -> component/file name: "About us!" -> "AboutUs". */
export function pageComponentName(name: string): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const cleaned = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Page' + cleaned;
  return cleaned;
}
