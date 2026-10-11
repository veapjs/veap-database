import type { Knex } from "knex";

export interface DatabaseConfig extends Knex.Config {
  driver?: "postgres" | "sqlite" | "mysql";
}

export interface PostgresSslOptions {
  databaseUrl: string;
  isProd: boolean;
  rejectUnauthorizedEnv?: string;
  caCert?: string;
}

export type PostgresSslConfig =
  | false
  | {
      rejectUnauthorized: boolean;
      ca?: string;
    };

export interface TransactionOptions {
  /**
   * When true and called inside an existing transaction, creates a SAVEPOINT
   * instead of reusing the outer transaction directly. This allows catching
   * errors in the inner transaction without aborting the outer transaction.
   *
   * @default false (Propagation: REQUIRED - reuses outer transaction)
   */
  savepoint?: boolean;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
}
