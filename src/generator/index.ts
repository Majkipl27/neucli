import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { parseConfig } from './parser.ts';
import { validateConfig } from './validator.ts';
import { scaffoldProject } from './scaffolder.ts';
import { renderTemplate } from './renderer.ts';
import { resolveComponentTemplate, collectComponentTypes } from './componentResolver.ts';
import { buildPageSource, sanitizeName, buildJSX } from './pageBuilder.ts';
import { DiffReport, writeIfChanged, removeStaleFiles } from './differ.ts';
import { analyzeFeatures } from './features.ts';
import type { Config, Node } from './types.ts';

const STATUS_ICONS = {
  added: chalk.green('+'),
  updated: chalk.yellow('~'),
  unchanged: chalk.dim('✓'),
};

export async function runPipeline(
  configPath: string, 
  outputDir: string, 
  options: { keepStale?: boolean } = {}
): Promise<DiffReport> {
  const report = new DiffReport();
  const keepStale = options.keepStale || false;

  console.log(chalk.dim('  Parsing config...'));
  const config = parseConfig(configPath);

  console.log(chalk.dim('  Validating...'));
  validateConfig(config);

  const { features, dependencies } = analyzeFeatures(config);

  const navbarJSX = (config.globals?.navbar ? buildJSX(config.globals.navbar, 6) : null) ?? null;
  const footerJSX = (config.globals?.footer ? buildJSX(config.globals.footer, 6) : null) ?? null;
  
  const globalImports = new Set<string>();
  const collectGlobals = (n: Node | undefined) => {
    if (!n) return;
    const { componentName } = resolveComponentTemplate(n.type);
    globalImports.add(`import ${componentName} from './components/${componentName}';`);
    if (n.children) n.children.forEach(collectGlobals);
  };
  collectGlobals(config.globals?.navbar);
  collectGlobals(config.globals?.footer);

  console.log(chalk.dim('  Scaffolding project...'));
  scaffoldProject(config, outputDir, report, features, dependencies, navbarJSX, footerJSX, Array.from(globalImports));

  console.log(chalk.dim('  Generating components...'));
  const componentTypes = collectComponentTypes(config);
  const currentComponentFiles = new Set<string>();

  for (const type of componentTypes) {
    const { templatePath, componentName, isBuiltIn, originalType } = resolveComponentTemplate(type);
    
    let customLogic: string | null = null;
    let customImports: string[] | null = null;
    let innerJSX: string | null = null;
    if (!isBuiltIn && config.components) {
      // Allow overriding by pascal case or original type
      const cmpDef = config.components[componentName] || config.components[originalType as string];
      if (cmpDef) {
        customLogic = cmpDef.logic || null;
        customImports = cmpDef.imports || null;
        if (cmpDef.children && cmpDef.children.length > 0) {
          innerJSX = cmpDef.children.map(c => buildJSX(c, 6)).filter(Boolean).join('\n');
          
          const deps = new Set<string>();
          const walkDeps = (n: Node) => {
             const { componentName: depName } = resolveComponentTemplate(n.type);
             deps.add(`import ${depName} from './${depName}';`);
             if (n.children) n.children.forEach(walkDeps);
          };
          cmpDef.children.forEach(walkDeps);
          
          customImports = customImports || [];
          customImports.push(...deps);
        }
      }
    }

    const data = isBuiltIn 
      ? { features } 
      : { componentName, defaultTag: originalType, features, logic: customLogic, imports: customImports, innerJSX };
    
    const content = renderTemplate(templatePath, data);
    const fileName = `${componentName}.tsx`;
    currentComponentFiles.add(fileName);
    const outputPath = path.join(outputDir, 'src', 'components', fileName);
    const status = writeIfChanged(outputPath, content, report);
    console.log(`    ${STATUS_ICONS[status]} ${componentName} (${status})`);
  }

  if (!keepStale) {
    const componentsDir = path.join(outputDir, 'src', 'components');
    removeStaleFiles(componentsDir, currentComponentFiles, report);
  }

  console.log(chalk.dim('  Generating pages...'));
  const currentPageFiles = new Set<string>();

  for (const page of config.pages) {
    const pageName = sanitizeName(page.name);
    const source = buildPageSource(page, config.globals);
    const fileName = `${pageName}.tsx`;
    currentPageFiles.add(fileName);
    const outputPath = path.join(outputDir, 'src', 'pages', fileName);
    const status = writeIfChanged(outputPath, source, report);
    console.log(`    ${STATUS_ICONS[status]} ${pageName} (${status})`);
  }

  if (!keepStale) {
    const pagesDir = path.join(outputDir, 'src', 'pages');
    removeStaleFiles(pagesDir, currentPageFiles, report);
  }

  const configSnapshot = fs.readFileSync(configPath, 'utf-8');
  writeIfChanged(
    path.join(outputDir, '.neucli', 'config.lock.yaml'),
    configSnapshot,
    report
  );

  for (const removed of report.removed) {
    const name = path.basename(removed, '.tsx');
    console.log(`    ${chalk.red('✗')} ${name} (removed)`);
  }

  return report;
}
