import type {
  D1Database as CloudflareD1Database,
  D1PreparedStatement as CloudflareD1PreparedStatement,
  D1Result as CloudflareD1Result,
  RateLimit as CloudflareRateLimit,
} from "@cloudflare/workers-types";

declare global {
  type D1Database = CloudflareD1Database;
  type D1PreparedStatement = CloudflareD1PreparedStatement;
  type D1Result<T = unknown> = CloudflareD1Result<T>;
  type RateLimit = CloudflareRateLimit;
}
