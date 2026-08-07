/**
 * Dev-testing worker fixtures (PRG-05 #224 / ADR-0028).
 *
 * Single source of truth for the E2E_ dev accounts: seeded into the
 * dev-testing D1 by seed-dev-accounts.ts, defaulted into the suite by
 * programs-d1.test.ts, and documented in .github/CI-SECRETS.md. Fixed
 * dev-only credentials — NOT GitHub secrets.
 */
export interface DevFixtureAccount {
  userId: string;
  username: string;
  credential: string;
  role: "Admin" | "Staff" | "Member";
}

export const DEV_ACCOUNTS: DevFixtureAccount[] = [
  {
    userId: "U-E2E-ADMIN",
    username: "E2E_admin",
    credential: "E2E_admin!dev",
    role: "Admin",
  },
  {
    userId: "U-E2E-STAFF",
    username: "E2E_staff",
    credential: "E2E_staff!dev",
    role: "Staff",
  },
  {
    userId: "U-E2E-MEMBER",
    username: "E2E_member",
    credential: "E2E_member!dev",
    role: "Member",
  },
];

export const DEV_ADMIN = DEV_ACCOUNTS[0];
export const DEV_STAFF = DEV_ACCOUNTS[1];
export const DEV_MEMBER = DEV_ACCOUNTS[2];
