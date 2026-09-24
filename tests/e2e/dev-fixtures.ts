/**
 * Dev-testing worker fixtures (PRG-05 #224 / ADR-0031).
 *
 * Single source of truth for the E2E_ development accounts. The supported
 * seed command writes them to the disposable local D1. Credentials are
 * fixed development values, not GitHub secrets.
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

export const [DEV_ADMIN, DEV_STAFF, DEV_MEMBER] = DEV_ACCOUNTS;
