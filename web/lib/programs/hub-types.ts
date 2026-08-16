/**
 * EFCC Programs domain — Management Hub directory wire contract (087-01
 * #310). Pure types shared across the Worker projection
 * (department-workspace.ts) and the browser client (program-api.ts); no
 * imports, so both tsconfig programs can include this module.
 */

export interface ManagementHubRow {
  key: string;
  label: string;
  description: string;
  href: string;
}

export interface ManagementHubGroup {
  key: string;
  label: string;
  rows: ManagementHubRow[];
}

export interface ManagementHubView {
  groups: ManagementHubGroup[];
  entryCard: ManagementHubRow | null;
}
