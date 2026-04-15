import fs from "fs";
import path from "path";
import ejs from "ejs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

const templateCache = new Map();

export function renderTemplate(templatePath, data = {}) {
  const fullPath = path.join(TEMPLATES_DIR, templatePath);

  if (!templateCache.has(fullPath)) {
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    templateCache.set(fullPath, fs.readFileSync(fullPath, "utf-8"));
  }

  return ejs.render(templateCache.get(fullPath), data, { filename: fullPath });
}

export function getTemplatesDir() {
  return TEMPLATES_DIR;
}
