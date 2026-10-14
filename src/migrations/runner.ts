import crypto from "node:crypto";
import { getKnex } from "../connection.js";
import { debug, warn } from "../logger.js";
import { Schema } from "./schema-builder.js";

export interface Migration {
  name: string;
  up: (db: any, schema: Schema) => Promise<void>;
  down?: (db: any, schema: Schema) => Promise<void>;
}

/**
 * What one `runMigrations()` call actually did.
 *
 * Returned instead of a bare `void` so a caller — `veap migrate` above all —
 * can report the run instead of guessing: an empty `ran` means nothing was
 * pending, and `batch` is only set when migrations were applied.
 */
export interface MigrationRunResult {
  scope: string;
  /** Names of the migrations applied by this call, in execution order. */
  ran: string[];
  /** Batch the migrations of this call were recorded under. */
  batch?: number;
}

async function ensureMigrationsTable(knex = getKnex()) {
  try {
    const hasTable = await knex.schema.hasTable("migrations");
    if (!hasTable) {
      await knex.schema.createTable("migrations", (table: any) => {
        table.text("id").primary();
        table.text("name").notNullable();
        table.integer("batch").notNullable();
        table.timestamp("executed_at").defaultTo(knex.fn.now()).notNullable();
        table.text("scope").notNullable().defaultTo("global");
      });
    } else {
      const hasScope = await knex.schema.hasColumn("migrations", "scope");
      if (!hasScope) {
        await knex.schema.alterTable("migrations", (table: any) => {
          table.text("scope").notNullable().defaultTo("global");
        });
      }
    }
  } catch (error) {
    warn("veap:migration", "Failed to ensure migrations table:", error);
  }
}

async function acquireAdvisoryLockIfPostgres(
  tx: any,
  knex: any,
): Promise<void> {
  const clientName = knex?.client?.config?.client || "";
  if (
    typeof clientName === "string" &&
    (clientName.includes("pg") || clientName.includes("postgres"))
  ) {
    const lockId = 123456;
    try {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [lockId]);
    } catch (_e) {
      debug("veap:migration", "Could not acquire advisory lock, continuing...");
    }
  }
}

/**
 * Creates a compatibility DB adapter for migrations that provides `.execute(query)`
 * wrapping `trx.raw(query)`, while also being directly callable as a Knex query builder
 * on the active migration transaction `trx(tableName)`.
 */
function createMigrationDbAdapter(trx: any) {
  const adapter = (tableName: string) => trx(tableName);
  adapter.raw = (query: any, ...bindings: any[]) => trx.raw(query, ...bindings);
  adapter.execute = (query: any) => {
    const sqlString =
      typeof query === "string"
        ? query
        : query?.query || query?.text || String(query);
    return trx.raw(sqlString);
  };
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return Reflect.get(trx, prop);
    },
    apply(target, thisArg, argArray) {
      return (trx as any)(...argArray);
    },
  });
}

export async function runMigrations(
  scope: string,
  migrations: Migration[],
): Promise<MigrationRunResult> {
  let result: MigrationRunResult = { scope, ran: [] };

  if (migrations.length === 0) return result;

  let knex: any;
  try {
    knex = getKnex();
  } catch {
    return result;
  }
  if (!knex) return result;

  await ensureMigrationsTable(knex);

  await knex.transaction(async (tx: any) => {
    // Acquire advisory lock only if running on PostgreSQL
    await acquireAdvisoryLockIfPostgres(tx, knex);

    debug("veap:migration", `Running migrations for scope: ${scope}`);

    // 1. Get executed migrations for this scope
    const executed = await tx("migrations")
      .select("name")
      .where("scope", scope);

    const executedNames = executed.map((m: any) => m.name);

    // 2. Find pending migrations
    const pending = migrations.filter((m) => !executedNames.includes(m.name));

    if (pending.length === 0) {
      debug("veap:migration", `No new migrations for ${scope}.`);
      return;
    }

    // 3. Get next batch number
    const batchResult = await tx("migrations").max("batch as maxBatch").first();
    const batch = (Number((batchResult as any)?.maxBatch) || 0) + 1;

    const dbAdapter = createMigrationDbAdapter(tx);
    const schema = new Schema(tx);

    // 4. Execute pending
    for (const migration of pending) {
      debug(
        "veap:migration",
        `[${scope}] Running migration: ${migration.name}...`,
      );

      try {
        await migration.up(dbAdapter, schema);
        await tx("migrations").insert({
          id: crypto.randomUUID(),
          name: migration.name,
          scope: scope,
          batch: batch,
          executed_at: new Date(),
        });

        debug(
          "veap:migration",
          `[${scope}] Successfully ran ${migration.name}.`,
        );
      } catch (error) {
        warn(
          "veap:migration",
          `[${scope}] Failed to run ${migration.name}:`,
          error,
        );
        throw error; // Rollback the whole batch on error
      }
    }

    // Reported only once the whole batch is in: an error above rolls the
    // transaction back, so nothing was applied and `ran` stays empty.
    result = { scope, ran: pending.map((migration) => migration.name), batch };
  });

  return result;
}

/**
 * What one `rollbackMigrations()` call actually undid.
 *
 * Mirrors {@link MigrationRunResult} so `veap migrate:rollback` can report the
 * reversed migrations instead of claiming a rollback that never happened.
 */
export interface MigrationRollbackResult {
  scope: string;
  /** Names of the migrations rolled back, in the order their `down()` ran. */
  rolledBack: string[];
}

/**
 * Modern static migration rollback runner.
 * Reverts migrations in reverse order.
 */
export async function rollbackMigrations(
  scope: string,
  migrations: Migration[],
): Promise<MigrationRollbackResult> {
  let result: MigrationRollbackResult = { scope, rolledBack: [] };

  if (migrations.length === 0) return result;

  let knex: any;
  try {
    knex = getKnex();
  } catch {
    return result;
  }
  if (!knex) return result;

  await ensureMigrationsTable(knex);

  await knex.transaction(async (tx: any) => {
    // Acquire advisory lock only if running on PostgreSQL
    await acquireAdvisoryLockIfPostgres(tx, knex);

    // 1. The last batch first, and inside it the most recently executed
    // migration first: a rollback has to walk the batch backwards, otherwise a
    // table added to an existing one would be dropped before its own foreign
    // keys, or after a table that depends on it.
    const executed = await tx("migrations")
      .select("name", "batch", "executed_at")
      .where("scope", scope)
      .orderBy("batch", "desc")
      .orderBy("executed_at", "desc");

    if (executed.length === 0) {
      debug("veap:migration", `No migrations to rollback for ${scope}.`);
      return;
    }

    // Rollback the latest batch
    const latestBatch = executed[0].batch;
    const toRollbackNames = executed
      .filter((m: any) => m.batch === latestBatch)
      .map((m: any) => m.name);

    const dbAdapter = createMigrationDbAdapter(tx);
    const schema = new Schema(tx);
    const rolledBack: string[] = [];

    for (const name of toRollbackNames) {
      const migration = migrations.find((m) => m.name === name);
      if (migration && migration.down) {
        debug(
          "veap:migration",
          `[${scope}] Rolling back migration: ${name}...`,
        );
        try {
          await migration.down(dbAdapter, schema);
          await tx("migrations")
            .where("name", name)
            .where("scope", scope)
            .delete();
          rolledBack.push(name);
          debug("veap:migration", `[${scope}] Rolled back ${name}.`);
        } catch (error) {
          warn(
            "veap:migration",
            `[${scope}] Failed to rollback ${name}:`,
            error,
          );
          throw error;
        }
      }
    }

    // Only reported once the transaction committed: an error above rolls it
    // back, so nothing was undone.
    result = { scope, rolledBack };
  });

  return result;
}
