import { ServiceProvider } from "@veap/kernel";
import type { CommandEntry } from "@veap/kernel/cli";
import { MakeMigrationCommand } from "./cli/commands/make-migration.js";
import { MigrateCommand } from "./cli/commands/migrate.js";
import { MigrateRollbackCommand } from "./cli/commands/migrate-rollback.js";
import { MigrateStatusCommand } from "./cli/commands/migrate-status.js";
import { runMigrations } from "./migrations/runner.js";
import { APP_MIGRATIONS } from "./tokens.js";

export class MigrationServiceProvider extends ServiceProvider {
  private migrations?: any[];

  constructor(container: any, migrations?: any[]) {
    super(container);
    this.migrations = migrations;
  }

  /**
   * Migration commands, harvested by the console for the host application:
   * `veap make:migration` scaffolds one, `veap migrate` applies the pending
   * ones, `veap migrate:status` reports them and `veap migrate:rollback` undoes
   * the last batch.
   */
  commands(): CommandEntry[] {
    return [
      MakeMigrationCommand,
      MigrateCommand,
      MigrateStatusCommand,
      MigrateRollbackCommand,
    ];
  }

  register(): void {
    if (this.migrations?.length) {
      this.container.register({
        token: APP_MIGRATIONS,
        useValue: this.migrations,
      });
      this.container.register({
        token: "AppMigrations",
        useValue: this.migrations,
      });
    }
  }

  async boot(): Promise<void> {
    // Under the console (`VEAP_CLI=1`) migrations are an explicit action: the
    // `veap migrate` command runs them, and every other command — `list`
    // included — must leave the database untouched.
    if (process.env.VEAP_CLI === "1") return;

    let appMigrations: any[] | undefined = this.migrations;

    if (!appMigrations?.length) {
      if (this.container.has(APP_MIGRATIONS)) {
        appMigrations = await this.container.resolve<any[]>(APP_MIGRATIONS);
      } else if (this.container.has("AppMigrations")) {
        appMigrations = await this.container.resolve<any[]>("AppMigrations");
      }
    }

    if (appMigrations?.length) {
      await runMigrations("app", appMigrations);
    }
  }
}
