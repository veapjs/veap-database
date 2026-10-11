import type { Token } from "@veap/kernel";
import type { Knex } from "knex";

/**
 * IoC Token for primary Knex database connection instance.
 */
export const DATABASE: Token<Knex> = Symbol.for("veap:kernel:database");

/**
 * IoC Token for application database migrations array.
 */
export const APP_MIGRATIONS: Token<any[]> = Symbol.for(
  "veap:kernel:app-migrations",
);
