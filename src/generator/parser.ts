import fs from 'fs';
import yaml from 'js-yaml';

/** Read and parse the YAML file. Validation happens in core/validate.ts. */
export function readConfig(configPath: string): unknown {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  try {
    return yaml.load(content);
  } catch (err: any) {
    throw new Error(`Invalid YAML: ${err.message}`);
  }
}
