/**
 * Smoke test: generate configs and require the output to typecheck.
 *
 * Generated projects need react, react-router-dom, vite and typescript to
 * typecheck. Installing per run is slow (and pnpm 11 blocks esbuild's build
 * script), so we symlink an existing node_modules from a generated project.
 * Point NEUCLI_TEST_NODE_MODULES at one, or the typecheck tests are skipped:
 *
 *   node bin/cli.ts generate examples/nova.yml -o /tmp/nova && (cd /tmp/nova && pnpm i)
 *   NEUCLI_TEST_NODE_MODULES=/tmp/nova/node_modules pnpm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/generator/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = process.env.NEUCLI_TEST_NODE_MODULES;
const tscBin = nodeModules ? path.join(nodeModules, '.bin', 'tsc') : '';
const canTypecheck = !!nodeModules && fs.existsSync(tscBin);
const skipReason = canTypecheck
  ? false
  : 'set NEUCLI_TEST_NODE_MODULES to a generated project\'s node_modules (with react-router-dom) to typecheck output';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neucli-test-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

async function generate(config: string): Promise<string> {
  const out = path.join(tmp, path.basename(config).replace(/\W/g, '-'));
  const log = console.log;
  console.log = () => {};
  try {
    await runPipeline(path.join(root, config), out);
  } finally {
    console.log = log;
  }
  return out;
}

function typecheck(dir: string) {
  fs.symlinkSync(nodeModules!, path.join(dir, 'node_modules'), 'dir');
  try {
    execFileSync(tscBin, ['-b'], { cwd: dir, encoding: 'utf-8', stdio: 'pipe' });
  } catch (err: any) {
    assert.fail(`tsc failed in ${dir}:\n${err.stdout}${err.stderr}`);
  }
}

for (const config of ['examples/landing-page.yaml', 'examples/nova.yml', 'test/fixtures/regression.yaml']) {
  test(`${config} generates`, async () => {
    const out = await generate(config);
    assert.ok(fs.existsSync(path.join(out, 'src', 'App.tsx')));
  });

  test(`${config} output typechecks`, { skip: skipReason }, async (t) => {
    const out = await generate(config);
    const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf-8'));
    const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(dep => !fs.existsSync(path.join(nodeModules!, dep)));
    if (missing.length > 0) {
      t.skip(`NEUCLI_TEST_NODE_MODULES lacks ${missing.join(', ')}`);
      return;
    }
    typecheck(out);
  });
}

test('regression: types used only inside custom components get files', async () => {
  const out = await generate('test/fixtures/regression.yaml');
  const components = fs.readdirSync(path.join(out, 'src', 'components'));
  for (const name of ['Badge.tsx', 'InnerNote.tsx', 'PromoBox.tsx']) {
    assert.ok(components.includes(name), `missing ${name}; got ${components.join(', ')}`);
  }
  const promo = fs.readFileSync(path.join(out, 'src', 'components', 'PromoBox.tsx'), 'utf-8');
  assert.match(promo, /tag = 'aside'/, 'custom component tag should be honoured');
});

test('regression: braces render literally on pages', async () => {
  const out = await generate('test/fixtures/regression.yaml');
  const home = fs.readFileSync(path.join(out, 'src', 'pages', 'Home.tsx'), 'utf-8');
  assert.ok(home.includes('{"Price < 10 {not code} & more > less"}'));
  assert.ok(home.includes('label="Open {menu}"'));
});

test('a second run with no changes reports nothing to do', async () => {
  await generate('examples/nova.yml');
  const out = path.join(tmp, 'nova-yml');
  const log = console.log;
  console.log = () => {};
  try {
    const report = await runPipeline(path.join(root, 'examples/nova.yml'), out);
    assert.equal(report.totalChanges, 0, report.summary());
  } finally {
    console.log = log;
  }
});

test('invalid config is rejected with every error', async () => {
  await assert.rejects(generate('test/fixtures/invalid.yaml'), (err: Error) => {
    assert.match(err.message, /cycle detected \(a-box -> b-box -> a-box\)/);
    assert.match(err.message, /"home!" collides with pages\[0\]\.name/);
    assert.match(err.message, /path "\/" is already used/);
    assert.match(err.message, /"Text" collides with the component Text/);
    return true;
  });
});
