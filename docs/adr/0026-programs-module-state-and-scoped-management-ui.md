# Programs Module State and Scoped Management UI

**Status:** accepted

Each Department owns the complete approved module catalog with an explicit enabled or disabled state, seeded disabled at Department creation. Disabling preserves existing records and history while blocking or hiding new module operations. The Programs browser receives server-computed effective capabilities per Program so a scoped Program Leader can discover and manage only the Programs they lead, including Unlisted Programs, without gaining Department configuration or delegation authority. A Department Manager is likewise a scoped effective-access profile over one or more Departments, not a new global Role. The initial Programs Entry Boundary starts every account in Participant mode and may expose only a minimal, capability-aware Management boundary; it does not render operational management data before the Management Workspace slice is delivered. This preserves a single capability model across server enforcement and UI affordances instead of treating global role names or profile labels as UI authority.

**Considered Options:** Returning only enabled module keys was rejected because it cannot represent disabled state or render reliable configuration controls. Role-based UI gating was rejected because Program Leader is a scoped relationship, not a global Role.
