import path from 'path';
import chalk from 'chalk';
import fs from 'fs';
import { runPipeline } from '../generator/index.ts';

export async function generate(configPath: string, options: { output: string; keepStale?: boolean }) {
  const resolvedConfig = path.resolve(configPath);
  const resolvedOutput = path.resolve(options.output);

  console.log(chalk.cyan('⚡ neucli') + ' — generating your website...');
  console.log(chalk.dim(`  Config: ${resolvedConfig}`));
  console.log(chalk.dim(`  Output: ${resolvedOutput}`));
  console.log('');

  try {
    const report = await runPipeline(resolvedConfig, resolvedOutput, {
      keepStale: options.keepStale || false,
    });

    if (report.totalChanges === 0) {
      console.log(chalk.green('\n✓ Everything up to date — no changes needed.'));
    } else {
      console.log(chalk.green(`\n✓ Done! ${report.summary()}`));
    }

    if (report.added.length > 0 && !isExistingProject(resolvedOutput)) {
      console.log(chalk.dim('\nNext steps:'));
      console.log(chalk.dim(`  cd ${options.output}`));
      console.log(chalk.dim('  pnpm install'));
      console.log(chalk.dim('  pnpm dev'));
    }
  } catch (err: any) {
    console.error(chalk.red(`\n✗ Generation failed: ${err.message}`));
    process.exit(1);
  }
}

function isExistingProject(dir: string): boolean {
  try {
    const nodeModules = path.join(dir, 'node_modules');
    return fs.existsSync(nodeModules);
  } catch {
    return false;
  }
}
