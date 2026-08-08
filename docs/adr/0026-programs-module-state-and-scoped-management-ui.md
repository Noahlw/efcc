# Programs Module State and Scoped Management UI

**Status:** proposed

Each Department owns the complete approved module catalog with an explicit enabled or disabled state, seeded disabled at Department creation. Disabling preserves existing records and history while blocking or hiding new module operations. The Programs browser receives server-computed effective capabilities per Program so a scoped Program Leader can discover and manage only the Programs they lead, including Unlisted Programs, without gaining Department configuration or delegation authority. This preserves a single capability model across server enforcement and UI affordances instead of treating global role names as UI authority.

**Considered Options:** Returning only enabled module keys was rejected because it cannot represent disabled state or render reliable configuration controls. Role-based UI gating was rejected because Program Leader is a scoped relationship, not a global Role.
