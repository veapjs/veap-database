import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { rollbackMigrations } from "../../migrations/runner.js";
import { confirmToProceed } from "../confirmation.js";
import {
  hasDatabaseConnection,
  resolveRegisteredMigrations,
  resolveScope,
} from "../migrations.js";

/**
 * `veap migrate:rollback` — undoes the last batch of the scope.
 *
 * Runs each migration's `down()` in the reverse of the order it was applied, and
 * deletes the `migrations` rows it undid, so a `veap migrate` afterwards
 * re-applies exactly what was rolled back. In production the command asks first;
 * `--force` answers that question for an unattended run.
 */
export class MigrateRollbackCommand extends Command {
  static signature =
    "migrate:rollback {--scope=app : Migration scope to roll back}";
  static description = "Roll back the last batch of application migrations";

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
        "No database connection is available. Set DATABASE_URL (or register DatabaseServiceProvider) before rolling migrations back.",
      );
      return 1;
    }

    const proceed = await confirmToProceed(
      this.context,
      output,
      "Roll back the last batch of migrations",
    );
    if (!proceed) return 1;

    const result = await rollbackMigrations(scope, migrations);

    if (result.rolledBack.length === 0) {
      output.info(`Nothing to roll back for scope "${scope}".`);
      return 0;
    }

    for (const name of result.rolledBack) {
      output.success(`Rolled back: ${name}`);
    }
    output.info(
      `${result.rolledBack.length} migration(s) rolled back (scope "${scope}").`,
    );

    return 0;
  }
}
