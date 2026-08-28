-- Migration number: 0020  2026-08-28T00:00:00.000Z
-- #476 remediation — terminal-state immutability for the role policy
-- idempotency ledger (Spec 091 §6).
--
-- The first D1 batch in applyRoleMutation() inserts the PENDING
-- idempotency row, then UPDATEs it twice in the same atomic transaction
-- to set applied / audit_written and to flip the outcome to a terminal
-- value (SUCCESS or CONFLICT). Those two UPDATEs are the only legitimate
-- mutations of a ledger row, and they only ever run while the row is
-- still PENDING. Once the row is terminal, no UPDATE or DELETE is
-- permitted at the schema layer, so a replay, a buggy caller, or an
-- operator can never alter or delete a recorded idempotency decision.
--
-- Triggers are scoped to the terminal state only (outcome <> 'PENDING'),
-- so the legitimate atomic path stays open. The PENDING row is the
-- only mutable state, and only this migration's mutation flow mutates
-- it.

CREATE TRIGGER role_policy_mutations_terminal_no_update
BEFORE UPDATE ON role_policy_mutations
WHEN OLD.outcome <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'role_policy_mutations: terminal idempotency rows are immutable');
END;

CREATE TRIGGER role_policy_mutations_terminal_no_delete
BEFORE DELETE ON role_policy_mutations
WHEN OLD.outcome <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'role_policy_mutations: terminal idempotency rows are immutable');
END;

-- Migration ends here
