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
  'Slot', 'App', 'Router', 'Routes', 'Route', 'Outlet', 'Fragment', 'React', 'ScrollToHash', 'UseSEO', 'Dialog',
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

/** Names a component's `logic` declares (const/let/var/function, including destructuring). */
export function declaredNames(logic: string | undefined): string[] {
  if (!logic) return [];
  const names = new Set<string>();
  for (const m of logic.matchAll(/\b(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/g)) {
    for (const id of m[1].matchAll(/[A-Za-z_$][\w$]*/g)) names.add(id[0]);
  }
  for (const m of logic.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return [...names];
}
