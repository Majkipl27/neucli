import path from 'path';
import chalk from 'chalk';
import fs from 'fs';
import { runPipeline, GenerateError } from '../generator/index.ts';

export interface GenerateOptions {
  output: string;
  keepStale?: boolean;
  force?: boolean;
  migrate?: boolean;
  allowEdited?: boolean;
}

/**
 * Exit codes: 0 done; 1 the config is invalid or neucli refused to write
 * (files it doesn't own in the way, old layout); 2 generated, but some files
 * were edited by hand and left alone (pass --allow-edited to exit 0 anyway).
 */
export async function generate(configPath: string, options: GenerateOptions) {
  const resolvedConfig = path.resolve(configPath);
  const resolvedOutput = path.resolve(options.output);
  const fresh = !fs.existsSync(path.join(resolvedOutput, 'node_modules'));

  console.log(chalk.cyan('neucli') + ' generating your site');
  console.log(chalk.dim(`  Config: ${resolvedConfig}`));
  console.log(chalk.dim(`  Output: ${resolvedOutput}`));
  console.log('');

  let report;
  try {
    report = await runPipeline(resolvedConfig, resolvedOutput, {
      keepStale: options.keepStale,
      force: options.force,
      migrate: options.migrate,
    });
  } catch (err: any) {
    const label = err instanceof GenerateError ? 'Nothing was written' : 'Generation failed';
    console.error(chalk.red(`\n✗ ${label}: ${err.message}`));
    process.exit(1);
  }

  console.log(report.totalChanges === 0 && report.skipped.length === 0
    ? chalk.green('\n✓ Everything up to date.')
    : chalk.green(`\n✓ ${report.summary()}`));

  if (report.skipped.length > 0) {
    console.log(chalk.yellow(
      `\n! ${report.skipped.length} generated file${report.skipped.length === 1 ? ' was' : 's were'} edited by hand and left as is.\n` +
      '  Move your changes to src/custom/ or the config, then run with --force to regenerate them.',
    ));
    if (!options.allowEdited) process.exitCode = 2;
  }

  if (fresh && report.added.length > 0) {
    console.log(chalk.dim('\nNext steps:'));
    console.log(chalk.dim(`  cd ${options.output}`));
    console.log(chalk.dim('  pnpm install'));
    console.log(chalk.dim('  pnpm dev'));
  }
}
