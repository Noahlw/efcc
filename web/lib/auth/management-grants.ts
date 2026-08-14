/**
 * EFCC D1 identity — cheap cross-module existence check for the `/me`
 * section projection (#215 ATT-03: an active Program Leader must be able to
 * reach the Events operator surface within their own Program).
 *
 * `sections.ts` otherwise authorizes purely by role (Member never gets
 * `events`), because most Members hold no scoped grant and a role-only
 * check is the cheapest correct answer for them. A Member who additionally
 * holds an active Program Leader or Department Manager grant is the one
 * case that needs a DB check — kept to a single indexed existence query
 * rather than pulling the full `DepartmentWorkspace`/capability graph into
 * the highest-traffic auth route.
 */
export async function hasActiveManagementGrant(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM program_leaders WHERE user_id = ? AND revoked_at IS NULL
       UNION ALL
       SELECT 1 FROM department_managers WHERE user_id = ? AND revoked_at IS NULL
       LIMIT 1`
    )
    .bind(userId, userId)
    .first();
  return row !== null;
}
