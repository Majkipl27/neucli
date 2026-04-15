import fs from 'fs';
import path from 'path';

export class DiffReport {
  constructor() {
    this.added = [];
    this.updated = [];
    this.removed = [];
    this.unchanged = [];
  }

  add(filePath) { this.added.push(filePath); }
  update(filePath) { this.updated.push(filePath); }
  remove(filePath) { this.removed.push(filePath); }
  skip(filePath) { this.unchanged.push(filePath); }

  get totalChanges() {
    return this.added.length + this.updated.length + this.removed.length;
  }

  summary() {
    const parts = [];
    if (this.updated.length) parts.push(`${this.updated.length} updated`);
    if (this.added.length) parts.push(`${this.added.length} added`);
    if (this.removed.length) parts.push(`${this.removed.length} removed`);
    if (this.unchanged.length) parts.push(`${this.unchanged.length} unchanged`);
    return parts.join(', ');
  }
}

export function writeIfChanged(filePath, newContent, report) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing === newContent) {
      report.skip(filePath);
      return 'unchanged';
    }
    fs.writeFileSync(filePath, newContent, 'utf-8');
    report.update(filePath);
    return 'updated';
  }

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, newContent, 'utf-8');
  report.add(filePath);
  return 'added';
}

export function removeStaleFiles(directory, currentFileSet, report) {
  if (!fs.existsSync(directory)) return;

  const existing = fs.readdirSync(directory);
  for (const file of existing) {
    if (!currentFileSet.has(file)) {
      const fullPath = path.join(directory, file);
      fs.unlinkSync(fullPath);
      report.remove(fullPath);
    }
  }
}
