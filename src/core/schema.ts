/**
 * zod schema for the config format. Structural checks only (shapes, enums,
 * unknown keys); cross-references like "does this component exist" live in
 * validate.ts. Parsing normalises shorthands, so the output is the canonical
 * shape from types.ts.
 */

import { z } from 'zod';
import type { Config, Node, PropDef } from './types.ts';
import { PRIMITIVE_TYPES } from './types.ts';
import { parseColor } from './style/color.ts';
import { parseAction, parseCondition } from './interactions.ts';

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
export const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;
/** JSX attribute names: plain identifiers plus aria-label / data-x / xlink:href style. */
export const ATTR_KEY = /^[A-Za-z_$][\w$]*(?:[-:][\w$]+)*$/;
const LENGTH_STRING = /^(?:\d+(?:\.\d+)?%|screen|full|\d+(?:\.\d+)?(?:px|rem|em|vh|vw|dvh|svh|lvh|ch)|(?:calc|min|max|clamp)\(.+\))$/;

const Color = z.string().superRefine((value, ctx) => {
  const parsed = parseColor(value, null);
  if (!parsed.ok) ctx.addIssue({ code: 'custom', message: parsed.error! });
});

const Px = z.number().min(0);

const Length = z.union([
  Px,
  z.string().regex(LENGTH_STRING, 'expected px number, "50%", "screen", or a CSS length like "60vh"'),
]);

const Size = z.union([z.literal('fill'), z.literal('hug'), Length]);

const Spacing = z.union([
  Px,
  z.tuple([Px, Px]),
  z.tuple([Px, Px, Px]),
  z.tuple([Px, Px, Px, Px]),
]);

const Layout = z.strictObject({
  direction: z.enum(['row', 'column', 'grid']).optional(),
  columns: z.number().int().min(1).max(12).optional(),
  gap: z.union([Px, z.tuple([Px, Px])]).optional(),
  padding: Spacing.optional(),
  align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
  justify: z.enum(['start', 'center', 'end', 'between', 'around', 'evenly']).optional(),
  wrap: z.boolean().optional(),
});

const Gradient = z.strictObject({
  gradient: z.union([z.enum(['to-t', 'to-tr', 'to-r', 'to-br', 'to-b', 'to-bl', 'to-l', 'to-tl']), z.number()]),
  from: Color,
  via: Color.optional(),
  to: Color,
});

const Font = z.strictObject({
  family: z.string().regex(/^[a-z][a-z0-9-]*$/, 'font family must be a theme font key (e.g. heading) or sans/serif/mono').optional(),
  size: z.number().positive().optional(),
  weight: z.union([100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => z.literal(w)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]).optional(),
  leading: z.number().positive().optional(),
  tracking: z.number().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  transform: z.enum(['uppercase', 'lowercase', 'capitalize', 'none']).optional(),
  italic: z.boolean().optional(),
});

const BorderSide = z.enum(['all', 'x', 'y', 'top', 'right', 'bottom', 'left']);
const Border = z.strictObject({
  width: Px.optional(),
  color: Color.optional(),
  sides: z.union([BorderSide, z.array(BorderSide).min(1)]).optional(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional(),
});

const ShadowSize = z.enum(['none', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl']);
const Shadow = z.union([ShadowSize, z.strictObject({ size: ShadowSize, color: Color.optional() })]);

const Radius = z.union([Px, z.literal('full'), z.tuple([Px, Px, Px, Px])]);

/** All structured style keys; node schemas pick the ones they allow. */
const styleShape = {
  layout: Layout.optional(),
  width: Size.optional(),
  height: Size.optional(),
  minWidth: Length.optional(),
  maxWidth: z.union([Length, z.literal('prose')]).optional(),
  minHeight: Length.optional(),
  maxHeight: Length.optional(),
  fill: z.union([Color, Gradient]).optional(),
  color: Color.optional(),
  font: Font.optional(),
  radius: Radius.optional(),
  border: Border.optional(),
  shadow: Shadow.optional(),
  opacity: z.number().min(0).max(1).optional(),
  clip: z.boolean().optional(),
  hidden: z.boolean().optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'none', 'scale-down']).optional(),
};

type StyleKey = keyof typeof styleShape;

function pickStyle<K extends StyleKey>(keys: readonly K[]) {
  const shape = {} as { [P in K]: (typeof styleShape)[P] };
  for (const k of keys) shape[k] = styleShape[k];
  return shape;
}

const COMMON_STYLE = [
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'fill', 'color', 'font', 'radius',
  'border', 'shadow', 'opacity', 'clip', 'hidden',
] as const;
const INSTANCE_STYLE = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'hidden', 'fill', 'color', 'border'] as const;

function responsive<T extends z.ZodRawShape>(shape: T) {
  const override = z.strictObject(shape);
  return z.strictObject({ tablet: override.optional(), phone: override.optional() }).optional();
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

const AttrValue = z.union([z.string(), z.number(), z.boolean()]);
const Attrs = z.record(z.string().regex(ATTR_KEY, 'not a valid HTML/JSX attribute name'), AttrValue);
const Tag = z.string().regex(/^[a-z][a-z0-9-]*$/, 'tag must be a lowercase HTML tag name');
const Content = z.union([z.string(), z.number()]).transform(String);

const CONDITION_HINT = 'expected a condition like "open", "!open" or "tab == 2"';
const ACTION_HINT = 'expected an action: "toggle open", "set tab 2", "increment count", "decrement count", "next slide of 3" or "prev slide of 3"';

const ConditionString = z.string().refine(s => parseCondition(s) !== null, CONDITION_HINT);
const ActionString = z.string().refine(s => parseAction(s) !== null, ACTION_HINT);

const base = {
  id: z.string().min(1).optional(),
  name: z.string().optional(),
  className: z.string().optional(),
  attrs: Attrs.optional(),
  visibleWhen: ConditionString.optional(),
};

const On = z.strictObject({
  click: ActionString.optional(),
  submit: ActionString.optional(),
  mouseenter: ActionString.optional(),
  mouseleave: ActionString.optional(),
});
const State = z.record(
  z.string().regex(/^[A-Za-z_]\w*$/, 'state names are identifiers like open or activeTab'),
  z.union([z.string(), z.number(), z.boolean()]),
);

/** `when: { <condition>: { ...style overrides, className } }` */
function when<T extends z.ZodRawShape>(shape: T) {
  return z
    .record(z.string(), z.strictObject({ ...shape, className: z.string().optional() }))
    .superRefine((value, ctx) => {
      for (const key of Object.keys(value)) {
        if (!parseCondition(key)) ctx.addIssue({ code: 'custom', path: [key], message: `"${key}": ${CONDITION_HINT}` });
      }
    })
    .optional();
}

// Recursive references go through z.lazy so the schemas can be declared in any order.
const Children = z.lazy(() => z.array(NodeSchema));

const FrameStyle = [...COMMON_STYLE, 'layout'] as const;
const FrameSchema = z.strictObject({
  type: z.literal('frame'),
  ...base,
  ...pickStyle(FrameStyle),
  tag: Tag.optional(),
  children: Children.optional(),
  responsive: responsive(pickStyle(FrameStyle)),
  state: State.optional(),
  on: On.optional(),
  when: when(pickStyle(FrameStyle)),
});

const TextSchema = z.strictObject({
  type: z.literal('text'),
  ...base,
  ...pickStyle(COMMON_STYLE),
  tag: Tag.optional(),
  content: Content,
  responsive: responsive(pickStyle(COMMON_STYLE)),
  on: On.optional(),
  when: when(pickStyle(COMMON_STYLE)),
});

const ImageStyle = [...COMMON_STYLE, 'fit'] as const;
const ImageSchema = z.strictObject({
  type: z.literal('image'),
  ...base,
  ...pickStyle(ImageStyle),
  src: z.string().min(1),
  alt: z.string().optional(),
  responsive: responsive(pickStyle(ImageStyle)),
  when: when(pickStyle(ImageStyle)),
});

const LinkSchema = z.strictObject({
  type: z.literal('link'),
  ...base,
  ...pickStyle(FrameStyle),
  href: z.string().min(1),
  newTab: z.boolean().optional(),
  content: Content.optional(),
  children: Children.optional(),
  responsive: responsive(pickStyle(FrameStyle)),
  on: On.optional(),
  when: when(pickStyle(FrameStyle)),
}).refine(n => !(n.content !== undefined && n.children?.length), {
  message: 'a link has either content or children, not both',
});

const InputSchema = z.strictObject({
  type: z.literal('input'),
  ...base,
  ...pickStyle(COMMON_STYLE),
  inputType: z.string().regex(/^[a-z-]+$/).optional(),
  multiline: z.boolean().optional(),
  field: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  responsive: responsive(pickStyle(COMMON_STYLE)),
  when: when(pickStyle(COMMON_STYLE)),
});

const SlotSchema = z.strictObject({
  type: z.literal('slot'),
  name: z.string().regex(IDENTIFIER, 'slot names must be identifiers').optional(),
});

const InstanceSchema = z.strictObject({
  type: z.string().regex(COMPONENT_NAME),
  ...base,
  ...pickStyle(INSTANCE_STYLE),
  props: z.record(z.string().regex(IDENTIFIER, 'prop names must be identifiers'), AttrValue).optional(),
  children: Children.optional(),
  slots: z.record(z.string().regex(IDENTIFIER), Children).optional(),
  responsive: responsive(pickStyle(INSTANCE_STYLE)),
});

const PRIMITIVE_SCHEMAS: Record<string, z.ZodType> = {
  frame: FrameSchema,
  text: TextSchema,
  image: ImageSchema,
  link: LinkSchema,
  input: InputSchema,
  slot: SlotSchema,
};

/** Types that were built in before v2; point people at components. */
const OLD_BUILTINS = new Set(['navbar', 'hero', 'section', 'container', 'grid', 'card', 'button', 'footer']);

/**
 * A node, dispatched on `type` so errors talk about the right schema instead
 * of listing every union member.
 */
export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.unknown().transform((value, ctx) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({ code: 'custom', message: 'a node must be a mapping with a type' });
      return z.NEVER;
    }
    const type = (value as { type?: unknown }).type;
    if (typeof type !== 'string' || !type) {
      ctx.addIssue({ code: 'custom', message: 'type is required', path: ['type'] });
      return z.NEVER;
    }

    let schema = PRIMITIVE_SCHEMAS[type];
    if (!schema) {
      if (COMPONENT_NAME.test(type)) {
        schema = InstanceSchema;
      } else {
        const primitives = PRIMITIVE_TYPES.join(', ');
        const hint = OLD_BUILTINS.has(type.toLowerCase())
          ? ` "${type}" was a built-in before v2; define it under components: and use it by its PascalCase name.`
          : '';
        ctx.addIssue({
          code: 'custom',
          path: ['type'],
          message: `unknown type "${type}". Primitives are ${primitives}; components use their PascalCase name.${hint}`,
        });
        return z.NEVER;
      }
    }

    const result = schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        let message = issue.message;
        if (schema === InstanceSchema && issue.code === 'unrecognized_keys' && issue.path.length === 0) {
          const keys = (issue as { keys?: string[] }).keys ?? [];
          if (keys.some(k => k in styleShape)) {
            message += ` — an instance takes props, sizing (width, height, min/max, hidden), fill, color, border and className; for anything else, change the component or detach the instance`;
          }
        }
        ctx.addIssue({ code: 'custom', message, path: issue.path as (string | number)[] });
      }
      return z.NEVER;
    }
    return result.data as Node;
  }),
) as unknown as z.ZodType<Node>;

// ---------------------------------------------------------------------------
// Components, pages, config
// ---------------------------------------------------------------------------

const PropType = z.enum(['text', 'url', 'image', 'number', 'boolean']);
const PropDefSchema = z
  .union([
    PropType.transform((type): PropDef => ({ type })),
    z.strictObject({ type: PropType, default: z.union([z.string(), z.number(), z.boolean()]).optional() }),
  ]);

const ComponentDefSchema = z
  .strictObject({
    props: z.record(z.string().regex(IDENTIFIER, 'prop names must be identifiers'), PropDefSchema).optional(),
    root: NodeSchema.optional(),
    imports: z.array(z.string()).optional(),
    logic: z.string().optional(),
    file: z.string().optional(),
  })
  .refine(def => (def.root === undefined) !== (def.file === undefined), {
    message: 'a component needs exactly one of root or file',
  });

const PageSchema = z.strictObject({
  path: z.string().regex(/^\/[^\s]*$/, 'path must start with /'),
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  layout: z.union([z.string(), z.literal(false)]).optional(),
  sections: z.array(NodeSchema).default([]),
});

const TOKEN = /^[a-z][a-z0-9-]*$/;

export const ConfigSchema = z.strictObject({
  meta: z.strictObject({
    name: z.string().min(1),
    description: z.string().optional(),
    lang: z.string().optional(),
    favicon: z.string().optional(),
  }),
  theme: z
    .strictObject({
      colors: z.record(z.string().regex(TOKEN, 'color tokens are lowercase, e.g. primary or brand-dark'), z.string()).optional(),
      fonts: z.record(z.string().regex(TOKEN, 'font tokens are lowercase, e.g. heading'), z.string()).optional(),
    })
    .optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  layout: z.string().optional(),
  components: z.record(z.string(), ComponentDefSchema).optional(),
  pages: z.array(PageSchema).min(1, 'at least one page is required'),
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

export interface ParseResult {
  config?: Config;
  errors: string[];
}

/** Structural parse. Never throws. */
export function parseStructure(raw: unknown): ParseResult {
  if (raw && typeof raw === 'object' && 'globals' in raw) {
    return {
      errors: [
        'This config uses the old (v1) format: `globals:` is gone. Put the navbar and footer in a layout component and set `layout:` instead. See docs/format.md.',
      ],
    };
  }
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return { config: result.data as Config, errors: [] };
  const errors = result.error.issues.map(issue => {
    const where = formatPath(issue.path);
    return where ? `${where}: ${issue.message}` : issue.message;
  });
  return { errors: [...new Set(errors)] };
}
