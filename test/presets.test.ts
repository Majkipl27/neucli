/**
 * Presets (layouts and blocks): each validates once inserted, inserting
 * handles name clashes, and a site that uses every preset generates, uses
 * only real Tailwind classes, and (with NEUCLI_TEST_NODE_MODULES) builds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { PRESETS, insertPreset, validate } from '../src/core/index.ts';
import type { Config, Node } from '../src/core/index.ts';
import { runPipeline } from '../src/generator/index.ts';
import { classesInSource, invalidClasses } from './tailwind.ts';

const nodeModules = process.env.NEUCLI_TEST_NODE_MODULES;
const canBuild = !!nodeModules && fs.existsSync(path.join(nodeModules, '.bin', 'tsc'));
const skipBuild = canBuild ? false : 'set NEUCLI_TEST_NODE_MODULES to an installed generated project\'s node_modules';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neucli-presets-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

function base(): Config {
  return { meta: { name: 'Presets' }, pages: [{ path: '/', name: 'Home', sections: [{ type: 'text', content: 'Hi' } as Node] }] } as Config;
}

for (const preset of PRESETS) {
  test(`preset ${preset.id} validates once inserted`, () => {
    const inserted = insertPreset(base(), preset.id)!;
    const page = inserted.config.pages[0];
    const config: Config = {
      ...inserted.config,
      pages: [preset.kind === 'layout'
        ? { ...page, layout: inserted.name }
        : { ...page, sections: [{ type: inserted.name } as Node] }],
    };
    assert.deepEqual(validate(config).errors, []);
  });
}

test('inserting a preset twice reuses identical definitions', () => {
  const once = insertPreset(base(), 'marketing')!;
  const twice = insertPreset(once.config, 'marketing')!;
  assert.equal(twice.name, 'Marketing');
  assert.deepEqual(Object.keys(twice.config.components!), ['Marketing', 'Navbar', 'Footer']);
});

test('a name clash gets a free name and references follow it', () => {
  const config = { ...base(), components: { Navbar: { root: { type: 'frame' } as Node } } } as Config;
  const inserted = insertPreset(config, 'marketing')!;
  assert.equal(inserted.names.Navbar, 'Navbar2');
  const marketing = inserted.config.components!.Marketing.root as { children: Node[] };
  assert.equal(marketing.children[0].type, 'Navbar2');
  assert.deepEqual(inserted.config.components!.Navbar, { root: { type: 'frame' } }, 'the user\'s Navbar is untouched');
});

/** One page per layout, every block on the first page. */
function everyPreset(): Config {
  let config = base();
  const names: Record<string, string> = {};
  for (const p of PRESETS) {
    const inserted = insertPreset(config, p.id)!;
    config = inserted.config;
    names[p.id] = inserted.name;
  }
  const block = (id: string, extra: Record<string, unknown> = {}) => ({ type: names[id], ...extra } as Node);
  config.pages = [
    {
      path: '/', name: 'Home', layout: names.marketing,
      sections: [
        block('hero', { children: [block('button'), block('button', { props: { label: 'Learn more', href: '/about' } })] }),
        block('section', {
          props: { title: 'Features' },
          children: [{
            type: 'frame', layout: { direction: 'grid', columns: 3, gap: 24 },
            responsive: { phone: { layout: { columns: 1 } } },
            children: [block('card'), block('card', { props: { title: 'Second' } }), block('card')],
          } as Node],
        }),
      ],
    },
    { path: '/app', name: 'App home', layout: names['sidebar-app'], sections: [block('card', { props: { title: 'Inside the app' } })] },
    { path: '/dashboard', name: 'Dashboard page', layout: names.dashboard, sections: [block('stat'), block('stat', { props: { value: '1,204' } }), block('stat')] },
  ];
  return config;
}

test('a site using every preset validates', () => {
  assert.deepEqual(validate(everyPreset()).errors, []);
});

async function generateEvery(dir: string) {
  const file = path.join(tmp, `${dir}.yaml`);
  fs.writeFileSync(file, yaml.dump(everyPreset(), { noRefs: true, lineWidth: -1 }));
  const out = path.join(tmp, dir);
  await runPipeline(file, out, { quiet: true });
  return out;
}

test('every preset: generated classes are Tailwind v4 utilities', async () => {
  const out = await generateEvery('classes');
  const classes = fs.readdirSync(path.join(out, 'src'), { recursive: true, encoding: 'utf-8' })
    .filter(f => f.endsWith('.tsx'))
    .flatMap(f => classesInSource(fs.readFileSync(path.join(out, 'src', f), 'utf-8')));
  assert.ok(classes.length > 40);
  assert.deepEqual(await invalidClasses(classes), []);
});

test('every preset: typechecks and builds with Vite', { skip: skipBuild }, async () => {
  const out = await generateEvery('build');
  fs.symlinkSync(nodeModules!, path.join(out, 'node_modules'), 'dir');
  for (const [bin, args] of [['tsc', ['-b']], ['vite', ['build', '--logLevel', 'error']]] as const) {
    try {
      execFileSync(path.join(nodeModules!, '.bin', bin), [...args], { cwd: out, encoding: 'utf-8', stdio: 'pipe' });
    } catch (err: any) {
      assert.fail(`${bin} failed:\n${err.stdout}${err.stderr}`);
    }
  }
  assert.ok(fs.existsSync(path.join(out, 'dist', 'index.html')));
});

test('an identical definition under another name is reused', () => {
  const clash = { ...base(), components: { Navbar: { root: { type: 'frame' } as Node } } } as Config;
  const marketing = insertPreset(clash, 'marketing')!; // brings Navbar2
  const navbar = insertPreset(marketing.config, 'navbar')!;
  assert.equal(navbar.name, 'Navbar2');
  assert.deepEqual(Object.keys(navbar.config.components!), ['Navbar', 'Marketing', 'Navbar2', 'Footer']);
});
