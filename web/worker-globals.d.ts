import type {
  D1Database as CloudflareD1Database,
  D1PreparedStatement as CloudflareD1PreparedStatement,
  RateLimit as CloudflareRateLimit,
} from "@cloudflare/workers-types";

declare global {
  type D1Database = CloudflareD1Database;
  type D1PreparedStatement = CloudflareD1PreparedStatement;
  type RateLimit = CloudflareRateLimit;
}
