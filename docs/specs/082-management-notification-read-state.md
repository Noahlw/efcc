# 082 — Management notification read-state overlay

Status: Implemented in Prompt 3 integration branch  
Scope: Programs management surface only

## Purpose

The management landing page exposes a compact notification bell. Its badge and
list are projections of current, capability-scoped operational state. The
database stores only when a user read a particular source revision; it does
not materialize notification history or delivery records.

## Current sources

The server projects these sources on every request:

| Source | Key | Revision | Actionability |
| --- | --- | --- | --- |
| Pending enrollment queue | `enrollment:<program_id>` | `v1:<pending_count>:<latest_submitted_at>` | Actionable |
| Future inactive Event | `event:<event_id>` | `v1:<status>:<availability>:<updated_at>` | Actionable |
| Future cancelled Event | `event:<event_id>` | `v1:<status>:<availability>:<updated_at>` | Informational |

Only Programs and modules inside the actor's effective capability scope are
eligible. Admin and Staff receive global scope; Department Manager receives
department scope; Program Leader receives their assigned Program scope; Member
is denied management notification access by the server.

An item is unread when no read-state row exists for its exact
`(user_id, source_key, source_revision)`. A changed revision is therefore a
new unread item while older read-state rows remain as audit state.

## Persistence

Migration `0009_program_notification_reads.sql` creates:

- `user_id`
- `source_key`
- `source_revision`
- `read_at`

The composite primary key is `(user_id, source_key, source_revision)`. Writes
are `INSERT OR IGNORE`, so mark-read is idempotent and the first read timestamp
is retained. There is no cleanup job in this scope.

## HTTP contract

### `GET /api/v1/programs/notifications?limit=20`

The server clamps the response limit to 1–20 and returns:

```json
{
  "items": [],
  "unread_count": 0,
  "has_more": false
}
```

Items are ordered actionable-first, then by latest source update. The badge
counts source items, not the number of pending requests or Events represented
by one item. Each item includes the opaque source key/revision, read state,
Program/Department context, and either enrollment count or Event detail needed
for a safe deep link.

### `POST /api/v1/programs/notifications/read`

Body:

```json
{
  "items": [
    { "source_key": "event:event-1", "source_revision": "v1:..." }
  ]
}
```

The handler derives the actor from the access cookie. It reprojects current
authorized sources and persists only exact source key/revision pairs that are
currently visible to that actor. Unknown, stale, or out-of-scope pairs are
ignored; duplicate pairs are harmless.

## UI behavior

- Management landing uses a 44px compact bell trigger and unread badge.
- No large static “Needs Attention” dashboard card is rendered.
- Opening the bell marks the currently visible unread items read and updates
  the compact surface optimistically.
- Clicking an item deep-links to the Program's Participants or Events task and
  also submits that item's read state.
- `View all` uses `/programs?mode=management&task=notifications` and remains a
  bounded phone-friendly list.
- Loading, error, empty, unread, and read states are represented without
  changing the surrounding production design language.

## Explicit non-goals

This contract does not provide push notifications, email, SMS, delivery
receipts, resolved-history feeds, or guest/scanner acceptance. Those remain
separate follow-up work.
