import fs from "fs";
import path from "path";
import ejs from "ejs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

const templateCache = new Map<string, string>();

export function renderTemplate(templatePath: string, data: Record<string, any> = {}): string {
  const fullPath = path.join(TEMPLATES_DIR, templatePath);

  if (!templateCache.has(fullPath)) {
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    templateCache.set(fullPath, fs.readFileSync(fullPath, "utf-8"));
  }

  const templateContent = templateCache.get(fullPath);
  if (!templateContent) throw new Error(`Template content is empty for ${fullPath}`);

  return ejs.render(templateContent, data, { filename: fullPath });
}

export function getTemplatesDir(): string {
  return TEMPLATES_DIR;
}
