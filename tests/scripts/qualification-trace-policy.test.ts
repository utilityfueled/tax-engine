// Spec: spec/browser/qualification-trace-policy.yaml.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { options } from '../../scripts/run-browser-tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRequire = createRequire(path.join(root, 'apps/web/package.json'));
const testRequire = createRequire(appRequire.resolve('@playwright/test/package.json'));
const playwrightDirectory = path.dirname(testRequire.resolve('playwright/package.json'));

type Trace = string | { mode: string; snapshots: boolean; screenshots: boolean; sources: boolean; attachments: boolean };
type Effective = { timeout: number; retries: number; use: { trace: Trace } };
// Test-only installed merge oracle. Production uses only public defineConfig.
const { FullConfigInternal } = testRequire(path.join(playwrightDirectory, 'lib/common/index.js')) as {
  FullConfigInternal: new (location: { configDir: string }, config: unknown, overrides: unknown) => {
    projects: { project: Effective }[]; config: { workers: number };
  };
};

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression {
  const member = object.properties.find(member => ts.isPropertyAssignment(member) && member.name.getText() === name);
  if (!member || !ts.isPropertyAssignment(member)) throw new Error(`Missing literal configuration property: ${name}`);
  return member.initializer;
}

function literal(expression: ts.Expression): string | number | boolean | Record<string, unknown> {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isObjectLiteralExpression(expression)) return Object.fromEntries(expression.properties.map(member => {
    if (!ts.isPropertyAssignment(member) || !ts.isIdentifier(member.name)) throw new Error('Trace features must be explicit literal properties');
    return [member.name.text, literal(member.initializer)];
  }));
  throw new Error('Expected a literal trace policy');
}

function configuration() {
  // Read the actual configuration AST without importing its local-env loader,
  // collecting tests, starting the webServer, or launching a browser.
  const source = ts.createSourceFile('playwright.config.ts', readFileSync(path.join(root, 'apps/web/playwright.config.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const exported = source.statements.find(ts.isExportAssignment);
  if (!exported || !ts.isCallExpression(exported.expression)) throw new Error('Expected public defineConfig call');
  const object = exported.expression.arguments[0];
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('Expected literal public configuration');
  const use = property(object, 'use');
  if (!ts.isObjectLiteralExpression(use)) throw new Error('Expected literal use configuration');
  return {
    timeout: literal(property(object, 'timeout')),
    workers: literal(property(object, 'workers')),
    retries: literal(property(object, 'retries')),
    use: { trace: literal(property(use, 'trace')) },
  };
}

const features = { snapshots: false, screenshots: true, sources: true, attachments: true };

describe('qualification trace policy', () => {
  it('retains trace features across every supported CLI mode', () => {
    for (const mode of [undefined, 'off', 'on', 'retain-on-failure', 'on-first-retry']) {
      const merged = new FullConfigInternal({ configDir: root }, configuration(), { use: mode ? { trace: mode } : {} });
      expect(merged.projects[0]?.project.use.trace).toEqual({ mode: mode ?? 'on-first-retry', ...features });
    }
  });

  it('preserves exact CLI forwarding and selected qualification limits', () => {
    const parsed = options(['--retries=0', '--timeout=30000', '--trace=retain-on-failure']);
    expect(parsed.args).toEqual(['--timeout=30000', '--trace=retain-on-failure', '--workers=2', '--retries=0']);
    const config = configuration();
    expect({ timeout: config.timeout, workers: config.workers, retries: config.retries }).toEqual({ timeout: 90000, workers: 2, retries: 1 });
    const merged = new FullConfigInternal({ configDir: root }, config, { timeout: 30000, workers: '2', retries: 0, use: { trace: 'retain-on-failure' } });
    expect(merged.config.workers).toBe(2);
    expect(merged.projects[0]?.project.timeout).toBe(30000);
    expect(merged.projects[0]?.project.retries).toBe(0);
  });
});
