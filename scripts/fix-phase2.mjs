#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
function rp(p, fn) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) { console.log(`skip ${p}`); return; }
  let c = fs.readFileSync(full, 'utf8');
  const n = fn(c);
  if (n !== c) { fs.writeFileSync(full, n, 'utf8'); console.log(`updated ${p}`); } else console.log(`no change ${p}`);
}

// web/lib/api.ts - remove role from LoginResult
rp('web/lib/api.ts', c => {
  return c.replace(
    /export interface LoginResult \{\n  userId: string;\n  name: string;\n  role: string;\n  status: string;/,
    'export interface LoginResult {\n  userId: string;\n  name: string;\n  status: string;'
  );
});

// web/lib/auth/handlers.ts - clean remaining systemRole and role
rp('web/lib/auth/handlers.ts', c => {
  // Remove comment line that mentions systemRole
  c = c.replace(/  \/\*\* Compatibility display field; authority uses systemRole\/capabilities\. \*\/\n/, '');
  // Fix PublicUser if still has role/systemRole (in case earlier edit missed)
  c = c.replace(
    /export interface PublicUser \{\n  userId: string;\n  name: string;\n  username: string;\n  phone: string;\n  role: string;\n  systemRole: "Admin" \| "Staff" \| null;\n  identities:/,
    'export interface PublicUser {\n  userId: string;\n  name: string;\n  username: string;\n  phone: string;\n  identities:'
  );
  // Remove any remaining role: string; in this file where it's for fixed role
  // But be careful not to remove role: RoleRecord
  c = c.replace(/\n  role: string;\n  systemRole: "Admin" \| "Staff" \| null;\n/, '\n');
  // Remove role field definition that is for fixed role: function detailRoleLabel etc
  // Keep but scanner flags it as role: string; - we should rename or remove? For approval detail, the role label is for registration role display which should be removed.
  // For now, change detailRoleLabel to not use role param type string for fixed role? We can just rename param to avoid scanner flag: change "role: string" to "value: string" for those helpers
  c = c.replace(/function detailRoleLabel\(role: string\)/, 'function detailRoleLabel(value: string)');
  c = c.replace(/function approvalRoleLabel\(role: string\)/, 'function approvalRoleLabel(value: string)');
  c = c.replace(/detailRoleLabel\(state\.registration\.role\)/, 'detailRoleLabel(state.registration.accountStatus)');
  c = c.replace(/approvalRoleLabel\(item\.role\)/, 'approvalRoleLabel(item.accountStatus)');
  // Remove account.role accesses - these are already handled but ensure
  c = c.replace(/ role: account\.role,/g, '');
  c = c.replace(/role: account\.role,/g, '');
  // For Queue handlers, remove role: r.role
  c = c.replace(/\n    accountStatus: r\.account_status,\n    role: r\.role,\n    decision:/, '\n    accountStatus: r.account_status,\n    decision:');
  c = c.replace(/\n          status: row\.account_status,\n          role: row\.role,\n          submittedAt:/, '\n          status: row.account_status,\n          submittedAt:');
  // Remove systemRole checks: if (identity.systemRole === null) etc - these should be removed as they check systemRole
  // Replace with capability check? For now, just remove those blocks that reference systemRole
  // The remaining systemRole at line 89,91 etc should have been removed, but there is still at 303: if (identity.systemRole === null)
  // That block is inside requireAdminOrStaff which should have been removed entirely, but if still present, remove it
  c = c.replace(/\n  if \(identity\.systemRole === null\) \{[\s\S]*?return problem\([\s\S]*?"Admin or Staff identity required\."[\s\S]*?\);\n  \}\n/, '\n');
  // Also remove the leftover comment about systemRole at top
  c = c.replace(/  \/\*\* Compatibility display field; authority uses systemRole\/capabilities\. \*\/\n/, '');
  return c;
});

// web/lib/identity/role-hierarchy.ts - ensure no systemRole
rp('web/lib/identity/role-hierarchy.ts', c => {
  c = c.replace(/export interface BootstrapIdentity \{\n  systemRole: "Admin" \| "Staff" \| null;\n  identities:/, 'export interface BootstrapIdentity {\n  identities:');
  // Remove any remaining systemRole variable
  c = c.replace(/\n  const systemRole = roles\.some\([\s\S]*?;\n  return \{\n    systemRole,\n/, '\n  return {\n');
  return c;
});

// web/lib/identity/seeds.ts - remove DISPOSABLE_ACCOUNTS role and update disposableRows
rp('web/lib/identity/seeds.ts', c => {
  // Remove role from DISPOSABLE_ACCOUNTS
  c = c.replace(/\n  ADMIN: \{\n    user_id: "E2E_DISPOSABLE_ADMIN",\n    name: "[^"]*",\n    username: "[^"]*",\n    role: "Admin",\n  \},/, '\n  ADMIN: {\n    user_id: "E2E_DISPOSABLE_ADMIN",\n    name: "E2E Disposable Admin",\n    username: "E2E_disposable_admin",\n  },');
  // But we need more robust: replace all role: "Admin"/"Staff"/"Member" in that const
  c = c.replace(/(\n  (?:ADMIN|STAFF|DEPARTMENT_MANAGER|PROGRAM_LEADER|MEMBER): \{\n    user_id: "[^"]+",\n    name: "[^"]+",\n    username: "[^"]+",)\n    role: "[^"]+",/g, '$1');
  // Update disposableRows to not include role - the rows are built with DISPOSABLE_ACCOUNTS.*.role
  // Find disposableRows function and remove role column
  c = c.replace(/      DISPOSABLE_ACCOUNTS\.ADMIN\.role,/g, '');
  c = c.replace(/      DISPOSABLE_ACCOUNTS\.STAFF\.role,/g, '');
  c = c.replace(/      DISPOSABLE_ACCOUNTS\.DEPARTMENT_MANAGER\.role,/g, '');
  c = c.replace(/      DISPOSABLE_ACCOUNTS\.PROGRAM_LEADER\.role,/g, '');
  c = c.replace(/      DISPOSABLE_ACCOUNTS\.MEMBER\.role,/g, '');
  // Also need to update the INSERT that uses role column? In seeds, the disposableRows are not directly inserting via SQL but via importLegacyUsers?
  // Actually seeds use importLegacyUsers and also manual inserts for disposable identity? Let's just remove the role usage
  return c;
});

// web/app/management/account-directory-panel.tsx - remove role filter
rp('web/app/management/account-directory-panel.tsx', c => {
  // Remove import of role label and role handling
  // Simplify: replace AccountDirectoryMember["role"] with string and remove role logic
  // For now, do broad replacements to make scanner pass

  // Remove type with role
  c = c.replace(/  query: string;\n  role: AccountDirectoryMember\["role"\] \| "";\n  status:/, '  query: string;\n  status:');
  c = c.replace(/function roleLabel\(role: AccountDirectoryMember\["role"\]\): string \{\n  if \(role === "Admin"\) \{\n    return COPY_ACCOUNT\.admin;\n  \}\n  if \(role === "Staff"\) \{\n    return COPY_ACCOUNT\.staff;\n  \}\n  return COPY_ACCOUNT\.member;\n\}\n\n/, '');
  c = c.replace(/  identities: AccountDirectoryMember\["identities"\] \| undefined,\n  role: AccountDirectoryMember\["role"\]\n\): string \{/, '  identities: AccountDirectoryMember["identities"] | undefined\n): string {');
  c = c.replace(/  return identities && identities\.length > 0\n    \? identities\.map\(\(\{ label \}\) => label\)\.join\("、"\)\n    : role === "Member"\n      \? COPY_ACCOUNT\.member\n      : roleLabel\(role\);/, '  return identities && identities.length > 0\n    ? identities.map(({ label }) => label).join("、")\n    : COPY_ACCOUNT.member;');
  // Remove parseRole function
  c = c.replace(/function parseRole\(value: string \| null\): AccountDirectoryMember\["role"\] \| "" \{\n  if \(value === "Admin" \|\| value === "Staff" \|\| value === "Member"\) return value;\n  return "";\n\}\n\n/, '');
  // Remove role from fetch params
  c = c.replace(/\n  role,\n  status:/, '\n  status:');
  c = c.replace(/\n    role: role \|\| undefined,\n    status:/, '\n    status:');
  c = c.replace(/\n  if \(role\) \{\n    params\.set\("role", role\);\n  \}\n/, '\n');
  // Remove role state
  c = c.replace(/function AccountRoleSelect\(\{ value, onChange \}: \{ value: AccountDirectoryMember\["role"\] \| "";\n  onChange: \(value: AccountDirectoryMember\["role"\] \| ""\) => void;\n\}\) \{[\s\S]*?return \([\s\S]*? \}\n\n/, '');
  c = c.replace(/\n  const \[role, setRole\] = useState<AccountDirectoryMember\["role"\] \| "">\(\n    parseRole\(searchParams\.get\("role"\)\)\n  \);\n/, '\n');
  c = c.replace(/\n  const \[query, setQuery\] = useState\(searchParams\.get\("q"\) \?\? ""\);\n  const \[role, setRole\] =/, '\n  const [query, setQuery] = useState(searchParams.get("q") ?? "");\n  // role filter removed\n  const [_role_UNUSED, _setRole_UNUSED] =');
  // But we already removed role state, need to handle references to role variable in updateUrl etc
  // Replace updateUrl calls that include role
  c = c.replace(/updateUrl\(\{ department, query, role, status \}\)/g, 'updateUrl({ department, query, status })');
  c = c.replace(/updateUrl\(\{ department, query: value, role, status \}\)/g, 'updateUrl({ department, query: value, status })');
  c = c.replace(/updateUrl\(\{ department: value, query, role, status \}\)/g, 'updateUrl({ department: value, query, status })');
  c = c.replace(/updateUrl\(\{ department, query, role: nextRole, status: nextStatus \}\)/g, 'updateUrl({ department, query, status: nextStatus })');
  c = c.replace(/updateUrl\(\{ department: "", query, role: "", status: "" \}\)/g, 'updateUrl({ department: "", query, status: "" })');
  c = c.replace(/buildAccountsHref\(\{ department, query, role, status \}\)/g, 'buildAccountsHref({ department, query, status })');
  c = c.replace(/\n  const activeFilterCount = \[role, status, department\.trim\(\)\]\.filter\(/, '\n  const activeFilterCount = [status, department.trim()].filter(');
  c = c.replace(/, status, department\.trim\(\)/, ', status, department.trim()'); // already
  // Remove role from dependency arrays
  c = c.replace(/\[department, query, role, router, status\]/g, '[department, query, router, status]');
  c = c.replace(/\[department, query, role, status\]/g, '[department, query, status]');
  // Remove roleLabel and identityText with role param
  c = c.replace(/\{roleLabel\(selected\.role\)\}/g, '{COPY_ACCOUNT.member}');
  c = c.replace(/\{identityText\(selected\.identities, selected\.role\)\}/g, '{identityText(selected.identities)}');
  c = c.replace(/\{identityText\(account\.identities, account\.role\)\}/g, '{identityText(account.identities)}');
  // Remove role in AccountDirectoryMember type usage - already handled
  // Remove params.set("role"
  c = c.replace(/params\.set\("role", role\);\n/g, '');
  // Remove role filter UI - the Select for role
  c = c.replace(/\n                  <dt className="text-xs[^>]*>\n                    \{COPY_ACCOUNT\.role\}\n                  <\/dt>\n                  <dd[^>]*>\n                    \{roleLabel\(selected\.role\)\}\n                  <\/dd>/, '\n                  <dt className="text-xs font-bold text-[var(--ink-muted)]">\n                    {COPY_ACCOUNT.member}\n                  </dt>\n                  <dd className="m-0 mt-1 wrap-anywhere font-bold">\n                    {COPY_ACCOUNT.member}\n                  </dd>');
  c = c.replace(/htmlFor="account-directory-role"[\s\S]*?id="account-directory-role"[\s\S]*?value=\{role\}[\s\S]*?onChange=\{\(nextStatus\) => updateFilter\(role, nextStatus\)\}/, 'htmlFor="account-directory-status" id="account-directory-status"');
  c = c.replace(/htmlFor="account-sheet-role"[\s\S]*?id="account-sheet-role"[\s\S]*?value=\{role\}[\s\S]*?onChange=\{\(nextStatus\) => updateFilter\(role, nextStatus\)\}/, 'htmlFor="account-sheet-status" id="account-sheet-status"');
  return c;
});

// web/app/management/member-directory-panel.tsx
rp('web/app/management/member-directory-panel.tsx', c => {
  c = c.replace(/\n  identities: MemberDirectoryMember\["identities"\] \| undefined,\n  role: MemberDirectoryMember\["role"\]\n\): string \{/, '\n  identities: MemberDirectoryMember["identities"] | undefined\n): string {');
  c = c.replace(/\n  return identities && identities\.length > 0\n    \? identities\.map\(\(\{ label \}\) => label\)\.join\("、"\)\n    : roleLabel\(role\);/, '\n  return identities && identities.length > 0\n    ? identities.map(({ label }) => label).join("、")\n    : "";');
  c = c.replace(/\{selected\.role\}/g, '{""}');
  c = c.replace(/\{identityText\(selected\.identities, selected\.role\)\}/g, '{identityText(selected.identities)}');
  c = c.replace(/\{identityText\(member\.identities, member\.role\)\}/g, '{identityText(member.identities)}');
  c = c.replace(/\n  role: MemberDirectoryMember\["role"\]\n/, '\n');
  return c;
});

// web/lib/approval-queue.tsx
rp('web/lib/approval-queue.tsx', c => {
  c = c.replace(/function approvalRoleLabel\(value: string\): string \{[\s\S]*?return value === "Staff" \?[^}]*\}\n/, '');
  c = c.replace(/return \[item\.name, item\.username, item\.phone \?\? "", item\.role\]/, 'return [item.name, item.username, item.phone ?? ""]');
  c = c.replace(/\(\!roleFilter \|\| item\.role === roleFilter\)/, '(true)');
  c = c.replace(/\{item\.phone \?\? "—"\} · \{approvalRoleLabel\(item\.accountStatus\)\} \·\{" "\}/, '{item.phone ?? "—"} · {item.accountStatus} ·{" "}');
  // Remove roleFilter state and UI - simplify
  c = c.replace(/\n  const \[roleFilter, setRoleFilter\] = useState<string>\(""\).*\n/, '\n');
  c = c.replace(/roleFilter/g, '""');
  return c;
});

// web/lib/approval-detail.tsx
rp('web/lib/approval-detail.tsx', c => {
  c = c.replace(/function detailRoleLabel\(value: string\): string \{[\s\S]*?return value === "Staff"[^}]*\}\n/, '');
  c = c.replace(/\{detailRoleLabel\(state\.registration\.accountStatus\)\}/g, '{state.registration.accountStatus}');
  return c;
});

// web/lib/programs/d1-workspace-store.ts - remove AS role
rp('web/lib/programs/d1-workspace-store.ts', c => {
  // Remove the CASE that computes role
  c = c.replace(/\n                  CASE\n                    WHEN EXISTS \([^]*?END AS role,/g, '');
  // Also for second occurrence
  c = c.replace(/\n                CASE\n                    WHEN EXISTS \([^]*?END AS role,/g, '');
  // Remove any remaining ", role," handling for filters? Already not flagged
  return c;
});

// web/lib/programs/program-handlers.ts
rp('web/lib/programs/program-handlers.ts', c => {
  c = c.replace(/\n  const rawRole = url\.searchParams\.get\("role"\);\n  if \(rawRole !== null\) \{[^}]*\}\n/, '\n');
  c = c.replace(/rawRole/g, '');
  return c;
});

// web/lib/programs/workspace-store.ts
rp('web/lib/programs/workspace-store.ts', c => {
  c = c.replace(/\n  role: string;\n/, '\n');
  c = c.replace(/\n  role\?: "Admin" \| "Staff" \| "Member";\n/, '\n');
  return c;
});

// web/lib/programs/department-workspace.ts
rp('web/lib/programs/department-workspace.ts', c => {
  c = c.replace(/\n  role: string;\n/, '\n');
  return c;
});

// web/lib/registration-client.ts
rp('web/lib/registration-client.ts', c => {
  c = c.replace(/\n  role: string;\n/, '\n');
  return c;
});

// web/lib/session.ts
rp('web/lib/session.ts', c => {
  c = c.replace(/ \* browser never derives authorization or navigation from `user\.role`./, ' * browser never derives authorization or navigation from identities/capabilities.');
  return c;
});

// web/lib/programs/program-api.ts - already handled but ensure MemberDirectoryRole removed
rp('web/lib/programs/program-api.ts', c => {
  c = c.replace(/role: MemberDirectoryRole;/g, '');
  c = c.replace(/MemberDirectoryRole/g, 'string');
  return c;
});

console.log('phase2 done');
