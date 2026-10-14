import path from "node:path";
import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { generateMigration } from "../../migrations/generator.js";

/**
 * `veap make:migration {name}` — scaffolds a migration in the host project.
 *
 * The file lands in the project the console was started in (by default
 * `<project>/migrations`) and the directory's `index.ts` is regenerated, so the
 * new migration is picked up by `.withMigrations(appMigrations)`.
 */
export class MakeMigrationCommand extends Command {
  static signature =
    "make:migration {name : Name of the migration, e.g. create_posts_table} {--dir=path : Directory relative to the project root (default: migrations)}";
  static description = "Create a new migration file in the application";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const name = input.argument("name") ?? "";
    const dir = input.option("dir");

    const directory = path.resolve(
      this.context.root,
      typeof dir === "string" && dir.trim() !== "" ? dir.trim() : "migrations",
    );

    const { filePath } = await generateMigration(name, directory);
    const relative = path.relative(this.context.root, filePath);

    output.success(`Created migration: ${relative}`);
    output.info('Run "veap migrate" to apply the pending migrations.');

    return 0;
  }
}
