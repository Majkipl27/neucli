import path from 'path';
import chalk from 'chalk';
import { runPipeline } from '../generator/index.js';

export async function generate(configPath, options) {
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
  } catch (err) {
    console.error(chalk.red(`\n✗ Generation failed: ${err.message}`));
    process.exit(1);
  }
}

function isExistingProject(dir) {
  try {
    const pkg = path.join(dir, 'node_modules');
    return require('fs').existsSync(pkg);
  } catch {
    return false;
  }
}
