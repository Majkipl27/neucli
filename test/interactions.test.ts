/**
 * Interactions: the action/condition language, validation, and the code it
 * generates (state hooks, handlers, conditional rendering, state styles,
 * dialogs), plus a real typecheck + build when NEUCLI_TEST_NODE_MODULES is set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAction, parseCondition, applyAction, evalCondition, actionJs, conditionJs, validate,
  nodeClassVariants, pickVariant, splitVariants, COLUMN_FLOWS,
} from '../src/core/index.ts';
import type { Node } from '../src/core/index.ts';
import { runPipeline } from '../src/generator/index.ts';
import { classesInSource, invalidClasses } from './tailwind.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = process.env.NEUCLI_TEST_NODE_MODULES;
const canBuild = !!nodeModules && fs.existsSync(path.join(nodeModules, '.bin', 'tsc'));
const skipBuild = canBuild ? false : 'set NEUCLI_TEST_NODE_MODULES to an installed generated project\'s node_modules';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neucli-interactions-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

// --- language -------------------------------------------------------------------

test('actions parse, run and print', () => {
  assert.deepEqual(parseAction('toggle open'), { kind: 'toggle', name: 'open' });
  assert.deepEqual(parseAction('set tab 2'), { kind: 'set', name: 'tab', value: 2 });
  assert.deepEqual(parseAction('set plan pro'), { kind: 'set', name: 'plan', value: 'pro' });
  assert.deepEqual(parseAction("set label 'two words'"), { kind: 'set', name: 'label', value: 'two words' });
  assert.deepEqual(parseAction('next slide of 3'), { kind: 'next', name: 'slide', count: 3 });
  for (const bad of ['toggle', 'toggle open now', 'set tab', 'next slide', 'next slide of 0', 'explode open']) {
    assert.equal(parseAction(bad), null, bad);
  }
  assert.equal(applyAction(parseAction('next slide of 3')!, 2), 0);
  assert.equal(applyAction(parseAction('prev slide of 3')!, 0), 2);
  assert.equal(applyAction(parseAction('toggle open')!, false), true);
  assert.equal(applyAction(parseAction('increment count')!, 4), 5);
  const ref = (n: string) => n;
  const set = (n: string) => `set${n[0].toUpperCase()}${n.slice(1)}`;
  assert.equal(actionJs(parseAction('toggle open')!, ref, set), 'setOpen((open) => !open)');
  assert.equal(actionJs(parseAction('prev slide of 3')!, ref, set), 'setSlide((slide) => (slide + 2) % 3)');
  assert.equal(actionJs(parseAction('set plan pro')!, ref, set), 'setPlan("pro")');
});

test('conditions parse, evaluate and print', () => {
  assert.deepEqual(parseCondition('open'), { name: 'open', negate: false });
  assert.deepEqual(parseCondition('!open'), { name: 'open', negate: true });
  assert.deepEqual(parseCondition('tab == 2'), { name: 'tab', negate: false, op: '==', value: 2 });
  assert.equal(parseCondition('!tab == 2'), null);
  assert.equal(parseCondition('a && b'), null);
  const get = (values: Record<string, unknown>) => (n: string) => values[n] as never;
  assert.equal(evalCondition(parseCondition('plan == pro')!, get({ plan: 'pro' })), true);
  assert.equal(evalCondition(parseCondition('count >= 3')!, get({ count: 2 })), false);
  assert.equal(evalCondition(parseCondition('!open')!, get({ open: false })), true);
  assert.equal(conditionJs(parseCondition('plan != pro')!, n => n), 'plan !== "pro"');
});

test('state styles: variants pick the first match and split shared classes', () => {
  const node = {
    type: 'text', content: 'x', color: 'slate-500', font: { size: 14 },
    when: { 'tab == 0': { color: 'slate-900' }, 'tab == 1': { color: 'violet-600', className: 'underline' } },
  } as Node;
  const v = nodeClassVariants(node as never, COLUMN_FLOWS);
  assert.equal(v.base, 'text-slate-500 text-sm');
  assert.equal(pickVariant(v, () => 1 as never), 'text-violet-600 text-sm underline');
  assert.equal(pickVariant(v, () => 5 as never), v.base);
  const split = splitVariants(v);
  assert.equal(split.common, 'text-sm');
  assert.deepEqual(split.variants.map(x => x.classes), ['text-slate-900', 'text-violet-600 underline']);
});

// --- validation -------------------------------------------------------------------

function config(sections: unknown[], components: Record<string, unknown> = {}) {
  return { meta: { name: 'T' }, components, pages: [{ path: '/', name: 'Home', sections }] };
}

function errorsOf(raw: unknown): string[] {
  return validate(raw).errors;
}

function assertError(raw: unknown, pattern: RegExp) {
  const errors = errorsOf(raw);
  assert.ok(errors.some(e => pattern.test(e)), `no error matching ${pattern}:\n${errors.join('\n')}`);
}

test('a valid interactive tree has no errors or warnings', () => {
  const result = validate(config([{
    type: 'frame',
    state: { open: false },
    children: [
      { type: 'text', content: 'Q', on: { click: 'toggle open' }, when: { open: { color: 'slate-900' } } },
      { type: 'text', content: 'A', visibleWhen: 'open' },
    ],
  }]));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('unknown state, wrong types and bad actions are errors', () => {
  const frame = (child: unknown, state: unknown = { open: false, tab: 0 }) => config([{ type: 'frame', state, children: [child] }]);
  assertError(config([{ type: 'text', content: 'x', visibleWhen: 'open' }]), /reads "open", which isn't state here; declare it/);
  assertError(frame({ type: 'text', content: 'x', on: { click: 'toggle tab' } }), /"toggle tab" needs a boolean, but "tab" is a number/);
  assertError(frame({ type: 'text', content: 'x', on: { click: 'set open 3' } }), /needs a number, but "open" is a boolean/);
  assertError(frame({ type: 'text', content: 'x', on: { click: 'next open of 2' } }), /needs a number/);
  assertError(frame({ type: 'text', content: 'x', visibleWhen: 'tab' }), /"tab" is a number; compare it instead/);
  assertError(frame({ type: 'text', content: 'x', visibleWhen: 'tab == pro' }), /"tab" is a number, compared with a string/);
  assertError(frame({ type: 'text', content: 'x', visibleWhen: 'open > 1' }), /> compares numbers/);
  assertError(frame({ type: 'text', content: 'x', on: { click: 'explode open' } }), /expected an action: "toggle open"/);
  assertError(frame({ type: 'text', content: 'x', on: { click: 'toggle missing' } }), /changes "missing", which isn't state here/);
  assertError(frame({ type: 'frame', on: { submit: 'toggle open' } }), /submit only fires on a frame with tag: form/);
  assertError(frame({ type: 'text', content: 'x', attrs: { 'aria-selected': '{tab == open}' } }), /"tab" is a number, compared with a string/);
});

test('state scoping rules', () => {
  // A node can't hide itself with its own state.
  assertError(config([{ type: 'frame', state: { open: false }, visibleWhen: 'open' }]), /reads "open", which isn't state here/);
  // No shadowing an enclosing frame's state.
  assertError(config([{ type: 'frame', state: { open: false }, children: [{ type: 'frame', state: { open: true } }] }]), /"open" is already state on an enclosing frame/);
  // Siblings can reuse a name.
  assert.deepEqual(errorsOf(config([{ type: 'frame', state: { open: false } }, { type: 'frame', state: { open: true } }])), []);
  // State can't take a prop's name.
  assertError(config([], { Box: { props: { open: 'text' }, root: { type: 'frame', state: { open: false } } } }), /"open" is also a prop, slot or logic name of Box/);
  // Slot content in a page sees the page's state.
  assert.deepEqual(errorsOf(config(
    [{ type: 'frame', state: { open: false }, children: [{ type: 'Box', children: [{ type: 'text', content: 'x', visibleWhen: 'open' }] }] }],
    { Box: { root: { type: 'frame', children: [{ type: 'slot' }] } } },
  )), []);
});

test('when and dialog rules', () => {
  assertError(
    config([{ type: 'frame', state: { open: false }, when: { open: { layout: { direction: 'row' } } } }]),
    /when can't change layout.direction/,
  );
  assertError(
    config([], { Box: { root: { type: 'frame', state: { open: false }, when: { open: { fill: 'white' } } } } }),
    /on a component's root, when can't set fill/,
  );
  assertError(config([{ type: 'frame', state: { tab: 0 }, children: [{ type: 'frame', tag: 'dialog', visibleWhen: 'tab == 1' }] }]), /a dialog frame needs visibleWhen on a boolean/);
  assertError(config([{ type: 'text', content: 'x', when: { 'a && b': { color: 'white' } } }]), /"a && b": expected a condition/);
  assertError(config([{ type: 'frame', tag: 'h2', state: { open: false }, on: { click: 'toggle open' } }]), /a clickable h2 gets role=button/);
});

// --- generated code ------------------------------------------------------------------

async function generate(name: string) {
  const out = path.join(tmp, name);
  await runPipeline(path.join(root, 'test/fixtures/interactions.yaml'), out, { quiet: true });
  return out;
}

test('interactions fixture: hooks, handlers, conditions and ARIA', async () => {
  const out = await generate('code');
  const home = fs.readFileSync(path.join(out, 'src/pages/Home.tsx'), 'utf-8');
  const has = (snippet: string) => assert.ok(home.includes(snippet), `missing:\n${snippet}\n\n${home}`);

  has(`import { useState } from 'react';`);
  has(`import { Frame, Text, Link, Input, Dialog, cx, onPress } from '../primitives';`);
  // State hooks, in tree order; a second `open` in the same file becomes open2.
  has('const [open, setOpen] = useState(false);');
  has('const [open2, setOpen2] = useState(true);');
  has('const [plan, setPlan] = useState("basic");');
  // Handlers.
  has('onClick={() => setOpen((open) => !open)}');
  has('aria-expanded={open}');
  has('aria-controls="first-panel"');
  has('{...onPress(() => setCount((count) => count + 1))}');
  has('onMouseEnter={() => setCount((count) => count - 1)}');
  has('onClick={(event) => { event.preventDefault(); setOpen2((open2) => !open2); }}');
  has('onClick={() => setSlide((slide) => (slide + 2) % 3)}');
  has('onClick={() => setPlan("pro")}');
  has('onSubmit={(event) => { event.preventDefault(); setSent(true); }}');
  // Conditions.
  has('{open && (');
  has('{!open2 && (');
  has('{plan === "pro" && (');
  has('aria-selected={tab === 1}');
  has('{`Count is ${count}`}');
  // State styles.
  has('className={cx(count > 3 ? "text-red-600" : count === 0 ? "text-slate-400" : undefined)}');
  has('className={cx("flex flex-col", tab === 1 && "text-violet-600 border-b border-violet-600")}');
  // Dialog.
  has('<Dialog\n          open={dialogOpen}\n          onClose={() => setDialogOpen(false)}');
  has('aria-haspopup="dialog"');
  // An explicit type on a button wins over the default.
  has('<Frame tag="button" className="flex flex-col" type="submit">');

  const toggle = fs.readFileSync(path.join(out, 'src/components/Toggle.tsx'), 'utf-8');
  assert.ok(toggle.includes('const [open, setOpen] = useState(false);'), toggle);
  assert.ok(toggle.includes('className={cx("flex flex-row gap-2", open && "bg-slate-100")}'), toggle);
  assert.ok(toggle.includes('{`Open: ${open}`}'), toggle);
});

test('interactions fixture: every class is a Tailwind v4 utility', async () => {
  const out = await generate('classes');
  const files = fs.readdirSync(path.join(out, 'src'), { recursive: true, encoding: 'utf-8' }).filter(f => f.endsWith('.tsx'));
  const classes = files.flatMap(f => classesInSource(fs.readFileSync(path.join(out, 'src', f), 'utf-8')));
  assert.deepEqual(await invalidClasses(classes), []);
});

test('interactions fixture: typechecks and builds with Vite', { skip: skipBuild }, async () => {
  const out = await generate('build');
  fs.symlinkSync(nodeModules!, path.join(out, 'node_modules'), 'dir');
  for (const [bin, args] of [['tsc', ['-b']], ['vite', ['build', '--logLevel', 'error']]] as const) {
    try {
      execFileSync(path.join(nodeModules!, '.bin', bin), [...args], { cwd: out, encoding: 'utf-8', stdio: 'pipe' });
    } catch (err: any) {
      assert.fail(`${bin} failed:\n${err.stdout}${err.stderr}`);
    }
  }
});

test('a hand-written useState import is not duplicated', async () => {
  const file = path.join(tmp, 'logic.yaml');
  fs.writeFileSync(file, `
meta: { name: Logic }
components:
  Box:
    imports: ["import { useState } from 'react';"]
    logic: "const [other] = useState(1);"
    root: { type: frame, state: { open: false }, children: [{ type: text, content: '{other}', on: { click: toggle open } }] }
pages: [{ path: /, name: Home, sections: [{ type: Box }] }]
`);
  const out = path.join(tmp, 'logic-out');
  await runPipeline(file, out, { quiet: true });
  const box = fs.readFileSync(path.join(out, 'src/components/Box.tsx'), 'utf-8');
  assert.equal(box.match(/import \{ useState \}/g)?.length, 1, box);
  assert.ok(box.includes('const [open, setOpen] = useState(false);\n\n  const [other] = useState(1);'), box);
});
