#!/usr/bin/env node

import { Command } from 'commander';
import { generate } from '../src/commands/generate.ts';

const program = new Command();

program
  .name('neucli')
  .description('Generate React + Tailwind websites from YAML config')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate a website from a YAML config file')
  .argument('<config>', 'Path to the YAML config file')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--keep-stale', 'Keep component/page files no longer in config', false)
  .action((config, options) => {
    generate(config, options);
  });

program.parse();
