/**
 * Writing the generated project without trampling anyone's work.
 *
 * Every file neucli owns is listed in `.neucli/manifest.json` with the hash of
 * what neucli last wrote. That gives three rules:
 *
 * - A file that isn't in the manifest is never overwritten or deleted, unless
 *   `--force` (or, for an old-layout folder, `--migrate`) says so.
 * - A tracked file whose content no longer matches its hash was edited by hand.
 *   It is skipped with a warning instead of overwritten (or deleted, when
 *   stale); `--force` overwrites it.
 * - Stale tracked files (the config no longer produces them) are deleted only
 *   while they still match their hash.
 *
 * Writes are planned first and committed in one go, so a refusal (files neucli
 * doesn't own in the way) leaves the folder untouched.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './paths.ts';

export interface Manifest {
  version: 1;
  /** Project-relative path -> sha256 of the content neucli last wrote. */
  files: Record<string, string>;
  /** Dependencies neucli put in package.json, so it can update or drop only those. */
  packageJson?: { dependencies: Record<string, string>; devDependencies: Record<string, string> };
}

export const hash = (content: string) => crypto.createHash('sha256').update(content).digest('hex');

export function readManifest(dir: string): Manifest | null {
  const file = path.join(dir, OUT.manifest);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Manifest;
  if (parsed.version !== 1 || typeof parsed.files !== 'object') {
    throw new Error(`${OUT.manifest} is not a manifest this version of neucli understands`);
  }
  return parsed;
}

export class Report {
  /** New files. */
  added: string[] = [];
  /** Tracked files rewritten with new content. */
  updated: string[] = [];
  unchanged: string[] = [];
  /** Tracked files left alone because they were edited by hand. */
  skipped: string[] = [];
  /** Stale tracked files deleted (and old-layout files on --migrate). */
  removed: string[] = [];
  /** Starter files (yours from now on) and `file:` component stubs written because they were missing. */
  created: string[] = [];

  get totalChanges() {
    return this.added.length + this.updated.length + this.removed.length + this.created.length;
  }

  summary() {
    const parts: string[] = [];
    const written = this.added.length + this.updated.length;
    if (written) parts.push(`${written} written`);
    if (this.created.length) parts.push(`${this.created.length} created for you`);
    if (this.removed.length) parts.push(`${this.removed.length} removed`);
    if (this.skipped.length) parts.push(`${this.skipped.length} skipped (edited by hand)`);
    if (this.unchanged.length) parts.push(`${this.unchanged.length} unchanged`);
    return parts.join(', ') || 'nothing to do';
  }
}

export interface OutputOptions {
  /** Overwrite or delete files even when they were edited or aren't neucli's. */
  force?: boolean;
  /** Keep tracked files the config no longer produces. */
  keepStale?: boolean;
  /** Paths neucli may overwrite although they aren't in the manifest (old-layout migration). */
  adopt?: Set<string>;
}

type Plan =
  | { kind: 'managed'; content: string }
  | { kind: 'seed'; content: string }
  | { kind: 'merged'; content: string };

export class Output {
  readonly report = new Report();
  private plans = new Map<string, Plan>();
  private packageRecord: Manifest['packageJson'];
  readonly dir: string;
  private readonly previous: Manifest | null;
  private readonly options: OutputOptions;

  constructor(dir: string, previous: Manifest | null, options: OutputOptions = {}) {
    this.dir = dir;
    this.previous = previous;
    this.options = options;
  }

  /** A file neucli owns: rewritten every run, tracked by hash. */
  managed(rel: string, content: string) {
    this.plans.set(rel, { kind: 'managed', content });
  }

  /** A starter file: written once if missing, then it's yours. */
  seed(rel: string, content: string) {
    this.plans.set(rel, { kind: 'seed', content });
  }

  /** A file neucli merges into (package.json): written when the merge changes it, never hash-checked. */
  merged(rel: string, content: string, record: Manifest['packageJson']) {
    this.plans.set(rel, { kind: 'merged', content });
    this.packageRecord = record;
  }

  private abs(rel: string) {
    return path.join(this.dir, rel);
  }

  private read(rel: string): string | null {
    const file = this.abs(rel);
    return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf-8') : null;
  }

  /**
   * Managed paths that exist on disk, aren't neucli's, and would change: writing
   * them would overwrite someone else's file.
   */
  conflicts(): string[] {
    if (this.options.force) return [];
    const out: string[] = [];
    for (const [rel, plan] of this.plans) {
      if (plan.kind !== 'managed' || this.previous?.files[rel] || this.options.adopt?.has(rel)) continue;
      const current = this.read(rel);
      if (current !== null && current !== plan.content) out.push(rel);
    }
    return out.sort();
  }

  /** Write everything planned, clean up stale files, save the manifest. */
  commit() {
    const files: Record<string, string> = {};
    const prev = this.previous?.files ?? {};

    for (const [rel, plan] of [...this.plans].sort(([a], [b]) => a.localeCompare(b))) {
      const current = this.read(rel);

      if (plan.kind === 'seed') {
        if (current === null || (this.options.adopt?.has(rel) && current !== plan.content)) {
          this.write(rel, plan.content);
          this.report.created.push(rel);
        }
        continue;
      }

      if (plan.kind === 'merged') {
        if (current === plan.content) this.report.unchanged.push(rel);
        else {
          this.write(rel, plan.content);
          (current === null ? this.report.added : this.report.updated).push(rel);
        }
        continue;
      }

      const next = hash(plan.content);
      if (current === null) {
        this.write(rel, plan.content);
        this.report.added.push(rel);
        files[rel] = next;
      } else if (current === plan.content) {
        this.report.unchanged.push(rel);
        files[rel] = next;
      } else if (prev[rel] && hash(current) !== prev[rel] && !this.options.force) {
        // Edited by hand since neucli wrote it: keep the edit, keep tracking the old hash so it stays flagged.
        this.report.skipped.push(rel);
        files[rel] = prev[rel];
      } else {
        this.write(rel, plan.content);
        this.report.updated.push(rel);
        files[rel] = next;
      }
    }

    // Stale: tracked before, not produced now.
    for (const [rel, oldHash] of Object.entries(prev)) {
      if (this.plans.has(rel)) continue;
      const current = this.read(rel);
      if (current === null) continue;
      if (this.options.keepStale) {
        files[rel] = oldHash;
      } else if (hash(current) === oldHash || this.options.force) {
        fs.unlinkSync(this.abs(rel));
        this.report.removed.push(rel);
        removeEmptyDirs(path.dirname(this.abs(rel)), this.abs(OUT.root));
      } else {
        this.report.skipped.push(rel);
        files[rel] = oldHash;
      }
    }

    const manifest: Manifest = { version: 1, files: sortKeys(files) };
    const record = this.packageRecord ?? this.previous?.packageJson;
    if (record) manifest.packageJson = record;
    const text = JSON.stringify(manifest, null, 2) + '\n';
    if (this.read(OUT.manifest) !== text) this.write(OUT.manifest, text);
  }

  /** Delete a path outright (old-layout migration), reporting it. */
  remove(rel: string) {
    const file = this.abs(rel);
    if (!fs.existsSync(file)) return;
    fs.rmSync(file, { force: true });
    this.report.removed.push(rel);
  }

  private write(rel: string, content: string) {
    const file = this.abs(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
  }
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/** Remove empty directories from `dir` up to (and including) `stop`, never above it. */
export function removeEmptyDirs(dir: string, stop: string) {
  let current = dir;
  while (current.startsWith(stop) && fs.existsSync(current) && fs.readdirSync(current).length === 0) {
    fs.rmdirSync(current);
    if (current === stop) break;
    current = path.dirname(current);
  }
}
