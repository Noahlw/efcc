# Module Specification: Programs Catalog

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

---

## 1. Purpose

Maintain a catalog of church programs (activities, ministries, classes) that members can browse and enroll in. The catalog is cached server-side for performance and exposed to the web app for enrollment UI.

---

## 2. Data Model (Programs Sheet)

| Column | Example | Notes |
| --- | --- | --- |
| Program_ID | `dd646847` | Primary key. Free-text identifier. |
| Program_Name | `青崇` | Display name shown in the enrollment UI. |
| Type | `Youth` | Categorization field (e.g. Youth, Bible Study, Fellowship). Free text. |
| Description | `Youth worship service every Sunday 3pm` | Free-text description shown in the enrollment card. |

---

## 3. Caching Layer

The Programs catalog uses `CacheService.getScriptCache()` to reduce spreadsheet reads.

| Setting        | Value                                         |
| -------------- | --------------------------------------------- |
| Cache key      | `programs_catalog_v1`                         |
| TTL            | 300 seconds (5 minutes)                       |
| Storage format | `JSON.stringify` of the parsed programs array |

**Flow**:

1. On `getProgramsCatalog_()`: check cache → if hit, parse and return.
2. If cache miss: read Programs sheet, parse rows into objects, cache the result, return.
3. Cache is not explicitly invalidated — it expires after 5 minutes, or when the script's execution cache is cleared.

**Code Constants**:

```javascript
var PROGRAMS_CACHE_KEY_ = "programs_catalog_v1";
var PROGRAMS_CACHE_TTL_SEC_ = 300;
```

---

## 4. Public API

### getProgramsCatalog()

Returns the full list of programs. Wrapped in try-catch for safe error handling (returns empty array on failure).

**Return format**:

```json
[
  { "id": "dd646847", "name": "青崇", "type": "Youth", "description": "..." },
  { "id": "...", "name": "...", "type": "...", "description": "..." }
]
```

### getAvailablePrograms(userId)

Returns the full program catalog with an `isEnrolled` boolean per program, indicating whether the given user is actively enrolled.

**Return format**:

```json
[
  {
    "id": "dd646847",
    "name": "青崇",
    "type": "Youth",
    "description": "...",
    "isEnrolled": true
  },
  {
    "id": "...",
    "name": "...",
    "type": "...",
    "description": "...",
    "isEnrolled": false
  }
]
```

This is the primary function consumed by the web app to render the enrollment screen.

---

## 5. Column Discovery

Column indexes are resolved by fuzzy header name matching via `findHeaderIndex_()`:

| Lookup Priority | Matches |
| --- | --- |
| Program_ID | `program_id`, `program id`, `programid` |
| Program_Name | `program_name`, `program name`, `name` |
| Type | `type` |
| Description | `description`, `program_description`, `program description` |

This allows the sheet to have extra columns (e.g. Location, Leader, Max Capacity) without breaking the code — they are simply ignored.

---

## 6. Edge Cases & Error Handling

| Scenario | Behavior |
| --- | --- |
| Programs sheet missing | Returns empty array `[]`. |
| Programs sheet has header but no data rows | Returns empty array `[]`. |
| Program_ID missing on a row | Row is skipped entirely (not included in results). |
| Cache put fails (size limit) | Cache write is wrapped in try-catch — silently continues. Returns fresh data from sheet. |
| getProgramsCatalog throws (unexpected) | Wrapper catches and returns empty array. |
| getAvailablePrograms throws | Returns empty array. |

---

## 7. Related ADRs

- **ADR-0001**: Google Sheets as Database — Programs sheet is a core data store with cache optimization.
- **ADR-0002**: PIN-Based Authentication — `getAvailablePrograms` uses the authenticated userId to resolve enrollment status.
- **ADR-0003**: `google.script.run` — Both catalog functions are consumed by the web app via this RPC mechanism.

---

## 8. Future Considerations

- **Cache invalidation**: When Programs are edited via the app (not yet implemented), the cache should be invalidated immediately rather than waiting for TTL expiry.
- **Program editing UI**: Currently programs are managed directly in the spreadsheet. An admin UI could manage them through the app.
- **Type filtering**: The `type` field is populated but not filtered on in the current UI — the catalog returns all programs. Future filtering or categorization tabs could use this field.
- **Archived programs**: Add a `Status` column to hide old programs without deleting them. Currently, removing a program row removes it from the API silently.
