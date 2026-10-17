import {
  ConfigService,
  EVENT_BUS,
  LOGGER,
  ServiceProvider,
} from "@veap/kernel";
import knex, { type Knex } from "knex";
import {
  getKnex,
  initDatabase,
  isSqliteDatabase,
  resolvePostgresSslConfig,
  resolveSqliteFilename,
  setKnex,
} from "./connection.js";
import { setDatabaseEventDispatcher } from "./events.js";
import { debug, setDatabaseLogger } from "./logger.js";
import { DATABASE } from "./tokens.js";
import type { DatabaseConfig } from "./types.js";

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
    let configService: any = null;
    if (this.container.has(ConfigService)) {
      configService = await this.container.resolve(ConfigService);
    } else if (this.container.has("ConfigService")) {
      configService = await this.container.resolve("ConfigService");
    }

    const databaseUrl =
      this.config?.databaseUrl ||
      configService?.get?.("DATABASE_URL") ||
      process.env.DATABASE_URL ||
      process.env.DATABASE_FILE;

    const isProd =
      configService?.get?.("NODE_ENV") === "production" ||
      process.env.NODE_ENV === "production";

    // Auto-wire EventDispatcher / EventBus if bound to container
    const eventBusToken = this.container.has(EVENT_BUS)
      ? EVENT_BUS
      : this.container.has("EventDispatcher")
        ? "EventDispatcher"
        : null;

    if (eventBusToken) {
      try {
        const dispatcher = (await this.container.resolve(eventBusToken)) as any;
        if (dispatcher && typeof dispatcher.publish === "function") {
          setDatabaseEventDispatcher(dispatcher);
        }
      } catch {
        // Continue without event dispatcher
      }
    }

    // Auto-wire Logger if bound to container
    const loggerToken = this.container.has(LOGGER)
      ? LOGGER
      : this.container.has("LOGGER")
        ? "LOGGER"
        : null;

    if (loggerToken) {
      try {
        const logger = (await this.container.resolve(loggerToken)) as any;
        if (logger && typeof logger.info === "function") {
          setDatabaseLogger({
            debug: (ch, msg, ...args) =>
              logger.debug
                ? logger.debug(`[${ch}] ${msg}`, ...args)
                : undefined,
            info: (ch, msg, ...args) => logger.info(`[${ch}] ${msg}`, ...args),
            warn: (ch, msg, ...args) =>
              logger.warn
                ? logger.warn(`[${ch}] ${msg}`, ...args)
                : console.warn(`[${ch}] ${msg}`, ...args),
            error: (ch, msg, ...args) =>
              logger.error
                ? logger.error(`[${ch}] ${msg}`, ...args)
                : console.error(`[${ch}] ${msg}`, ...args),
          });
        }
      } catch {
        // Continue with default logger
      }
    }

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
      rejectUnauthorizedEnv: configService?.get?.(
        "DATABASE_SSL_REJECT_UNAUTHORIZED",
      ),
      caCert: configService?.get?.("DATABASE_SSL_CA"),
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

  async shutdown(): Promise<void> {
    try {
      const k = getKnex();
      if (k && typeof k.destroy === "function") {
        await k.destroy();
      }
    } catch {
      // Ignore if not initialized
    }
  }
}
