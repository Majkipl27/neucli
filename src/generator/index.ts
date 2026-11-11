import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { readConfig } from './parser.ts';
import { scaffoldProject, usesRouting } from './project.ts';
import { appSource, componentSource, pageSource } from './codegen.ts';
import { DiffReport, writeIfChanged, removeStaleFiles } from './differ.ts';
import { OUT } from './paths.ts';
import { validate, pageComponentName, instancesIn, pageParentFlows, layoutOf } from '../core/index.ts';
import type { Config } from '../core/index.ts';

const STATUS_ICONS = {
  added: chalk.green('+'),
  updated: chalk.yellow('~'),
  unchanged: chalk.dim('✓'),
};

export interface PipelineOptions {
  keepStale?: boolean;
  /** Silence progress output (tests). */
  quiet?: boolean;
}

/** Parse + validate; throws with every error listed. */
export function loadConfig(configPath: string): { config: Config; warnings: string[] } {
  const result = validate(readConfig(configPath));
  if (!result.config) {
    throw new Error(`Config validation failed:\n${result.errors.map(e => `  - ${e}`).join('\n')}`);
  }
  return { config: result.config, warnings: result.warnings };
}

/** Components reachable from pages and layouts; unused definitions aren't generated. */
function usedComponents(config: Config): string[] {
  const used = new Set<string>();
  const queue: string[] = [];
  const add = (name: string) => {
    if (!used.has(name)) {
      used.add(name);
      queue.push(name);
    }
  };
  for (const page of config.pages) {
    page.sections.forEach(s => instancesIn(s).forEach(add));
    const layout = layoutOf(config, page);
    if (layout) add(layout);
  }
  while (queue.length) {
    const def = config.components?.[queue.pop()!];
    if (def?.root) instancesIn(def.root).forEach(add);
  }
  return [...used].sort();
}

export async function runPipeline(configPath: string, outputDir: string, options: PipelineOptions = {}): Promise<DiffReport> {
  const log = options.quiet ? () => {} : (msg: string) => console.log(msg);
  const report = new DiffReport();

  log(chalk.dim('  Reading and validating config...'));
  const { config, warnings } = loadConfig(configPath);
  for (const w of warnings) log(chalk.yellow(`  ! ${w}`));

  for (const [name, def] of Object.entries(config.components ?? {})) {
    if (def.file) throw new Error(`components.${name}.file: file components arrive in Phase 8; use root for now`);
  }

  log(chalk.dim('  Scaffolding project...'));
  const primitives = scaffoldProject(config, outputDir, report);
  if (!options.keepStale) removeStaleFiles(path.join(outputDir, OUT.primitives), primitives, report);

  log(chalk.dim('  Generating components...'));
  const componentFiles = new Set<string>();
  for (const name of usedComponents(config)) {
    const file = `${name}.tsx`;
    componentFiles.add(file);
    const status = writeIfChanged(path.join(outputDir, OUT.components, file), componentSource(config, name, config.components![name]), report);
    log(`    ${STATUS_ICONS[status]} ${name} (${status})`);
  }
  if (!options.keepStale) removeStaleFiles(path.join(outputDir, OUT.components), componentFiles, report);

  log(chalk.dim('  Generating pages...'));
  const pageFiles = new Set<string>();
  for (const page of config.pages) {
    const name = pageComponentName(page.name);
    const parent = pageParentFlows(config, page);
    const file = `${name}.tsx`;
    pageFiles.add(file);
    const status = writeIfChanged(path.join(outputDir, OUT.pages, file), pageSource(config, page, parent), report);
    log(`    ${STATUS_ICONS[status]} ${name} (${status})`);
  }
  if (!options.keepStale) removeStaleFiles(path.join(outputDir, OUT.pages), pageFiles, report);

  writeIfChanged(path.join(outputDir, OUT.app), appSource(config, usesRouting(config)), report);
  writeIfChanged(path.join(outputDir, OUT.lock), fs.readFileSync(configPath, 'utf-8'), report);

  for (const removed of report.removed) {
    log(`    ${chalk.red('✗')} ${path.basename(removed, '.tsx')} (removed)`);
  }

  return report;
}
