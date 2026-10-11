import { ServiceProvider } from "@veap/kernel";
import { runMigrations } from "./migrations/runner";

export class MigrationServiceProvider extends ServiceProvider {
  register(): void {
    // No bindings needed
  }

  async boot(): Promise<void> {
    if (this.container.has("AppMigrations")) {
      const appMigrations =
        await this.container.resolve<any[]>("AppMigrations");
      if (appMigrations?.length) {
        await runMigrations("app", appMigrations);
      }
    }
  }
}
