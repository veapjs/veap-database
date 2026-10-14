import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { runMigrations } from "../../migrations/runner.js";
import { confirmToProceed } from "../confirmation.js";
import {
  hasDatabaseConnection,
  resolveRegisteredMigrations,
  resolveScope,
} from "../migrations.js";

/**
 * `veap migrate` — applies every pending application migration, in one batch.
 *
 * In production the command asks before touching the database; `--force` answers
 * that question for an unattended run, and `--no-interaction` without `--force`
 * resolves it to "no" instead of hanging.
 */
export class MigrateCommand extends Command {
  static signature = "migrate {--scope=app : Migration scope to run}";
  static description = "Run the pending application migrations";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const scope = resolveScope(input);
    const migrations = await resolveRegisteredMigrations(
      this.context.container,
    );

    if (migrations.length === 0) {
      output.warn(
        "No application migrations are registered. Add them to the application with `.withMigrations(appMigrations)`.",
      );
      return 0;
    }

    if (!hasDatabaseConnection()) {
      output.error(
        "No database connection is available. Set DATABASE_URL (or register DatabaseServiceProvider) before running migrations.",
      );
      return 1;
    }

    const proceed = await confirmToProceed(
      this.context,
      output,
      "Run the pending migrations",
    );
    if (!proceed) return 1;

    const result = await runMigrations(scope, migrations);

    if (result.ran.length === 0) {
      output.info(`Nothing to migrate for scope "${scope}".`);
      return 0;
    }

    for (const name of result.ran) {
      output.success(`Migrated: ${name}`);
    }
    output.info(
      `${result.ran.length} migration(s) applied in batch ${result.batch} (scope "${scope}").`,
    );

    return 0;
  }
}
