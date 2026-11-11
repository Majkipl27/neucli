/**
 * Interactions: state, actions and conditions.
 *
 * One small language, shared by validation, the code generator (which turns
 * it into `useState` + handlers) and the editor canvas (which runs it live in
 * Preview). Keep it small enough to read in YAML:
 *
 *   state: { open: false, tab: 0 }          declared on a frame
 *   on: { click: toggle open }              toggle | set | increment | decrement | next | prev
 *   visibleWhen: tab == 2                   name | !name | name == value (also != > < >= <=)
 *   when: { open: { fill: slate-100 } }     style overrides while a condition holds
 */

export type StateValue = string | number | boolean;
export type StateType = 'boolean' | 'number' | 'string';

export function typeOfValue(v: StateValue): StateType {
  return typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string';
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** `true` / `false`, a number, a quoted string, or a bare word. */
export function parseValue(raw: string): StateValue {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const quoted = /^(['"])(.*)\1$/.exec(s);
  if (quoted) return quoted[2];
  return s;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type Comparison = '==' | '!=' | '>' | '<' | '>=' | '<=';

export interface Condition {
  name: string;
  /** `!open` */
  negate: boolean;
  op?: Comparison;
  value?: StateValue;
}

const CONDITION = /^\s*(!)?\s*([A-Za-z_]\w*)\s*(?:(==|!=|>=|<=|>|<)\s*(\S.*?))?\s*$/;

export function parseCondition(src: string): Condition | null {
  const m = CONDITION.exec(src);
  if (!m) return null;
  const [, bang, name, op, rawValue] = m;
  if (bang && op) return null; // `!a == b` reads ambiguously; write `a != b`
  return op
    ? { name, negate: false, op: op as Comparison, value: parseValue(rawValue) }
    : { name, negate: !!bang };
}

export function evalCondition(c: Condition, get: (name: string) => StateValue | undefined): boolean {
  const v = get(c.name);
  if (!c.op) return c.negate ? !v : !!v;
  const w = c.value!;
  switch (c.op) {
    case '==': return v === w;
    case '!=': return v !== w;
    case '>': return (v as number) > (w as number);
    case '<': return (v as number) < (w as number);
    case '>=': return (v as number) >= (w as number);
    case '<=': return (v as number) <= (w as number);
  }
}

/** JS for the condition, with `ref` mapping a state name to its variable. */
export function conditionJs(c: Condition, ref: (name: string) => string): string {
  const v = ref(c.name);
  if (!c.op) return c.negate ? `!${v}` : v;
  const op = c.op === '==' ? '===' : c.op === '!=' ? '!==' : c.op;
  return `${v} ${op} ${JSON.stringify(c.value)}`;
}

/** JS for "the condition does not hold". */
export function negatedConditionJs(c: Condition, ref: (name: string) => string): string {
  if (!c.op) return c.negate ? ref(c.name) : `!${ref(c.name)}`;
  if (c.op === '==') return conditionJs({ ...c, op: '!=' }, ref);
  if (c.op === '!=') return conditionJs({ ...c, op: '==' }, ref);
  return `!(${conditionJs(c, ref)})`;
}

/**
 * State values that make the condition true, for previewing it in the editor
 * (`open` -> { open: true }, `tab == 2` -> { tab: 2 }). Null when there's no
 * single obvious value (`count > 3`).
 */
export function satisfying(c: Condition, type?: StateType): Record<string, StateValue> | null {
  if (!c.op) return { [c.name]: !c.negate };
  if (c.op === '==') return { [c.name]: c.value! };
  if (c.op === '!=' && type === 'boolean') return { [c.name]: !c.value };
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  | { kind: 'toggle'; name: string }
  | { kind: 'set'; name: string; value: StateValue }
  | { kind: 'increment' | 'decrement'; name: string }
  | { kind: 'next' | 'prev'; name: string; count: number };

const ACTION = /^\s*(toggle|set|increment|decrement|next|prev)\s+([A-Za-z_]\w*)(?:\s+(\S.*?))?\s*$/;

export function parseAction(src: string): Action | null {
  const m = ACTION.exec(src);
  if (!m) return null;
  const [, kind, name, rest] = m;
  switch (kind) {
    case 'toggle':
    case 'increment':
    case 'decrement':
      return rest === undefined ? { kind, name } : null;
    case 'set':
      return rest === undefined ? null : { kind, name, value: parseValue(rest) };
    case 'next':
    case 'prev': {
      const of = rest && /^of\s+(\d+)$/.exec(rest);
      if (!of) return null;
      const count = Number(of[1]);
      return count >= 1 ? { kind, name, count } : null;
    }
  }
  return null;
}

/** The new value after running the action. */
export function applyAction(a: Action, current: StateValue | undefined): StateValue {
  switch (a.kind) {
    case 'toggle': return !current;
    case 'set': return a.value;
    case 'increment': return Number(current ?? 0) + 1;
    case 'decrement': return Number(current ?? 0) - 1;
    case 'next': return (Number(current ?? 0) + 1) % a.count;
    case 'prev': return (Number(current ?? 0) + a.count - 1) % a.count;
  }
}

/**
 * JS statement for the action, e.g. `setOpen((open) => !open)`. Updates that
 * depend on the current value use React's updater form, so two quick clicks
 * both count.
 */
export function actionJs(a: Action, ref: (name: string) => string, setter: (name: string) => string): string {
  const v = ref(a.name);
  const set = setter(a.name);
  switch (a.kind) {
    case 'toggle': return `${set}((${v}) => !${v})`;
    case 'set': return `${set}(${JSON.stringify(a.value)})`;
    case 'increment': return `${set}((${v}) => ${v} + 1)`;
    case 'decrement': return `${set}((${v}) => ${v} - 1)`;
    case 'next': return `${set}((${v}) => (${v} + 1) % ${a.count})`;
    case 'prev': return `${set}((${v}) => (${v} + ${a.count - 1}) % ${a.count})`;
  }
}

/** What type of state the action needs. `set` needs the value's type. */
export function actionNeeds(a: Action): StateType {
  if (a.kind === 'toggle') return 'boolean';
  if (a.kind === 'set') return typeOfValue(a.value);
  return 'number';
}

// ---------------------------------------------------------------------------
// Events and attributes
// ---------------------------------------------------------------------------

export const EVENTS = ['click', 'submit', 'mouseenter', 'mouseleave'] as const;
export type EventName = (typeof EVENTS)[number];

export const EVENT_PROP: Record<EventName, string> = {
  click: 'onClick',
  submit: 'onSubmit',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
};

/**
 * An attribute whose whole value is `{condition}` over state, e.g.
 * `aria-selected: "{tab == 0}"`. Returns the parsed condition when its name is
 * known state (`isState`), else null (the value is something else).
 */
export function attrCondition(value: unknown, isState: (name: string) => boolean): Condition | null {
  if (typeof value !== 'string') return null;
  const m = /^\{(.+)\}$/.exec(value);
  if (!m) return null;
  const c = parseCondition(m[1]);
  return c && isState(c.name) ? c : null;
}

/** Tags that are interactive on their own, so a click needs no extra role or keyboard handling. */
export const INTERACTIVE_TAGS = new Set(['button', 'a', 'summary', 'select', 'textarea', 'input', 'label']);

/** State names a node reads in `visibleWhen`, `when` keys and `{condition}` attrs. */
export function namesUsed(node: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const add = (src: unknown) => {
    if (typeof src !== 'string') return;
    const c = parseCondition(src);
    if (c) out.add(c.name);
  };
  add(node.visibleWhen);
  for (const k of Object.keys((node.when as Record<string, unknown>) ?? {})) add(k);
  for (const v of Object.values((node.attrs as Record<string, unknown>) ?? {})) {
    if (typeof v === 'string' && /^\{.+\}$/.test(v)) add(v.slice(1, -1));
  }
  return out;
}
