import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findWorkspaceRoot } from '../scanner';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('findWorkspaceRoot', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `fwr-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns directory containing pnpm-workspace.yaml', () => {
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), '');

    expect(findWorkspaceRoot(tmp)).toBe(tmp);
  });

  it('walks up to find workspace root from nested dir', () => {
    const nested = join(tmp, 'packages', 'foo', 'src');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), '');

    expect(findWorkspaceRoot(nested)).toBe(tmp);
  });

  it('returns startPath when no workspace file found within depth', () => {
    const deep = join(tmp, 'a', 'b', 'c', 'd', 'e', 'f', 'g');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), '');

    // 7 levels deep, limit is 6 - should NOT find it
    expect(findWorkspaceRoot(deep)).toBe(deep);
  });

  it('returns startPath when no workspace file exists at all', () => {
    expect(findWorkspaceRoot(tmp)).toBe(tmp);
  });

  it('finds root at exact depth boundary (5 levels up)', () => {
    const nested = join(tmp, 'a', 'b', 'c', 'd', 'e');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), '');

    expect(findWorkspaceRoot(nested)).toBe(tmp);
  });
});
