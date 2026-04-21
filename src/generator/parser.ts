import fs from 'fs';
import yaml from 'js-yaml';
import type { Config } from './types.ts';

export function parseConfig(configPath: string): Config {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');

  try {
    return yaml.load(content) as Config;
  } catch (err: any) {
    throw new Error(`Invalid YAML: ${err.message}`);
  }
}
