import { ConfigService, DATABASE, ServiceProvider } from "@veap/kernel";
import knex, { type Knex } from "knex";
import {
  initDatabase,
  isSqliteDatabase,
  resolvePostgresSslConfig,
  resolveSqliteFilename,
  setKnex,
} from "./connection";
import { debug } from "./logger";
import type { DatabaseConfig } from "./types";

export interface DatabaseProviderConfig {
  databaseUrl?: string;
  config?: DatabaseConfig;
}

export class DatabaseServiceProvider extends ServiceProvider {
  private config?: DatabaseProviderConfig;

  constructor(container: any, config?: DatabaseProviderConfig) {
    super(container);
    this.config = config;
  }

  register(): void {
    // Port token registration
  }

  async boot(): Promise<void> {
    const configService = await this.container.resolve(ConfigService);
    const databaseUrl =
      this.config?.databaseUrl ||
      configService.get("DATABASE_URL") ||
      process.env.DATABASE_URL ||
      process.env.DATABASE_FILE;

    const isProd =
      configService.get("NODE_ENV") === "production" ||
      process.env.NODE_ENV === "production";

    if (this.config?.config) {
      const instance = initDatabase(this.config.config);
      this.container.register({ token: DATABASE, useValue: instance });
      this.container.register({ token: "Knex", useValue: instance });
      return;
    }

    const resolvedUrl = databaseUrl || "dev.sqlite";
    const isSqlite = isSqliteDatabase(resolvedUrl);
    const client = isSqlite ? "better-sqlite3" : "pg";

    debug(
      "veap:database",
      `Auto-initializing Knex from DATABASE_URL with client: ${client}`,
    );

    const ssl = resolvePostgresSslConfig({
      databaseUrl: resolvedUrl,
      isProd,
      rejectUnauthorizedEnv: configService.get(
        "DATABASE_SSL_REJECT_UNAUTHORIZED",
      ),
      caCert: configService.get("DATABASE_SSL_CA"),
    });

    const instance = knex({
      client,
      connection: isSqlite
        ? { filename: resolveSqliteFilename(resolvedUrl) }
        : {
            connectionString: resolvedUrl,
            ssl,
          },
      useNullAsDefault: true,
    });

    setKnex(instance);

    this.container.register({
      token: DATABASE,
      useValue: instance,
    });
    this.container.register({
      token: "Knex",
      useValue: instance,
    });
  }
}
