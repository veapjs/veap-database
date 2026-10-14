import type { Container } from "@veap/kernel";
import type { CommandInput } from "@veap/kernel/cli";
import { getKnex } from "../connection.js";
import { APP_MIGRATIONS } from "../tokens.js";

/**
 * Tokens a host application publishes its migration list under: the explicit
 * `APP_MIGRATIONS` symbol or the string alias used by older scaffolds.
 */
export const MIGRATION_TOKENS = [APP_MIGRATIONS, "AppMigrations"] as const;

/** Default scope every migration command operates on. */
export const DEFAULT_MIGRATION_SCOPE = "app";

/** The scope a migration command was asked for (`--scope`, default `app`). */
export function resolveScope(input: CommandInput): string {
  const scope = input.option("scope");
  return typeof scope === "string" && scope.trim() !== ""
    ? scope.trim()
    : DEFAULT_MIGRATION_SCOPE;
}

/**
 * The migration list the host application registered, if any.
 *
 * Read from the container, which is where `.withMigrations(appMigrations)` puts
 * it, so no command has to guess how a project declares its migrations.
 */
export async function resolveRegisteredMigrations(
  container: Container,
): Promise<any[]> {
  for (const token of MIGRATION_TOKENS) {
    if (!container.has(token)) continue;

    const migrations = await container.resolve<any>(token);
    if (Array.isArray(migrations) && migrations.length > 0) return migrations;
  }

  return [];
}

/** `true` when `DatabaseServiceProvider` booted and a Knex instance exists. */
export function hasDatabaseConnection(): boolean {
  try {
    return Boolean(getKnex());
  } catch {
    return false;
  }
}
