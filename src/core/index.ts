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
export { parseColor, PALETTE_FAMILIES, PALETTE_SHADES } from './style/color.ts';
export { themeCss, googleFontsUrl } from './theme.ts';
export { PRIMITIVE_COMPONENTS, RESERVED_NAMES, RESERVED_PROPS, pageComponentName } from './names.ts';
export {
  nodeClasses, componentRestClasses, rootOverrides, slotParentFlows, pageParentFlows, layoutOf,
  sourceOf, isLinkContainer, rootKind, pickOverridable, omitOverridable, OVERRIDABLE,
  nodeClassVariants, componentRestVariants, pickVariant, splitVariants, isFileComponent,
} from './render.ts';
export type { ClassVariant, ClassVariants } from './render.ts';
export {
  parseValue, parseCondition, evalCondition, conditionJs, negatedConditionJs, satisfying,
  parseAction, applyAction, actionJs, actionNeeds, typeOfValue, attrCondition, namesUsed,
  EVENTS, EVENT_PROP, INTERACTIVE_TAGS,
} from './interactions.ts';
export type { StateValue, StateType, Condition, Comparison, Action, EventName } from './interactions.ts';
export { declaredNames } from './names.ts';
export { PRESETS, getPreset, insertPreset } from './presets/index.ts';
export type { Preset, InsertedPreset } from './presets/index.ts';
