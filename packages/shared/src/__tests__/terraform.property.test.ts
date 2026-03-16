/**
 * Feature: content-storyteller-gcp-foundation, Property 1: No hardcoded sensitive values in Terraform
 * Feature: content-storyteller-gcp-foundation, Property 2: Bucket names use project ID prefix
 * Feature: content-storyteller-gcp-foundation, Property 3: Uniform bucket-level access on all buckets
 * Feature: content-storyteller-gcp-foundation, Property 6: No owner/editor roles on service accounts
 * Feature: content-storyteller-gcp-foundation, Property 7: All outputs have descriptions
 * Validates: Requirements 2.4, 4.2, 4.5, 7.2, 9.5, 10.2
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const TF_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'infra', 'terraform');

function readTfFiles(): Array<{ name: string; content: string }> {
  return fs.readdirSync(TF_DIR)
    .filter(f => f.endsWith('.tf'))
    .map(f => ({ name: f, content: fs.readFileSync(path.join(TF_DIR, f), 'utf-8') }));
}

function braceBlock(content: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    if (depth === 0) return content.slice(openIdx, i + 1);
  }
  return content.slice(openIdx);
}

function resourceBlocks(content: string, type: string): string[] {
  const results: string[] = [];
  let pos = 0;
  const marker = 'resource "' + type + '"';
  while (true) {
    const idx = content.indexOf(marker, pos);
    if (idx === -1) break;
    const bi = content.indexOf('{', idx);
    if (bi === -1) break;
    results.push(content.slice(idx, bi) + braceBlock(content, bi));
    pos = bi + 1;
  }
  return results;
}

function outputBlocks(content: string): Array<{ name: string; block: string }> {
  const results: Array<{ name: string; block: string }> = [];
  const re = /output\s+"([^"]+)"\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const bi = content.indexOf('{', m.index);
    results.push({ name: m[1], block: content.slice(m.index, bi) + braceBlock(content, bi) });
  }
  return results;
}

function iamRoles(content: string): Array<{ resource: string; role: string }> {
  const results: Array<{ resource: string; role: string }> = [];
  for (const type of ['google_project_iam_member', 'google_project_iam_binding']) {
    for (const block of resourceBlocks(content, type)) {
      const rm = block.match(/role\s*=\s*"([^"]+)"/);
      const nm = block.match(/resource\s+"[^"]+"\s+"([^"]+)"/);
      if (rm) results.push({ resource: nm?.[1] ?? 'unknown', role: rm[1] });
    }
  }
  return results;
}

function stripComments(s: string): string {
  return s.replace(/#[^\n]*/g, '').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const tfFiles = readTfFiles();
const buckets: Array<{ file: string; block: string }> = [];
for (const f of tfFiles) for (const b of resourceBlocks(f.content, 'google_storage_bucket')) buckets.push({ file: f.name, block: b });
const allOutputs: Array<{ file: string; name: string; block: string }> = [];
for (const f of tfFiles) for (const o of outputBlocks(f.content)) allOutputs.push({ file: f.name, ...o });
const allRoles: Array<{ file: string; resource: string; role: string }> = [];
for (const f of tfFiles) for (const r of iamRoles(f.content)) allRoles.push({ file: f.name, ...r });

describe('Property 1: No hardcoded sensitive values in Terraform', () => {
  // Validates: Requirements 2.4, 7.2
  it('should have .tf files to validate', () => { expect(tfFiles.length).toBeGreaterThan(0); });

  it('no hardcoded region strings outside variable defaults', () => {
    const regions = ['us-central1','us-east1','us-west1','europe-west1','asia-east1','us-east4','europe-west2','asia-southeast1'];
    fc.assert(fc.property(fc.integer({ min: 0, max: tfFiles.length - 1 }), (idx) => {
      for (const line of stripComments(tfFiles[idx].content).split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('default') || t.startsWith('description')) continue;
        for (const r of regions) if (new RegExp(`=\\s*"` + r + `"`).test(t)) expect.fail(tfFiles[idx].name + ' hardcodes "' + r + '"');
      }
    }), { numRuns: Math.max(100, tfFiles.length * 20) });
  });

  it('no hardcoded bucket name literals', () => {
    if (buckets.length === 0) return;
    fc.assert(fc.property(fc.integer({ min: 0, max: buckets.length - 1 }), (idx) => {
      const nm = buckets[idx].block.match(/\bname\s*=\s*"([^"]+)"/);
      if (nm) expect(nm[1]).toContain('$' + '{var.project_id}');
    }), { numRuns: Math.max(100, buckets.length * 20) });
  });

  it('no hardcoded secret values', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: tfFiles.length - 1 }), (idx) => {
      const s = stripComments(tfFiles[idx].content);
      expect(s).not.toMatch(/secret_data\s*=/);
      expect(resourceBlocks(s, 'google_secret_manager_secret_version').length).toBe(0);
    }), { numRuns: Math.max(100, tfFiles.length * 20) });
  });
});

describe('Property 2: Bucket names use project ID prefix', () => {
  // Validates: Requirements 4.2
  it('all google_storage_bucket resources reference var.project_id in name', () => {
    expect(buckets.length).toBeGreaterThan(0);
    fc.assert(fc.property(fc.integer({ min: 0, max: buckets.length - 1 }), (idx) => {
      const nm = buckets[idx].block.match(/\bname\s*=\s*"([^"]+)"/);
      expect(nm).not.toBeNull();
      expect(nm![1]).toContain('$' + '{var.project_id}');
    }), { numRuns: Math.max(100, buckets.length * 20) });
  });
});

describe('Property 3: Uniform bucket-level access on all buckets', () => {
  // Validates: Requirements 4.5
  it('all google_storage_bucket resources set uniform_bucket_level_access = true', () => {
    expect(buckets.length).toBeGreaterThan(0);
    fc.assert(fc.property(fc.integer({ min: 0, max: buckets.length - 1 }), (idx) => {
      expect(buckets[idx].block).toMatch(/uniform_bucket_level_access\s*=\s*true/);
    }), { numRuns: Math.max(100, buckets.length * 20) });
  });
});

describe('Property 6: No owner/editor roles on service accounts', () => {
  // Validates: Requirements 9.5
  it('no IAM binding uses roles/owner or roles/editor', () => {
    expect(allRoles.length).toBeGreaterThan(0);
    fc.assert(fc.property(fc.integer({ min: 0, max: allRoles.length - 1 }), (idx) => {
      expect(allRoles[idx].role).not.toBe('roles/owner');
      expect(allRoles[idx].role).not.toBe('roles/editor');
    }), { numRuns: Math.max(100, allRoles.length * 20) });
  });
});

describe('Property 7: All outputs have descriptions', () => {
  // Validates: Requirements 10.2
  it('every output block has a non-empty description', () => {
    expect(allOutputs.length).toBeGreaterThan(0);
    fc.assert(fc.property(fc.integer({ min: 0, max: allOutputs.length - 1 }), (idx) => {
      const dm = allOutputs[idx].block.match(/description\s*=\s*"([^"]*)"/);
      expect(dm).not.toBeNull();
      expect(dm![1].trim().length).toBeGreaterThan(0);
    }), { numRuns: Math.max(100, allOutputs.length * 20) });
  });
});