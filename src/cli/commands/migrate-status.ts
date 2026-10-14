import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { getKnex } from "../../connection.js";
import {
  hasDatabaseConnection,
  resolveRegisteredMigrations,
  resolveScope,
} from "../migrations.js";

/** `executed_at` comes back as a Date, an epoch number or a string, per driver. */
function formatRanAt(value: unknown): string {
  if (value === null || value === undefined) return "—";

  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : undefined;

  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString().replace("T", " ").slice(0, 19);
  }

  const text = String(value).trim();
  return text === "" ? "—" : text.replace("T", " ").slice(0, 19);
}

/**
 * `veap migrate:status` — what is applied and what is still pending.
 *
 * Compares the migrations the application registered against the rows recorded
 * in the `migrations` table for the scope, so the answer is about *this*
 * application, not about the whole database. Rows recorded under the scope that
 * the application no longer declares are reported separately: they are the
 * signature of a renamed or deleted migration file, which `migrate` would
 * otherwise never mention again.
 */
export class MigrateStatusCommand extends Command {
  static signature =
    "migrate:status {--scope=app : Migration scope to inspect}";
  static description = "Show the status of the application migrations";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const scope = resolveScope(input);
    const migrations = await resolveRegisteredMigrations(
      this.context.container,
    );

    if (!hasDatabaseConnection()) {
      output.error(
        "No database connection is available. Set DATABASE_URL (or register DatabaseServiceProvider) before reading the migration status.",
      );
      return 1;
    }

    const knex = getKnex();
    const recorded: Array<{
      name: string;
      batch: number;
      executed_at: unknown;
    }> = (await knex.schema.hasTable("migrations"))
      ? await knex("migrations")
          .select("name", "batch", "executed_at")
          .where("scope", scope)
      : [];

    const byName = new Map(recorded.map((row) => [row.name, row]));
    const rows: string[][] = [];
    let ran = 0;
    let pending = 0;

    for (const migration of migrations) {
      const row = byName.get(migration.name);

      if (row) {
        ran += 1;
        rows.push([
          migration.name,
          "Ran",
          String(row.batch),
          formatRanAt(row.executed_at),
        ]);
        continue;
      }

      pending += 1;
      rows.push([migration.name, "Pending", "—", "—"]);
    }

    if (rows.length === 0) {
      output.info(
        `No application migrations are registered for scope "${scope}".`,
      );
    } else {
      output.table(["Migration", "Status", "Batch", "Ran at"], rows);
      output.info(`${ran} ran, ${pending} pending (scope "${scope}").`);
    }

    const unknown = recorded.filter(
      (row) => !migrations.some((migration) => migration.name === row.name),
    );
    if (unknown.length > 0) {
      output.warn(
        `${unknown.length} migration(s) recorded for scope "${scope}" are not part of this application: ${unknown
          .map((row) => row.name)
          .join(", ")}.`,
      );
    }

    return 0;
  }
}
