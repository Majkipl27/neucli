import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validate } from '../src/core/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (file: string) => yaml.load(fs.readFileSync(path.join(root, file), 'utf-8'));

/** Minimal valid config with overrides. */
function config(extra: Record<string, unknown> = {}, sections: unknown[] = [{ type: 'text', content: 'hi' }]) {
  return { meta: { name: 'T' }, pages: [{ path: '/', name: 'Home', sections }], ...extra };
}

function errorsOf(raw: unknown): string[] {
  const result = validate(raw);
  assert.ok(!result.config, 'expected validation to fail');
  return result.errors;
}

function assertError(raw: unknown, pattern: RegExp) {
  const errors = errorsOf(raw);
  assert.ok(errors.some(e => pattern.test(e)), `no error matching ${pattern}:\n${errors.join('\n')}`);
}

for (const file of ['examples/nova.yml', 'examples/landing-page.yaml', 'test/fixtures/regression.yaml']) {
  test(`${file} is valid`, () => {
    const result = validate(load(file));
    assert.deepEqual(result.errors, []);
    assert.ok(result.config);
  });
}

test('prop shorthand normalises to { type }', () => {
  const result = validate(config({
    components: { Card: { props: { title: 'text', n: { type: 'number', default: 2 } }, root: { type: 'text', content: '{title}' } } },
  }));
  assert.deepEqual(result.config?.components?.Card.props, { title: { type: 'text' }, n: { type: 'number', default: 2 } });
});

test('numbers in content become strings', () => {
  const result = validate(config({}, [{ type: 'text', content: 2026 }]));
  assert.equal((result.config?.pages[0].sections[0] as { content: string }).content, '2026');
});

test('old built-in types point at components', () => {
  assertError(config({}, [{ type: 'hero', props: { title: 'x' } }]), /unknown type "hero".*was a built-in before v2/);
});

test('the old globals: format is detected', () => {
  assertError({ ...config(), globals: { navbar: { type: 'navbar' } } }, /old \(v1\) format/);
});

test('unknown keys are reported with their path', () => {
  assertError(config({}, [{ type: 'frame', children: [{ type: 'text', content: 'x', colour: 'red' }] }]),
    /pages\[0\]\.sections\[0\]\.children\[0\]: Unrecognized key: "colour"/);
});

test('instances may override fill, color and border', () => {
  const result = validate(config({ components: { Box: { root: { type: 'frame' } } } },
    [{ type: 'Box', fill: 'white', color: 'slate-900', border: { color: 'violet-500' }, responsive: { phone: { fill: 'black' } } }]));
  assert.deepEqual(result.errors, []);
});

test('styling an instance beyond the overridable keys explains detach', () => {
  assertError(config({ components: { Box: { root: { type: 'frame' } } } }, [{ type: 'Box', radius: 12 }]),
    /Unrecognized key: "radius" — an instance takes props.*fill, color, border.*detach/);
});

test('bad values', () => {
  assertError(config({}, [{ type: 'frame', layout: { gap: -4 } }]), /layout\.gap/);
  assertError(config({}, [{ type: 'frame', layout: { direction: 'diagonal' } }]), /layout\.direction/);
  assertError(config({}, [{ type: 'text', content: 'x', width: '12 apples' }]), /width/);
  assertError(config({}, [{ type: 'text', content: 'x', color: 'not a color!' }]), /color/);
  assertError(config({}, [{ type: 'link', href: '/', content: 'a', children: [{ type: 'text', content: 'b' }] }]), /content or children/);
});

test('theme tokens must exist', () => {
  assertError(config({ theme: { colors: { primary: '#000' } } }, [{ type: 'text', content: 'x', fill: 'brand' }]),
    /fill: "brand" is not a theme color.*Theme colors: primary/);
  assertError(config({}, [{ type: 'text', content: 'x', font: { family: 'display' } }]), /"display" is not a theme font/);
  assert.deepEqual(validate(config({ theme: { colors: { brand: '#000' } } }, [{ type: 'text', content: 'x', fill: 'brand/50' }])).errors, []);
});

test('component names are PascalCase, so they cannot collide by case', () => {
  assertError(config({ components: { 'inner-note': { root: { type: 'text', content: 'x' } } } }), /PascalCase \(e\.g\. InnerNote\)/);
});

test('instance types must match a component exactly, with a hint', () => {
  assertError(config({ components: { InnerNote: { root: { type: 'text', content: 'x' } } } }, [{ type: 'Innernote' }]),
    /no component named Innernote \(did you mean InnerNote\?\)/);
});

test('a component named like a primitive or App is an error, not silently ignored', () => {
  assertError(config({ components: { Text: { root: { type: 'text', content: 'x' } } } }), /"Text" is reserved/);
  assertError(config({ components: { App: { root: { type: 'frame' } } } }), /"App" is reserved/);
});

test('props are declared and typed', () => {
  const components = { Card: { props: { title: 'text', n: 'number' }, root: { type: 'text', content: '{title}' } } };
  assertError(config({ components }, [{ type: 'Card', props: { titel: 'x' } }]), /Card has no prop "titel" \(props: title, n\)/);
  assertError(config({ components }, [{ type: 'Card', props: { n: 'five' } }]), /expected number, got string/);
  assertError(config({ components: { Card: { props: { children: 'text' }, root: { type: 'frame' } } } }), /"children" is reserved/);
});

test('slots', () => {
  assertError(config({}, [{ type: 'slot' }]), /slots only exist inside component definitions/);
  assertError(config({ components: { Box: { root: { type: 'frame' } } } }, [{ type: 'Box', children: [{ type: 'text', content: 'x' }] }]),
    /Box has no slot for children/);
  assertError(config({ components: { Box: { root: { type: 'frame', children: [{ type: 'slot' }] } } } }, [{ type: 'Box', slots: { side: [] } }]),
    /Box has no slot named "side"/);
  assertError(config({ components: { Box: { root: { type: 'slot' } } } }), /root of a component can't be a slot/);
});

test('layouts need a default slot', () => {
  assertError(config({ layout: 'Shell', components: { Shell: { root: { type: 'frame' } } } }), /layout "Shell" needs a \{ type: slot \}/);
  assertError(config({ layout: 'Nope' }), /layout "Nope" is not a component/);
});

test('component cycles', () => {
  assertError(config({
    components: {
      ABox: { root: { type: 'frame', children: [{ type: 'BBox' }] } },
      BBox: { root: { type: 'frame', children: [{ type: 'ABox' }] } },
    },
  }), /cycle detected \(ABox -> BBox -> ABox\)/);
});

test('page names and paths must not collide (case-insensitively)', () => {
  const pages = [
    { path: '/', name: 'About', sections: [] },
    { path: '/', name: 'about!', sections: [] },
    { path: '/c', name: 'Card', sections: [] },
    { path: '/d', name: 'Router', sections: [] },
  ];
  const errors = errorsOf({ meta: { name: 'T' }, components: { Card: { root: { type: 'frame' } } }, pages });
  assert.ok(errors.some(e => /"about!" collides with pages\[0\]\.name/.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /path: "\/" is already used/.test(e)));
  assert.ok(errors.some(e => /collides with the component Card/.test(e)));
  assert.ok(errors.some(e => /"Router" is reserved/.test(e)));
});

test('instances can only be hidden per breakpoint', () => {
  const components = { Box: { root: { type: 'frame' } } };
  assertError(config({ components }, [{ type: 'Box', hidden: true }]), /only be hidden per breakpoint/);
  assert.deepEqual(validate(config({ components }, [{ type: 'Box', responsive: { phone: { hidden: true } } }])).errors, []);
});

test('interactions parse, with a warning that they are not generated yet', () => {
  const result = validate(config({}, [{
    type: 'frame',
    state: { open: false },
    children: [
      { type: 'text', content: 'Q', on: { click: 'toggle open' } },
      { type: 'text', content: 'A', visibleWhen: 'open' },
    ],
  }]));
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join(), /Phase 6/);
  assertError(config({}, [{ type: 'text', content: 'Q', on: { click: 'explode now please' } }]), /action like "toggle open"/);
});

test('a component needs root or file', () => {
  assertError(config({ components: { Box: {} } }), /exactly one of root or file/);
});
