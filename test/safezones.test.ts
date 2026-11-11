/**
 * Phase 8: the manifest, hand-edit protection, starter files, the package.json
 * merge, old-layout migration, `file:` components and per-instance ids.
 *
 * Builds and server renders need NEUCLI_TEST_NODE_MODULES (see generate.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPipeline, GenerateError } from '../src/generator/index.ts';
import type { PipelineOptions } from '../src/generator/index.ts';
import { validate } from '../src/core/index.ts';

const nodeModules = process.env.NEUCLI_TEST_NODE_MODULES;
const canBuild = !!nodeModules && fs.existsSync(path.join(nodeModules, '.bin', 'tsc'));
const skipBuild = canBuild ? false : 'set NEUCLI_TEST_NODE_MODULES to an installed generated project\'s node_modules';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neucli-safe-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function config(body: string): string {
  const file = path.join(tmp, `config-${n++}.yaml`);
  fs.writeFileSync(file, body);
  return file;
}
const run = (cfg: string, out: string, options: PipelineOptions = {}) => runPipeline(cfg, out, { quiet: true, ...options });
const read = (out: string, rel: string) => fs.readFileSync(path.join(out, rel), 'utf-8');
const write = (out: string, rel: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), content);
};
const exists = (out: string, rel: string) => fs.existsSync(path.join(out, rel));
const manifest = (out: string) => JSON.parse(read(out, '.neucli/manifest.json'));

const ONE_PAGE = (title = 'Hello') => config(`
meta: { name: Safe }
components:
  Card: { props: { title: text }, root: { type: frame, children: [{ type: text, content: '{title}' }] } }
pages:
  - { path: /, name: Home, sections: [{ type: text, content: ${title} }, { type: Card, props: { title: A } }] }
`);
const TWO_PAGES = config(`
meta: { name: Safe }
pages:
  - { path: /, name: Home, sections: [{ type: text, content: Home }] }
  - { path: /about, name: About, sections: [{ type: text, content: About }] }
`);

test('fresh run: generated code under src/neucli, starter files, manifest', async () => {
  const out = path.join(tmp, 'fresh');
  const report = await run(ONE_PAGE(), out);
  for (const rel of ['src/neucli/App.tsx', 'src/neucli/pages/Home.tsx', 'src/neucli/components/Card.tsx', 'src/neucli/theme.css', 'index.html']) {
    assert.ok(report.added.includes(rel), rel);
    assert.ok(manifest(out).files[rel], `${rel} tracked`);
  }
  for (const rel of ['src/main.tsx', 'src/index.css', 'vite.config.ts', 'tsconfig.json', 'src/custom/README.md']) {
    assert.ok(report.created.includes(rel), rel);
    assert.equal(manifest(out).files[rel], undefined, `${rel} is yours, not tracked`);
  }
  assert.match(read(out, 'src/main.tsx'), /import App from '\.\/neucli\/App';/);
  assert.ok(!exists(out, 'src/components') && !exists(out, 'src/App.tsx'));
});

test('a re-run with nothing changed writes nothing', async () => {
  const out = path.join(tmp, 'rerun');
  await run(ONE_PAGE(), out);
  const report = await run(ONE_PAGE(), out);
  assert.equal(report.totalChanges, 0, report.summary());
  assert.deepEqual(report.skipped, []);
});

test('hand-edited generated files are skipped with a warning; --force overwrites', async () => {
  const out = path.join(tmp, 'edited');
  await run(ONE_PAGE('Hello'), out);
  const edited = read(out, 'src/neucli/pages/Home.tsx') + '\n// my tweak\n';
  write(out, 'src/neucli/pages/Home.tsx', edited);

  const changed = await run(ONE_PAGE('Changed'), out);
  assert.deepEqual(changed.skipped, ['src/neucli/pages/Home.tsx']);
  assert.equal(read(out, 'src/neucli/pages/Home.tsx'), edited, 'the edit survives');

  const again = await run(ONE_PAGE('Changed'), out);
  assert.deepEqual(again.skipped, ['src/neucli/pages/Home.tsx'], 'still flagged on the next run');

  const forced = await run(ONE_PAGE('Changed'), out, { force: true });
  assert.ok(forced.updated.includes('src/neucli/pages/Home.tsx'));
  assert.match(read(out, 'src/neucli/pages/Home.tsx'), /Changed/);
  assert.deepEqual((await run(ONE_PAGE('Changed'), out)).skipped, []);
});

test('stale files go only while untouched; your files are never touched', async () => {
  const out = path.join(tmp, 'stale');
  await run(ONE_PAGE(), out);
  write(out, 'src/custom/Mine.tsx', 'export default 1;\n');
  write(out, 'src/neucli/components/Extra.tsx', 'export default 2;\n'); // not neucli's, even in its folder
  write(out, 'src/index.css', read(out, 'src/index.css') + '\nbody { color: red; }\n');
  write(out, 'NOTES.md', 'mine\n');
  write(out, 'src/neucli/components/Card.tsx', read(out, 'src/neucli/components/Card.tsx') + '// edited\n');

  const report = await run(TWO_PAGES, out); // Card is gone from the config
  assert.deepEqual(report.skipped, ['src/neucli/components/Card.tsx'], 'edited stale file kept');
  assert.ok(exists(out, 'src/neucli/components/Card.tsx'));
  assert.equal(read(out, 'src/custom/Mine.tsx'), 'export default 1;\n');
  assert.equal(read(out, 'src/neucli/components/Extra.tsx'), 'export default 2;\n');
  assert.match(read(out, 'src/index.css'), /color: red/);
  assert.equal(read(out, 'NOTES.md'), 'mine\n');

  const forced = await run(TWO_PAGES, out, { force: true });
  assert.ok(forced.removed.includes('src/neucli/components/Card.tsx'));
  assert.ok(exists(out, 'src/neucli/components/Extra.tsx'), '--force still leaves files neucli never wrote');

  const back = await run(ONE_PAGE(), out);
  const removed = await run(TWO_PAGES, out);
  assert.ok(back.added.includes('src/neucli/components/Card.tsx'));
  assert.ok(removed.removed.includes('src/neucli/components/Card.tsx'), 'untouched stale file is removed');
});

test('package.json keeps your dependencies, scripts and versions', async () => {
  const out = path.join(tmp, 'pkg');
  await run(ONE_PAGE(), out);
  const pkg = JSON.parse(read(out, 'package.json'));
  pkg.dependencies['date-fns'] = '^4.0.0';
  pkg.dependencies.react = '^19.9.9'; // bumped by hand
  pkg.scripts.lint = 'eslint .';
  pkg.scripts.build = 'vite build';
  pkg.author = 'me';
  write(out, 'package.json', JSON.stringify(pkg, null, 2) + '\n');

  await run(TWO_PAGES, out); // needs the router now
  let next = JSON.parse(read(out, 'package.json'));
  assert.equal(next.dependencies['react-router-dom'], '^7.9.0');
  assert.equal(next.dependencies['date-fns'], '^4.0.0');
  assert.equal(next.dependencies.react, '^19.9.9', 'a version you changed is yours');
  assert.equal(next.scripts.lint, 'eslint .');
  assert.equal(next.scripts.build, 'vite build');
  assert.equal(next.author, 'me');

  await run(ONE_PAGE(), out); // router no longer needed: it was neucli's, so it goes
  next = JSON.parse(read(out, 'package.json'));
  assert.equal(next.dependencies['react-router-dom'], undefined);
  assert.equal(next.dependencies['date-fns'], '^4.0.0');
});

test('a folder with files neucli did not write is refused untouched; --force writes', async () => {
  const out = path.join(tmp, 'foreign');
  write(out, 'index.html', '<p>someone else\'s site</p>\n');
  write(out, 'README.md', 'theirs\n');
  await assert.rejects(run(ONE_PAGE(), out), (err: Error) => {
    assert.ok(err instanceof GenerateError);
    assert.match(err.message, /index\.html/);
    assert.match(err.message, /--force/);
    return true;
  });
  assert.ok(!exists(out, '.neucli') && !exists(out, 'src'), 'nothing written');

  const report = await run(ONE_PAGE(), out, { force: true });
  assert.ok(report.updated.includes('index.html'));
  assert.equal(read(out, 'README.md'), 'theirs\n');
});

test('an old-layout folder is detected and --migrate switches it to src/neucli', async () => {
  const out = path.join(tmp, 'old');
  write(out, '.neucli/config.lock.yaml', 'meta: { name: Old }\n');
  write(out, 'src/components/Card.tsx', 'old');
  write(out, 'src/pages/Home.tsx', 'old');
  write(out, 'src/primitives/Frame.tsx', 'old');
  write(out, 'src/hooks/useSEO.ts', 'old');
  write(out, 'src/App.tsx', 'old');
  write(out, 'src/main.tsx', "import App from './App';\n");
  write(out, 'index.html', '<old/>');
  write(out, 'postcss.config.js', 'old');
  write(out, 'src/custom/Mine.tsx', 'mine');
  write(out, 'package.json', JSON.stringify({ name: 'old', dependencies: { react: '^18.3.1', 'date-fns': '^3.0.0' } }, null, 2));

  await assert.rejects(run(ONE_PAGE(), out), /older neucli[\s\S]*--migrate/);
  assert.equal(read(out, 'src/App.tsx'), 'old', 'nothing touched without --migrate');

  const report = await run(ONE_PAGE(), out, { migrate: true });
  for (const rel of ['src/components/Card.tsx', 'src/pages/Home.tsx', 'src/primitives/Frame.tsx', 'src/App.tsx', 'postcss.config.js']) {
    assert.ok(report.removed.includes(rel), rel);
    assert.ok(!exists(out, rel), rel);
  }
  assert.ok(!exists(out, 'src/components'), 'empty old folders go too');
  assert.match(read(out, 'src/main.tsx'), /\.\/neucli\/App/);
  assert.match(read(out, 'index.html'), /<title>Safe<\/title>/);
  assert.equal(read(out, 'src/custom/Mine.tsx'), 'mine');
  const pkg = JSON.parse(read(out, 'package.json'));
  assert.equal(pkg.dependencies.react, '^19.2.0', 'neucli\'s old versions are updated');
  assert.equal(pkg.dependencies['date-fns'], '^3.0.0');
  assert.equal((await run(ONE_PAGE(), out)).totalChanges, 0);
});

// --- file: components ---------------------------------------------------------------

test('file: components validate their path and declared props', () => {
  const cfg = (file: string, extra = '') => ({
    meta: { name: 'F' },
    components: { Pricing: { file, props: { plan: 'text' }, ...(extra ? { logic: extra } : {}) } },
    pages: [{ path: '/', name: 'Home', sections: [{ type: 'Pricing', props: { plan: 'Pro', nope: 1 } }] }],
  });
  const errors = (c: unknown) => validate(c).errors.join('\n');
  assert.match(errors(cfg('./custom/Pricing.tsx')), /Pricing has no prop "nope"/);
  assert.doesNotMatch(errors(cfg('./custom/Pricing.tsx')), /file/);
  assert.match(errors(cfg('../outside.tsx')), /file must stay inside src\//);
  assert.match(errors(cfg('./neucli/Pricing.tsx')), /src\/neucli\/ is rewritten/);
  assert.match(errors(cfg('./custom/Pricing.css')), /\.tsx, \.ts, \.jsx or \.js/);
  assert.match(errors(cfg('./custom/Pricing.tsx', 'const x = 1;')), /logic and imports only apply/);
  assert.deepEqual(validate(cfg('./custom/Pricing.tsx')).warnings, []);
});

const FILE_CONFIG = config(`
meta: { name: Files }
layout: Shell
components:
  Shell: { file: ./custom/Shell.tsx }
  Pricing:
    file: ./custom/Pricing.tsx
    props: { plan: text, seats: number }
  Wrapper:
    root: { type: frame, children: [{ type: Pricing, props: { plan: Inner } }] }
pages:
  - path: /
    name: Home
    sections:
      - type: Pricing
        props: { plan: Pro, seats: 3 }
        width: fill
        fill: slate-900
        className: shadow-lg
        children: [{ type: text, content: Inside }]
      - { type: Wrapper }
`);

test('file: components are imported from src/, stubbed when missing, never overwritten', async () => {
  const out = path.join(tmp, 'files');
  const report = await run(FILE_CONFIG, out);
  assert.ok(report.created.includes('src/custom/Pricing.tsx'), 'missing file gets a starter');
  assert.ok(!exists(out, 'src/neucli/components/Pricing.tsx'), 'no generated copy');
  assert.equal(manifest(out).files['src/custom/Pricing.tsx'], undefined);

  const home = read(out, 'src/neucli/pages/Home.tsx');
  assert.match(home, /import Pricing from '\.\.\/\.\.\/custom\/Pricing';/);
  // width: fill in a column is self-stretch; instance styles and className become one className.
  assert.match(home, /<Pricing plan="Pro" seats=\{3\} className="self-stretch bg-slate-900 shadow-lg">/);
  assert.match(read(out, 'src/neucli/components/Wrapper.tsx'), /import Pricing from '\.\.\/\.\.\/custom\/Pricing';/);
  assert.match(read(out, 'src/neucli/App.tsx'), /import Shell from '\.\.\/custom\/Shell';/);

  write(out, 'src/custom/Pricing.tsx', 'export default function Pricing() { return null; }\n');
  const again = await run(FILE_CONFIG, out);
  assert.equal(read(out, 'src/custom/Pricing.tsx'), 'export default function Pricing() { return null; }\n');
  assert.equal(again.totalChanges, 0);
});

/** Bundle a generated page for Node and render it to HTML. */
async function serverRender(out: string, page: string): Promise<string> {
  const esbuild = await import(pathToFileURL(path.join(nodeModules!, 'esbuild', 'lib', 'main.js')).href);
  const entry = path.join(out, 'ssr-entry.tsx');
  fs.writeFileSync(entry, `import { renderToString } from 'react-dom/server';
import Page from './src/neucli/pages/${page}';
export default () => renderToString(<Page />);
`);
  const bundle = path.join(out, 'ssr-entry.mjs');
  await esbuild.build({
    entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    jsx: 'automatic', external: ['react', 'react-dom', 'react-router-dom'], logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(bundle).href);
  return mod.default();
}

test('file: components build with a real hand-written component', { skip: skipBuild }, async () => {
  const out = path.join(tmp, 'files-build');
  write(out, 'src/custom/Pricing.tsx', `import type { ReactNode } from 'react';
export default function Pricing({ plan, seats = 1, children, className }: { plan?: string; seats?: number; children?: ReactNode; className?: string }) {
  return <section className={className} data-plan={plan}>{plan} for {seats}{children}</section>;
}
`);
  write(out, 'src/custom/Shell.tsx', `import type { ReactNode } from 'react';
export default function Shell({ children }: { children?: ReactNode }) { return <main>{children}</main>; }
`);
  await run(FILE_CONFIG, out);
  fs.symlinkSync(nodeModules!, path.join(out, 'node_modules'), 'dir');
  for (const [bin, args] of [['tsc', ['-b']], ['vite', ['build', '--logLevel', 'error']]] as const) {
    try {
      execFileSync(path.join(nodeModules!, '.bin', bin), [...args], { cwd: out, encoding: 'utf-8', stdio: 'pipe' });
    } catch (err: any) {
      assert.fail(`${bin} failed:\n${err.stdout}${err.stderr}`);
    }
  }
  const html = await serverRender(out, 'Home');
  assert.match(html, /<section class="self-stretch bg-slate-900 shadow-lg" data-plan="Pro">Pro(<!-- -->)? for (<!-- -->)?3<p>Inside<\/p><\/section>/);
});

// --- ids ------------------------------------------------------------------------------

const IDS_CONFIG = config(`
meta: { name: Ids }
components:
  Field:
    props: { label: text }
    root:
      type: frame
      state: { open: false }
      children:
        - { type: text, tag: label, content: '{label}', attrs: { htmlFor: email, id: email-label } }
        - { type: input, id: email, field: email, attrs: { aria-labelledby: email-label hint } }
        - { type: text, tag: button, content: More, on: { click: toggle open } }
        - { type: text, id: details, content: Details, visibleWhen: open }
pages:
  - path: /
    name: Home
    sections:
      - { type: text, id: top, content: Top }
      - { type: Field, props: { label: First } }
      - { type: Field, props: { label: Second } }
`);

test('ids inside a component are unique per instance; page ids stay literal', async () => {
  const out = path.join(tmp, 'ids');
  await run(IDS_CONFIG, out);
  const field = read(out, 'src/neucli/components/Field.tsx');
  assert.match(field, /import \{ useId, useState \} from 'react';/);
  assert.match(field, /const uid = useId\(\);\n  const \[open, setOpen\]/);
  assert.match(field, /<Input[^>]* id=\{`\$\{uid\}-email`\}/);
  assert.match(field, /id=\{`\$\{uid\}-email-label`\}/, 'an id under attrs: is local too');
  assert.match(field, /htmlFor=\{`\$\{uid\}-email`\}/);
  assert.match(field, /aria-labelledby=\{`\$\{uid\}-email-label hint`\}/);
  assert.match(field, /aria-controls=\{`\$\{uid\}-details`\}/);
  assert.match(read(out, 'src/neucli/pages/Home.tsx'), /<Text id="top">Top<\/Text>/);
});

test('ids inside a component are unique in the rendered page', { skip: skipBuild }, async () => {
  const out = path.join(tmp, 'ids-render');
  await run(IDS_CONFIG, out);
  fs.symlinkSync(nodeModules!, path.join(out, 'node_modules'), 'dir');
  const html = await serverRender(out, 'Home');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`);
  assert.ok(ids.includes('top'));
  const inputs = [...html.matchAll(/<input[^>]* id="([^"]+)"/g)].map(m => m[1]);
  const labels = [...html.matchAll(/<label[^>]* for="([^"]+)"/g)].map(m => m[1]);
  assert.equal(inputs.length, 2);
  assert.deepEqual(labels, inputs, 'each label points at its own input');
  const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(controls).size, 2);
});
