import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileClasses, RESET_CLASSES } from '../src/core/style/compile.ts';
import type { Flows, StyleSource } from '../src/core/style/compile.ts';
import { parseColor } from '../src/core/style/color.ts';
import type { Style } from '../src/core/types.ts';
import { invalidClasses } from './tailwind.ts';

const ROW: Flows = { desktop: 'row', tablet: 'row', phone: 'row' };
const COLUMN: Flows = { desktop: 'column', tablet: 'column', phone: 'column' };
const GRID: Flows = { desktop: 'grid', tablet: 'grid', phone: 'grid' };

const frame = (style: Style, responsive?: StyleSource['responsive']): StyleSource => ({ kind: 'frame', style, responsive });
const text = (style: Style, responsive?: StyleSource['responsive']): StyleSource => ({ kind: 'text', style, responsive });

test('frames default to a flex column', () => {
  assert.equal(compileClasses(frame({})), 'flex flex-col');
  assert.equal(compileClasses(frame({ layout: { direction: 'row' } })), 'flex flex-row');
  assert.equal(compileClasses(frame({ layout: { direction: 'grid', columns: 3 } })), 'grid grid-cols-3');
});

test('spacing snaps to the scale, otherwise arbitrary px', () => {
  assert.equal(compileClasses(frame({ layout: { gap: 20 } })), 'flex flex-col gap-5');
  assert.equal(compileClasses(frame({ layout: { gap: 14 } })), 'flex flex-col gap-3.5');
  assert.equal(compileClasses(frame({ layout: { gap: 17 } })), 'flex flex-col gap-[17px]');
  assert.equal(compileClasses(frame({ layout: { gap: [8, 24] } })), 'flex flex-col gap-y-2 gap-x-6');
});

test('padding collapses like CSS shorthand', () => {
  assert.match(compileClasses(frame({ layout: { padding: 24 } })), /\bp-6\b/);
  assert.match(compileClasses(frame({ layout: { padding: [96, 24] } })), /\bpy-24 px-6\b/);
  assert.match(compileClasses(frame({ layout: { padding: [16, 0, 0, 0] } })), /\bpt-4\b/);
  assert.doesNotMatch(compileClasses(frame({ layout: { padding: [16, 0, 0, 0] } })), /pb-0|px-0/, 'zero sides are dropped at desktop');
  assert.match(compileClasses(frame({ layout: { padding: [1, 2, 3, 4] } })), /pt-\[1px\] pb-\[3px\] pr-0\.5 pl-1/);
});

test('fill depends on the parent flow', () => {
  assert.equal(compileClasses(text({ width: 'fill' }), ROW), 'grow basis-0 min-w-0');
  assert.equal(compileClasses(text({ width: 'fill' }), COLUMN), 'self-stretch');
  assert.equal(compileClasses(text({ width: 'fill' }), GRID), 'w-full');
  assert.equal(compileClasses(text({ height: 'fill' }), COLUMN), 'grow basis-0', 'no min-h-0: content must not overflow');
  assert.equal(compileClasses(text({ height: 'fill' }), ROW), 'self-stretch');
});

test('hug and fixed sizes', () => {
  assert.equal(compileClasses(text({ width: 'hug' }), ROW), 'w-fit');
  assert.equal(compileClasses(text({ width: 320 }), ROW), 'w-80 shrink-0');
  assert.equal(compileClasses(text({ width: 320 }), COLUMN), 'w-80', 'shrink only matters on the main axis');
  assert.equal(compileClasses(text({ width: '50%' })), 'w-1/2');
  assert.equal(compileClasses(text({ width: '100%', maxWidth: 1280 })), 'w-full max-w-7xl');
  assert.equal(compileClasses(text({ minHeight: 'screen' })), 'min-h-screen');
  assert.equal(compileClasses(text({ minHeight: '60vh' })), 'min-h-[60vh]');
  assert.equal(compileClasses(text({ maxWidth: 700 })), 'max-w-175');
});

test('breakpoints only emit what changes, phone diffs against tablet', () => {
  const cls = compileClasses(frame(
    { layout: { direction: 'row', gap: 32 } },
    { tablet: { layout: { gap: 16 } }, phone: { layout: { direction: 'column' } } },
  ));
  assert.equal(cls, 'flex flex-row gap-8 max-lg:gap-4 max-md:flex-col');
});

test('switching sizing mode at a breakpoint resets the old groups', () => {
  const cls = compileClasses(text({ width: 'fill' }, { phone: { width: 240 } }), ROW);
  assert.equal(cls, 'grow basis-0 min-w-0 max-md:w-60 max-md:shrink-0 max-md:grow-0 max-md:basis-auto max-md:min-w-auto');
});

test('switching from a gradient to a solid fill removes the gradient', () => {
  const cls = compileClasses(frame(
    { fill: { gradient: 'to-b', from: 'primary/20', to: 'slate-950' } },
    { phone: { fill: 'white' } },
  ));
  assert.equal(cls, 'flex flex-col bg-linear-to-b from-primary/20 to-slate-950 max-md:bg-white max-md:bg-none');
});

test('hidden per breakpoint', () => {
  assert.equal(compileClasses(text({}, { phone: { hidden: true } })), 'max-md:hidden');
  assert.equal(compileClasses(text({ hidden: true }, { phone: { hidden: false } })), 'hidden max-md:block');
  assert.equal(compileClasses(frame({ layout: { direction: 'grid' } }, { tablet: { hidden: true } })), 'grid grid-cols-2 max-lg:hidden');
});

test('typography, color, radius, border, shadow, opacity', () => {
  assert.equal(
    compileClasses(text({ color: 'white/60', font: { family: 'heading', size: 48, weight: 700, tracking: -0.025, leading: 1.5, align: 'center', transform: 'uppercase' } })),
    'text-white/60 font-heading text-5xl font-bold leading-normal tracking-tight text-center uppercase',
  );
  assert.equal(compileClasses(text({ font: { size: 17, tracking: 0.2, leading: 1.1 } })), 'text-[17px] leading-[1.1] tracking-[0.2em]');
  assert.equal(compileClasses(text({ radius: 12 })), 'rounded-xl');
  assert.equal(compileClasses(text({ radius: 'full' })), 'rounded-full');
  assert.equal(compileClasses(text({ radius: [8, 8, 0, 0] })), 'rounded-t-lg', 'zero corners are the initial value');
  assert.equal(compileClasses(text({ radius: [8, 0, 0, 8] })), 'rounded-l-lg');
  assert.equal(compileClasses(text({ radius: [8, 4, 2, 6] })), 'rounded-tl-lg rounded-tr-sm rounded-bl-md rounded-br-xs');
  assert.equal(compileClasses(text({ border: { color: 'white/10' } })), 'border border-white/10');
  assert.equal(compileClasses(text({ border: { width: 2, sides: 'left', style: 'dashed' } })), 'border-l-2 border-dashed');
  assert.equal(compileClasses(text({ border: { sides: ['top', 'bottom'] } })), 'border-y');
  assert.equal(compileClasses(text({ shadow: { size: 'xl', color: 'violet-500/30' } })), 'shadow-xl shadow-violet-500/30');
  assert.equal(compileClasses(text({ opacity: 0.9, clip: true })), 'opacity-90 overflow-hidden');
  assert.equal(compileClasses(text({ fill: '#0f172a' })), 'bg-[#0f172a]');
});

test('sizing and rest split a component root between instance and component', () => {
  const src = frame({ width: 'fill', layout: { gap: 8 }, fill: 'white' });
  assert.equal(compileClasses(src, ROW, 'sizing'), 'grow basis-0 min-w-0');
  assert.equal(compileClasses(src, ROW, 'rest'), 'flex flex-col gap-2 bg-white');
});

test('colors: tokens, palette, hex, opacity', () => {
  const theme = new Set(['primary']);
  assert.equal(parseColor('primary/20', theme).suffix, 'primary/20');
  assert.equal(parseColor('slate-950', theme).suffix, 'slate-950');
  assert.equal(parseColor('#fff', theme).suffix, '[#fff]');
  assert.equal(parseColor('white', theme).suffix, 'white');
  assert.equal(parseColor('brand', theme).ok, false);
  assert.equal(parseColor('primary/150', theme).ok, false);
  assert.equal(parseColor('slate-951', theme).ok, false);
});

test('every reset class is a real Tailwind v4 utility', async () => {
  assert.deepEqual(await invalidClasses(RESET_CLASSES), []);
});
