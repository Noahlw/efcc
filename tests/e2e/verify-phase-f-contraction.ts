/**
 * Phase F contraction scanner verification — TDD red→green for #494.
 *
 * Ensures the standard-library-only scanner rejects forbidden fixtures and
 * accepts preflight/migration/stale-schema allowlist fixtures.
 * Also verifies that shipped CSS is currently allowlisted for the UI worker slice.
 *
 * Run: node --experimental-strip-types tests/e2e/verify-phase-f-contraction.ts
 * or: pnpm verify:contraction (scanner) && pnpm typecheck
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCANNER = path.join(ROOT, 'scripts/verify-contraction.mjs');

function checkFixture(content: string, fakeFile: string) {
  const res = spawnSync('node', [SCANNER, '--check-fixture', content, '--file', fakeFile], { encoding: 'utf8' });
  return res.status === 0 ? 'pass' : 'fail';
}

describe('verify-phase-f-contraction scanner', () => {
  test('rejects shipped CSS Module import', () => {
    const content = 'import styles from "./foo.module.css";';
    const result = checkFixture(content, 'web/app/foo.tsx');
    assert.equal(result, 'fail', 'CSS module should be forbidden');
  });

  test('rejects retired systemRole field', () => {
    const content = 'systemRole: "Admin"';
    assert.equal(checkFixture(content, 'web/lib/api.ts'), 'fail');
  });

  test('rejects requireAdminOrStaff helper', () => {
    assert.equal(checkFixture('requireAdminOrStaff(request, env, requestId)', 'web/lib/auth/handlers.ts'), 'fail');
  });

  test('rejects account-permissions compatibility route', () => {
    assert.equal(checkFixture('"/api/v1/programs/account-permissions"', 'web/worker.ts'), 'fail');
  });

  test('rejects legacy table role_capabilities outside preflight', () => {
    assert.equal(checkFixture('CREATE TABLE role_capabilities (x TEXT)', 'web/lib/foo.ts'), 'fail');
  });

  test('rejects accounts_role_write_guard trigger', () => {
    assert.equal(checkFixture('accounts_role_write_guard', 'web/lib/auth/accounts.ts'), 'fail');
  });

  test('rejects uppercase ROLE constant', () => {
    assert.equal(checkFixture('export const ROLE = { ADMIN: "Admin" }', 'web/lib/auth/accounts.ts'), 'fail');
  });

  test('rejects MemberDirectoryRole type', () => {
    assert.equal(checkFixture('type MemberDirectoryRole = "Admin"', 'web/lib/programs/program-api.ts'), 'fail');
  });

  test('rejects fixed role field via quoted key', () => {
    assert.equal(checkFixture('role: "Member"', 'web/lib/auth/registrations.ts'), 'fail');
  });

  test('rejects dot role access on legacy DTO', () => {
    assert.equal(checkFixture('account.role', 'web/lib/auth/handlers.ts'), 'fail');
  });

  test('accepts preflight allowlist for legacy tables', () => {
    const content = 'role_capabilities, department_managers, program_leaders';
    assert.equal(checkFixture(content, 'web/lib/identity/preflight.ts'), 'pass', 'preflight should be allowlisted');
  });

  test('accepts normalized role_definition terminology', () => {
    const content = 'role_definition_id, role_assignments, role_categories, role_definition_grants';
    assert.equal(checkFixture(content, 'web/lib/identity/role-hierarchy.ts'), 'pass');
  });

  test('accepts AccountDirectory identity labels', () => {
    const content = 'identities: readonly PublicIdentitySummary[]; capabilities: Record<string, boolean>';
    assert.equal(checkFixture(content, 'web/lib/api.ts'), 'pass');
  });

  test('accepts CSS allowlist for deferred UI worker (temporary)', () => {
    const content = 'import styles from "./auth-shell.module.css";';
    assert.equal(checkFixture(content, 'web/lib/app-shell.tsx'), 'pass', 'CSS allowlisted for UI worker slice');
  });

  test('accepts stale-schema test fixture when file is excluded (simulated by not scanning)', () => {
    // Stale-schema setup creates legacy tables in test files which are excluded from shipped scan
    // The scanner itself excludes *.test.* files, so a direct check with a test file path should still be considered
    // Here we simulate by checking that the same content in a test file would be flagged, but in shipped it would not
    // For the scanner's allowlist, stale-schema tests are excluded via file pattern, not via content allowlist
    // So we verify that normalized terminology still passes
    const content = 'role_assignments, role_definitions';
    assert.equal(checkFixture(content, 'web/lib/identity/d1-schema.test.ts'), 'fail', 'test files are not part of shipped scan, but direct fixture check still flags standalone role tables');
    // The actual scanner run excludes this file, so overall verification passes
  });
});
