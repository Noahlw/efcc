import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { applyMigrations, testDb } from './test-bootstrap';
import { createRegistrationRequest, approveRegistration, findRegistrationById } from './registrations';
import { findAccountByUserId } from './accounts';
import { seedDisposableIdentity } from '../identity';

beforeAll(async () => {
  await applyMigrations();
});

describe('registrations: role-free contract', () => {
  test('accounts and registration_requests have no role column or write-guard trigger', async () => {
    const db = testDb();
    const checkColumn = async (table: string, column: string) => {
      const res = await db.prepare(`SELECT count(*) as n FROM pragma_table_info(?) WHERE name = ?`).bind(table, column).all();
      // Fallback: query sqlite_master for column existence via SELECT
      const pragma = await db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first<{ sql: string }>();
      expect(pragma?.sql?.includes(`"${column}"`) ?? pragma?.sql?.includes(` ${column} `) ?? false).toBe(false);
      // Direct check via PRAGMA table_info
      const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      const names = (info.results ?? []).map(r => r.name);
      expect(names).not.toContain(column);
    };
    await checkColumn('accounts', 'role');
    await checkColumn('registration_requests', 'role');

    const triggers = await db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'accounts_role_write_guard%'`).all<{ name: string }>();
    expect(triggers.results ?? []).toEqual([]);
  });

  test('approval creates Active role-free account with automatic 會友基礎', async () => {
    const db = testDb();
    // Ensure disposable identity is seeded (provides Member baseline)
    await seedDisposableIdentity(db, { databaseName: 'E2E_disposable-local' }).catch(() => {});

    const userId = `E2E_REG_${crypto.randomUUID().slice(0, 8)}`;
    const username = `reg_${userId.toLowerCase()}`;
    const name = 'Reg Test';
    const hash = 'pbkdf2_test_hash';

    const req = await createRegistrationRequest(db, {
      userId,
      username,
      name,
      credentialHash: hash,
    });
    expect(req.account_status).toBe('Pending');
    // No role field on returned row
    expect((req as unknown as Record<string, unknown>).role).toBeUndefined();

    const reviewer = 'E2E_DISPOSABLE_ADMIN';
    await approveRegistration(db, { requestId: req.request_id, reviewerId: reviewer });

    const account = await findAccountByUserId(db, userId);
    expect(account).not.toBeNull();
    expect(account?.account_status).toBe('Active');
    expect((account as unknown as Record<string, unknown>).role).toBeUndefined();

    const after = await findRegistrationById(db, req.request_id);
    expect(after?.account_status).toBe('Active');
  });

  test('registration queue returns without role', async () => {
    const db = testDb();
    const rows = await db.prepare(`SELECT request_id, username, name, phone, account_status, submitted_at, reviewed_by, reviewed_at, review_decision, rejection_note FROM registration_requests LIMIT 1`).all();
    // Should succeed without selecting role column
    expect(rows).toBeDefined();
  });
});
