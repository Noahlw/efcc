# Global Permission Policy Write Contract

**Status:** accepted

Every Active Account retains the Church Member participant baseline. The global Role (`Admin`, `Staff`, or `Member`) adds management authority; `Staff` and `Admin` do not stop acting as members. The Permission Policy is a global Role-to-Capability mapping only. It has no per-account overrides, while Department Manager and Program Leader remain separate scoped grants combined by the server when projecting effective access.

Staff represents pastors and core operators, so its default Department and Program management authority matches Admin for normal operations, including publishing and delegation. Admin-only authority is limited to changing the authorization system itself (`account.permissions.write`) and church-wide Home publishing (`home.publish`). The participant capability `program.enroll` is part of the shared baseline for Admin, Staff, and Member.

S4 adds explicit operation capabilities for `account.directory.read`, `registration.approval.manage`, and `account.permissions.write`; `account.permissions.read` remains separate. Permission Policy mutation is Admin-only, staged as one atomic versioned change set, and authorized by the server. The server rejects stale revisions with `409 Conflict`, preserves Admin access to both Permission Policy read and write, applies idempotency, and records auditable terminal outcomes. Browser visibility and disabled controls are never authorization.

**Consequences:** The S4 matrix exposes the complete policy and clearly distinguishes editable cells from locked participant or safety invariants. Account lifecycle operations, pastoral member records, and any future per-account access exception require a separate Wayfinder decision; they are not implicit extensions of this contract.
