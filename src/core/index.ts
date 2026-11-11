/**
 * neucli/core — the format, its validation and the style compiler.
 * Pure TypeScript with no React, so the CLI (Node) and the editor (Vite) can
 * both import it. React primitives live in `neucli/core/primitives`.
 */

export * from './types.ts';
export { ConfigSchema, NodeSchema, parseStructure, formatPath, IDENTIFIER, COMPONENT_NAME, ATTR_KEY } from './schema.ts';
export { validate, collectSlots, instancesIn } from './validate.ts';
export type { ValidationResult, SlotInfo } from './validate.ts';
export {
  compileClasses, childFlows, resolveStyle, mergeStyle, styleOf, joinClasses,
  BREAKPOINTS, VARIANT, COLUMN_FLOWS, STYLE_KEYS, SIZING_KEYS,
} from './style/compile.ts';
export type { Flow, Flows, StyleKind, StyleSource, Part } from './style/compile.ts';
export { parseColor } from './style/color.ts';
export { themeCss, googleFontsUrl } from './theme.ts';
export { PRIMITIVE_COMPONENTS, RESERVED_NAMES, RESERVED_PROPS, pageComponentName } from './names.ts';
export {
  nodeClasses, componentRestClasses, rootSizing, slotParentFlows, pageParentFlows, layoutOf,
  sourceOf, isLinkContainer, rootKind, pickSizing, omitSizing,
} from './render.ts';
