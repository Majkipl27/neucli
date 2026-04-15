import fs from 'fs';
import yaml from 'js-yaml';

export function parseConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');

  try {
    return yaml.load(content);
  } catch (err) {
    throw new Error(`Invalid YAML: ${err.message}`);
  }
}
