/**
 * Feature: content-storyteller-gcp-foundation, Property 21: Naming conventions enforced
 *
 * Verify kebab-case file names, PascalCase types/interfaces, camelCase functions/variables
 * across shared package source files.
 *
 * Validates: Requirements 19.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SHARED_SRC_DIR = path.resolve(__dirname, '..');

/** Recursively collect all .ts source files (excluding __tests__ and .d.ts) */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Check if a string is kebab-case (lowercase letters, digits, hyphens; no leading/trailing hyphen) */
function isKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

/** Check if a string is PascalCase */
function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/** Check if a string is camelCase, SCREAMING_SNAKE_CASE (for constants), or _prefixed camelCase (for test helpers) */
function isCamelCase(name: string): boolean {
  return /^_?[a-z][a-zA-Z0-9]*$/.test(name) || /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
}

/** Extract type and interface declaration names from TypeScript source */
function extractTypeAndInterfaceNames(content: string): string[] {
  const names: string[] = [];
  // Match: export interface Foo, interface Foo, export type Foo =, type Foo =
  const pattern = /(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** Extract enum declaration names from TypeScript source */
function extractEnumNames(content: string): string[] {
  const names: string[] = [];
  const pattern = /(?:export\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** Extract top-level function and variable declaration names from TypeScript source */
function extractFunctionAndVariableNames(content: string): string[] {
  const names: string[] = [];
  // Match: export function foo, function foo, export const foo, const foo, let foo, export let foo
  const fnPattern = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const varPattern = /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = fnPattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  while ((match = varPattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

// Collect all source files once
const sourceFiles = collectSourceFiles(SHARED_SRC_DIR);

describe('Property 21: Naming conventions enforced', () => {
  it('should have source files to validate', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('all file names use kebab-case', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sourceFiles),
        (filePath: string) => {
          const baseName = path.basename(filePath, '.ts');
          expect(isKebabCase(baseName)).toBe(true);
        }
      ),
      { numRuns: Math.max(100, sourceFiles.length * 10) }
    );
  });

  it('all type and interface declarations use PascalCase', () => {
    const declarations: Array<{ file: string; name: string }> = [];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const typeNames = extractTypeAndInterfaceNames(content);
      const enumNames = extractEnumNames(content);
      for (const name of [...typeNames, ...enumNames]) {
        declarations.push({ file: path.relative(SHARED_SRC_DIR, filePath), name });
      }
    }

    expect(declarations.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...declarations),
        (decl: { file: string; name: string }) => {
          expect(isPascalCase(decl.name)).toBe(true);
        }
      ),
      { numRuns: Math.max(100, declarations.length * 10) }
    );
  });

  it('all function and variable declarations use camelCase', () => {
    const declarations: Array<{ file: string; name: string }> = [];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const names = extractFunctionAndVariableNames(content);
      for (const name of names) {
        declarations.push({ file: path.relative(SHARED_SRC_DIR, filePath), name });
      }
    }

    // It's valid for the shared package to have no top-level function/variable declarations
    // (it's mostly types/interfaces). If there are none, the property holds vacuously.
    if (declarations.length === 0) {
      return;
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...declarations),
        (decl: { file: string; name: string }) => {
          expect(isCamelCase(decl.name)).toBe(true);
        }
      ),
      { numRuns: Math.max(100, declarations.length * 10) }
    );
  });
});
