/**
 * Generate configs and check the output: shape, classes, and (optionally) a
 * real typecheck + Vite build.
 *
 * Typecheck/build need the generated project's dependencies. Installing per
 * run is slow, so point NEUCLI_TEST_NODE_MODULES at an installed generated
 * project (landing-page has every dependency the fixtures use):
 *
 *   node bin/cli.ts generate examples/landing-page.yaml -o /tmp/acme && (cd /tmp/acme && npm i)
 *   NEUCLI_TEST_NODE_MODULES=/tmp/acme/node_modules npm test
 *
 * Without it, those tests are skipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/generator/index.ts';
import { classesInSource, invalidClasses } from './tailwind.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = process.env.NEUCLI_TEST_NODE_MODULES;
const canBuild = !!nodeModules && fs.existsSync(path.join(nodeModules, '.bin', 'tsc'));
const skipBuild = canBuild ? false : 'set NEUCLI_TEST_NODE_MODULES to an installed generated project\'s node_modules';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neucli-test-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

function outDir(name: string) {
  return path.join(tmp, name.replace(/\W/g, '-'));
}

async function generate(config: string, out = outDir(config)) {
  const report = await runPipeline(path.isAbsolute(config) ? config : path.join(root, config), out, { quiet: true });
  return { out, report };
}

function read(out: string, file: string) {
  return fs.readFileSync(path.join(out, file), 'utf-8');
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter(f => f.endsWith('.tsx'))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf-8'));
}

function run(bin: string, args: string[], cwd: string) {
  try {
    execFileSync(path.join(nodeModules!, '.bin', bin), args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
  } catch (err: any) {
    assert.fail(`${bin} failed in ${cwd}:\n${err.stdout}${err.stderr}`);
  }
}

function writeConfig(name: string, body: string): string {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, body);
  return file;
}

const CONFIGS = ['examples/landing-page.yaml', 'examples/nova.yml', 'test/fixtures/regression.yaml'];

for (const config of CONFIGS) {
  test(`${config}: every generated class is a Tailwind v4 utility`, async () => {
    const { out } = await generate(config);
    const classes = sources(path.join(out, 'src')).flatMap(classesInSource);
    assert.ok(classes.length > 20, 'expected plenty of classes');
    assert.deepEqual(await invalidClasses(classes), []);
  });

  test(`${config}: typechecks and builds with Vite`, { skip: skipBuild }, async (t) => {
    const { out } = await generate(config, outDir(`${config}-build`));
    const pkg = JSON.parse(read(out, 'package.json'));
    const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(dep => !fs.existsSync(path.join(nodeModules!, dep)));
    if (missing.length > 0) {
      t.skip(`NEUCLI_TEST_NODE_MODULES lacks ${missing.join(', ')}`);
      return;
    }
    fs.symlinkSync(nodeModules!, path.join(out, 'node_modules'), 'dir');
    run('tsc', ['-b'], out);
    run('vite', ['build', '--logLevel', 'error'], out);
    assert.ok(fs.existsSync(path.join(out, 'dist', 'index.html')));
  });
}

test('regression: components only reachable through other components get files; unused ones do not', async () => {
  const { out } = await generate('test/fixtures/regression.yaml');
  const files = fs.readdirSync(path.join(out, 'src', 'neucli', 'components')).sort();
  assert.deepEqual(files, ['Badge.tsx', 'Card.tsx', 'Counter.tsx', 'FeaturedCard.tsx', 'Nav.tsx', 'Shell.tsx']);
});

test('regression: braces are literal outside components, interpolated inside', async () => {
  const { out } = await generate('test/fixtures/regression.yaml');
  const home = read(out, 'src/neucli/pages/Home.tsx');
  assert.ok(home.includes('{"Price < 10 {not code} & more > less"}'), home);
  assert.ok(home.includes('{"Open {menu}"}'));
  const card = read(out, 'src/neucli/components/Card.tsx');
  assert.ok(card.includes('<Text tag="h3">{title}</Text>'), card);
  assert.ok(card.includes('src={image} alt={title}'));
  assert.ok(card.includes('{`Seen ${count} times, literal {not code} and \\`ticks\\` \\${\'{\'}x}`}'), card);
  assert.ok(read(out, 'src/neucli/components/Counter.tsx').includes('onClick={increment}'));
  assert.ok(read(out, 'src/neucli/pages/BarePage.tsx').includes('{"  leading spaces stay  "}'));
  assert.match(home, /useSEO\(\{ title: "Quotes \\" and `backticks` and \$\{injection\}"/);
});

test('regression: instances get sizing and style overrides from where they are placed', async () => {
  const { out } = await generate('test/fixtures/regression.yaml');
  const home = read(out, 'src/neucli/pages/Home.tsx');
  assert.ok(home.includes('<Badge label="2026" overrides="bg-brand/10 text-brand max-md:hidden" />'), 'hidden on phone only');
  assert.ok(home.includes('overrides="w-full bg-white border border-slate-200"'), 'width: fill inside a grid');
  assert.ok(home.includes('<Card title="Three" count={1} overrides="w-fit bg-white border border-slate-200" />'), 'instance override wins');
  assert.ok(home.includes('<FeaturedCard title="Two" />'), 'same as the default: nothing passed');
  assert.ok(
    home.includes('<Card title="Four" overrides="w-full bg-slate-900 text-white border border-violet-500" />'),
    'per-copy fill and color win; border keeps its width and only changes color',
  );
  const card = read(out, 'src/neucli/components/Card.tsx');
  assert.ok(card.includes('overrides = "self-stretch bg-white border border-slate-200"'), 'defaults: sizing for a column parent, plus fill and border');
  assert.ok(card.includes('cx("flex flex-col gap-3 p-6 rounded-xl", overrides, className)'), 'overridable styles are not repeated in the root classes');
  assert.ok(read(out, 'src/neucli/components/FeaturedCard.tsx').includes('overrides={overrides ?? "w-80 bg-white border border-slate-200"}'));
});

test('regression: layouts wrap routes, pages can opt out, anchors scroll', async () => {
  const { out } = await generate('test/fixtures/regression.yaml');
  const app = read(out, 'src/neucli/App.tsx');
  assert.match(app, /<Route element=\{<Shell><Outlet \/><\/Shell>\}>\n\s+<Route path="\/" element=\{<Home \/>\} \/>\n\s+<Route path="\/about"/);
  assert.match(app, /<\/Route>\n\s+<Route path="\/bare" element=\{<BarePage \/>\} \/>/);
  assert.match(app, /<ScrollToHash \/>/);
  assert.ok(fs.existsSync(path.join(out, 'src', 'neucli', 'ScrollToHash.tsx')));
  assert.match(read(out, 'src/neucli/primitives/InternalLink.tsx'), /from 'react-router-dom'/);
  assert.equal(read(out, 'src/neucli/primitives/Frame.tsx'), fs.readFileSync(path.join(root, 'src/core/primitives/Frame.tsx'), 'utf-8'));
});

test('theme becomes Tailwind v4 @theme and Google Fonts', async () => {
  const { out } = await generate('test/fixtures/regression.yaml');
  assert.match(read(out, 'src/index.css'), /@import "tailwindcss";\n@import "\.\/neucli\/theme\.css";/);
  const css = read(out, 'src/neucli/theme.css');
  assert.match(css, /--color-brand: #7c3aed;/);
  assert.match(css, /--font-heading: "Space Grotesk", sans-serif;/);
  assert.match(css, /--default-font-family: var\(--font-body\);/);
  assert.match(read(out, 'index.html'), /family=Space\+Grotesk.*family=IBM\+Plex\+Sans/);
  assert.match(read(out, 'vite.config.ts'), /tailwindcss\(\)/);
  assert.ok(!fs.existsSync(path.join(out, 'tailwind.config.js')));
});

test('single page: no router, plain links', async () => {
  const file = writeConfig('single.yaml', `
meta: { name: Single }
pages:
  - path: /
    name: Home
    sections:
      - { type: link, href: /about, content: About }
`);
  const { out } = await generate(file);
  const pkg = JSON.parse(read(out, 'package.json'));
  assert.equal(pkg.dependencies['react-router-dom'], undefined);
  assert.equal(read(out, 'src/neucli/primitives/InternalLink.tsx'), fs.readFileSync(path.join(root, 'src/core/primitives/InternalLink.tsx'), 'utf-8'));
  assert.ok(!fs.existsSync(path.join(out, 'src', 'neucli', 'ScrollToHash.tsx')));
  assert.match(read(out, 'src/neucli/App.tsx'), /return \(\n\s+<Home \/>\n\s+\);/);
});

test('switching configs removes stale generated files', async () => {
  const out = outDir('switch');
  await generate('test/fixtures/regression.yaml', out);
  const file = writeConfig('switch.yaml', 'meta: { name: S }\npages: [{ path: /, name: Home, sections: [] }]\n');
  const { report } = await generate(file, out);
  const removed = report.removed.map(f => path.basename(f)).sort();
  assert.ok(removed.includes('About.tsx') && removed.includes('Card.tsx') && removed.includes('ScrollToHash.tsx'), removed.join(', '));
});

test('a second run with no changes reports nothing to do', async () => {
  const out = outDir('rerun');
  await generate('examples/nova.yml', out);
  const { report } = await generate('examples/nova.yml', out);
  assert.equal(report.totalChanges, 0, report.summary());
});

test('invalid config is rejected with every error', async () => {
  await assert.rejects(generate('test/fixtures/invalid.yaml'), (err: Error) => {
    assert.match(err.message, /components\.promo-box: component names are PascalCase \(e\.g\. PromoBox\)/);
    assert.match(err.message, /sections\[0\]\.props\.titel: Card has no prop "titel"/);
    assert.match(err.message, /sections\[1\]\.fill: "brand" is not a theme color/);
    assert.match(err.message, /sections\[2\]\.type: no component named Promobox/);
    assert.match(err.message, /"home!" collides with pages\[0\]\.name/);
    assert.match(err.message, /path: "\/" is already used/);
    return true;
  });
});
