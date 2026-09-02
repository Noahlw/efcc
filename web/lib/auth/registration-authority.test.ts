import { beforeAll, describe, expect, test } from 'vitest';
import { applyMigrations, testDb } from './test-bootstrap';
import { approveRegistration, createRegistrationRequest } from './registrations';
import { findAccountByUserId } from './accounts';
beforeAll(async () => {
  await applyMigrations();
});

describe('registration approval authority', () => {
  test('approval creates Active role-free account', async () => {
    const db = testDb();
    const userId = `E2E_RA2_${crypto.randomUUID().slice(0, 8)}`;
    const username = `ra2_${userId.toLowerCase()}`;
    const req = await createRegistrationRequest(db, {
      userId,
      username,
      name: 'RA2 Test',
      credentialHash: 'hash',
    });
    expect(req.account_status).toBe('Pending');
    expect((req as unknown as Record<string, unknown>).role).toBeUndefined();

    // Simulate approval by directly calling the registration module (bypassing worker auth)
    // The D1 layer should create an Active account without role
    await approveRegistration(db, { requestId: req.request_id, reviewerId: 'E2E_DISPOSABLE_ADMIN' });
    const account = await findAccountByUserId(db, userId);
    expect(account).not.toBeNull();
    expect(account?.account_status).toBe('Active');
    expect((account as unknown as Record<string, unknown>).role).toBeUndefined();
  });
});
