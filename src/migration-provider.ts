import { ServiceProvider } from "@veap/kernel";
import { runMigrations } from "./migrations/runner.js";
import { APP_MIGRATIONS } from "./tokens.js";

export class MigrationServiceProvider extends ServiceProvider {
  private migrations?: any[];

  constructor(container: any, migrations?: any[]) {
    super(container);
    this.migrations = migrations;
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
