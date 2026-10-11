import { ApplicationBuilder, ServiceProvider } from "@veap/kernel";
import { MigrationServiceProvider } from "./migration-provider.js";
import { APP_MIGRATIONS } from "./tokens.js";

declare module "@veap/kernel" {
  interface ApplicationBuilder {
    /**
     * Registers host application migrations with IoC and configures MigrationServiceProvider.
     */
    withMigrations(migrations: any[]): this;
  }
}

class MigrationsConfigProvider extends ServiceProvider {
  private migrations: any[];

  constructor(container: any, migrations: any[] = []) {
    super(container);
    this.migrations = migrations;
  }

  register(): void {
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

if (!(ApplicationBuilder.prototype as any).withMigrations) {
  ApplicationBuilder.prototype.withMigrations = function (migrations: any[]) {
    return this.use((c) => new MigrationsConfigProvider(c, migrations)).use(
      MigrationServiceProvider,
    );
  };
}

export { MigrationsConfigProvider };
