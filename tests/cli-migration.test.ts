import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Application, container } from "@veap/kernel";
import { BufferedOutput, ConsoleApplication, commands } from "@veap/kernel/cli";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/composition.js";
import { getKnex, initDatabase } from "../src/connection.js";
import { generateMigration } from "../src/migrations/generator.js";
import type { Migration } from "../src/migrations/runner.js";
import type { Schema } from "../src/migrations/schema-builder.js";
import { DatabaseServiceProvider } from "../src/provider.js";

/**
 * `veap make:migration` and `veap migrate`, driven through the real console.
 *
 * The console is the interface a user actually types, so these tests go through
 * `ConsoleApplication` rather than calling `handle()` by hand: argv parsing, the
 * command registry, project-root resolution, provider boot and the guaranteed
 * shutdown are all part of what "the command works" means.
 *
 * Covered: command discovery through `MigrationServiceProvider.commands()`,
 * `make:migration` writing into the project it runs in (including `--dir` and
 * rejected names) and regenerating the migration index, `migrate` applying
 * pending migrations in a batch against a real sqlite file, its scope option,
 * its reporting for "nothing pending"/"no connection"/"no migrations", and the
 * boot guard that keeps the console from migrating behind a command's back.
 */

const createWidgets: Migration = {
  name: "20260101000000_create_widgets",
  async up(_db, schema: Schema) {
    await schema.createTable("widgets", (table) => {
      table.increments("id");
      table.text("label");
    });
  },
  async down(_db, schema: Schema) {
    await schema.dropTableIfExists("widgets");
  },
};

let root: string;
let databaseFile: string;

function applicationWith(
  migrations: Migration[],
  providers: "database" | "none" = "database",
) {
  const builder = Application.configure();
  if (providers === "database") builder.use(DatabaseServiceProvider);

  return builder.withMigrations(migrations).create();
}

function buildApplication(providers: "database" | "none" = "database") {
  return applicationWith([createWidgets], providers);
}

interface RunOptions {
  application?: ReturnType<typeof buildApplication>;
  shutdown?: boolean;
  /** Environment name the console resolves (a real run reads it from NODE_ENV). */
  env?: string;
  /** Pre-built output, so an answer can be queued before the run starts. */
  output?: BufferedOutput;
}

function run(argv: string[], options: RunOptions = {}) {
  const output = options.output ?? new BufferedOutput();

  return {
    output,
    code: new ConsoleApplication({
      root,
      argv,
      output,
      application: options.application ?? buildApplication(),
      env: options.env,
      // A test must not steal the working directory of the runner, and the
      // root is passed explicitly anyway.
      chdir: false,
      shutdown: options.shutdown ?? true,
    }).run(),
  };
}

function migrationsDir(): string {
  return path.join(root, "migrations");
}

/**
 * Opens a second connection to the file the command wrote to.
 *
 * The console shuts the application down — and therefore destroys the pool — on
 * the way out, so the run's own connection cannot be reused to inspect the
 * result.
 */
function inspect() {
  return initDatabase({
    client: "better-sqlite3",
    connection: { filename: databaseFile },
    useNullAsDefault: true,
  });
}

beforeEach(() => {
  const globals = globalThis as Record<string, unknown>;
  delete globals.__VEAP_BOOTSTRAPPED__;
  delete globals.__VEAP_BOOTSTRAPPING_PROMISE__;
  delete globals.__VEAP_KNEX__;
  globals.__VEAP_ACTIVE_PROVIDERS__ = [];

  container.reset();
  commands.clear();

  root = fs.mkdtempSync(path.join(os.tmpdir(), "veap-database-cli-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "database-cli-fixture" }),
    "utf-8",
  );

  databaseFile = path.join(root, "db.sqlite");
  process.env.DATABASE_URL = `sqlite:${databaseFile}`;
  delete process.env.VEAP_CLI;
});

afterEach(async () => {
  try {
    await getKnex().destroy();
  } catch {
    // No connection was opened by this test.
  }

  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.DATABASE_URL;
  delete process.env.VEAP_CLI;
  delete process.env.DEBUG;
});

describe("command registration", () => {
  it("publishes the whole migration cycle for the host application", async () => {
    const { code, output } = run(["list"]);

    await expect(code).resolves.toBe(0);
    expect(output.text()).toContain("make:migration");
    expect(output.text()).toContain("Create a new migration file");
    expect(output.text()).toContain("migrate");
    expect(output.text()).toContain("Run the pending application migrations");
    expect(output.text()).toContain("migrate:status");
    expect(output.text()).toContain("Show the status of the application");
    expect(output.text()).toContain("migrate:rollback");
    expect(output.text()).toContain("Roll back the last batch");
  });

  it("documents the options of every command", async () => {
    const make = run(["help", "make:migration"]);
    await expect(make.code).resolves.toBe(0);
    expect(make.output.text()).toContain(
      "veap make:migration <name> [--dir=path]",
    );

    const expected: Array<[string, string]> = [
      ["migrate", "veap migrate [--scope=app]"],
      ["migrate:status", "veap migrate:status [--scope=app]"],
      ["migrate:rollback", "veap migrate:rollback [--scope=app]"],
    ];

    for (const [command, usage] of expected) {
      const help = run(["help", command]);
      await expect(help.code).resolves.toBe(0);
      expect(help.output.text()).toContain(usage);
    }
  });
});

describe("make:migration", () => {
  it("creates a migration in the project it runs in and regenerates the index", async () => {
    const { code, output } = run(["make:migration", "create_posts_table"]);

    await expect(code).resolves.toBe(0);

    const created = fs
      .readdirSync(migrationsDir())
      .find((file) => file.endsWith("_create_posts_table.ts"));
    expect(created).toBeDefined();

    // The scaffolded body targets the table derived from the name, and the
    // migration carries the timestamped name the runner will record.
    const content = fs.readFileSync(
      path.join(migrationsDir(), created as string),
      "utf-8",
    );
    expect(content).toContain('createTable("posts"');
    expect(content).toContain(`name: "${created?.replace(/\.ts$/, "")}"`);

    const index = fs.readFileSync(
      path.join(migrationsDir(), "index.ts"),
      "utf-8",
    );
    expect(index).toContain("export const appMigrations");
    expect(index).toContain(created?.replace(/\.ts$/, "") as string);

    expect(output.find("success")).toEqual([
      `Created migration: ${path.join("migrations", created as string)}`,
    ]);
    expect(output.text()).toContain('Run "veap migrate"');
  });

  it("keeps hand-written named-export migrations in the regenerated index", async () => {
    fs.mkdirSync(migrationsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(migrationsDir(), "20260101_create_articles.ts"),
      [
        'import type { Schema } from "@veap/database";',
        "",
        'export const name = "20260101_create_articles";',
        "export async function up(_db: any, _schema: Schema) {}",
        "export async function down(_db: any, _schema: Schema) {}",
        "",
      ].join("\n"),
      "utf-8",
    );

    const { code } = run(["make:migration", "create_posts_table"]);
    await expect(code).resolves.toBe(0);

    // A migration module imports either as a default object or as named
    // exports; the index has to unwrap `default` for both, otherwise a project
    // with hand-written migrations would end up with `appMigrations = [undefined]`.
    const index = fs.readFileSync(
      path.join(migrationsDir(), "index.ts"),
      "utf-8",
    );
    expect(index).toContain("import * as m20260101_create_articlesRaw from");
    expect(index).toContain(".default ?? m20260101_create_articlesRaw");
    expect(index).toContain("m20260101_create_articles,");
    expect(index).toContain("_create_posts_table");
  });

  it("writes into the directory given with --dir", async () => {
    const { code, output } = run([
      "make:migration",
      "create_pages_table",
      "--dir=db/migrations",
    ]);

    await expect(code).resolves.toBe(0);
    expect(fs.existsSync(path.join(root, "db", "migrations", "index.ts"))).toBe(
      true,
    );
    expect(
      fs
        .readdirSync(path.join(root, "db", "migrations"))
        .some((file) => file.endsWith("_create_pages_table.ts")),
    ).toBe(true);
    expect(output.find("success")[0]).toContain(path.join("db", "migrations"));
  });

  it("rejects a name that is not a plain identifier", async () => {
    const { code, output } = run(["make:migration", "../evil"]);

    await expect(code).resolves.toBe(1);
    expect(output.find("error").join("\n")).toContain(
      "may only contain letters, digits and underscores",
    );
    expect(fs.existsSync(path.join(root, "..", "evil.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "evil.ts"))).toBe(false);
  });

  it("refuses to overwrite a migration created in the same second", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));

      const first = await generateMigration(
        "create_posts_table",
        migrationsDir(),
      );
      expect(first.fileName).toBe("20260102030405_create_posts_table");

      await expect(
        generateMigration("create_posts_table", migrationsDir()),
      ).rejects.toThrow(/already exists/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("migrate", () => {
  it("applies the registered migrations and records the batch", async () => {
    const { code, output } = run(["migrate"]);

    await expect(code).resolves.toBe(0);
    expect(output.find("success")).toEqual([
      "Migrated: 20260101000000_create_widgets",
    ]);
    expect(output.find("info").join("\n")).toContain('batch 1 (scope "app")');

    const db = inspect();
    expect(await db.schema.hasTable("widgets")).toBe(true);

    const recorded = await db("migrations").select("name", "scope", "batch");
    expect(recorded).toEqual([
      { name: "20260101000000_create_widgets", scope: "app", batch: 1 },
    ]);
  });

  it("reports that there is nothing pending on a second run", async () => {
    const first = run(["migrate"]);
    await expect(first.code).resolves.toBe(0);

    const second = run(["migrate"]);
    await expect(second.code).resolves.toBe(0);
    expect(second.output.find("success")).toEqual([]);
    expect(second.output.find("info")).toEqual([
      'Nothing to migrate for scope "app".',
    ]);
  });

  it("runs the migrations under the scope given with --scope", async () => {
    const { code, output } = run(["migrate", "--scope", "plugin"]);

    await expect(code).resolves.toBe(0);
    expect(output.find("info").join("\n")).toContain('scope "plugin"');

    const recorded = await inspect()("migrations").select("name", "scope");
    expect(recorded).toEqual([
      { name: "20260101000000_create_widgets", scope: "plugin" },
    ]);
  });

  it("fails when no database connection is available", async () => {
    const { code, output } = run(["migrate"], {
      application: buildApplication("none"),
    });

    await expect(code).resolves.toBe(1);
    expect(output.find("error").join("\n")).toContain(
      "No database connection is available",
    );
    expect(fs.existsSync(databaseFile)).toBe(false);
  });

  it("warns when the application registers no migrations", async () => {
    const application = Application.configure()
      .use(DatabaseServiceProvider)
      .withMigrations([])
      .create();

    const { code, output } = run(["migrate"], { application });

    await expect(code).resolves.toBe(0);
    expect(output.find("warn").join("\n")).toContain(
      "No application migrations are registered",
    );
  });
});

describe("migrate:status", () => {
  it("reports the registered migration as pending before it runs", async () => {
    const { code, output } = run(["migrate:status"]);

    await expect(code).resolves.toBe(0);
    expect(output.text()).toContain("Migration");
    expect(output.text()).toContain("Status");
    expect(output.lines).toContainEqual(
      expect.stringContaining("20260101000000_create_widgets"),
    );
    expect(output.text()).toContain("Pending");
    expect(output.find("info").join("\n")).toContain(
      '0 ran, 1 pending (scope "app")',
    );
  });

  it("reports the batch and the run time once it ran", async () => {
    await expect(run(["migrate"]).code).resolves.toBe(0);

    const { code, output } = run(["migrate:status"]);

    await expect(code).resolves.toBe(0);
    expect(
      output.lines.some(
        (line) =>
          line.includes("20260101000000_create_widgets") &&
          line.includes("Ran") &&
          line.includes("1"),
      ),
    ).toBe(true);
    expect(output.text()).not.toContain("Pending");
    expect(output.find("info").join("\n")).toContain(
      '1 ran, 0 pending (scope "app")',
    );
  });

  it("treats every migration as pending for a scope that never ran", async () => {
    await expect(run(["migrate"]).code).resolves.toBe(0);

    const { code, output } = run(["migrate:status", "--scope", "plugin"]);

    await expect(code).resolves.toBe(0);
    expect(output.find("info").join("\n")).toContain(
      '0 ran, 1 pending (scope "plugin")',
    );
  });

  it("warns about recorded migrations the application no longer declares", async () => {
    await expect(run(["migrate"]).code).resolves.toBe(0);

    const db = inspect();
    await db("migrations").insert({
      id: "orphan-row",
      name: "20250101000000_create_removed",
      scope: "app",
      batch: 1,
      executed_at: new Date(),
    });
    await db.destroy();

    const { code, output } = run(["migrate:status"]);

    await expect(code).resolves.toBe(0);
    expect(output.find("warn").join("\n")).toContain(
      "20250101000000_create_removed",
    );
  });
});

describe("migrate:rollback", () => {
  it("closes the cycle: rollback undoes the batch and migrate re-applies it", async () => {
    await expect(run(["migrate"]).code).resolves.toBe(0);

    const rollback = run(["migrate:rollback"]);

    await expect(rollback.code).resolves.toBe(0);
    expect(rollback.output.find("success")).toEqual([
      "Rolled back: 20260101000000_create_widgets",
    ]);

    const db = inspect();
    expect(await db.schema.hasTable("widgets")).toBe(false);
    expect(await db("migrations").select("name")).toEqual([]);
    await db.destroy();

    const again = run(["migrate"]);
    await expect(again.code).resolves.toBe(0);
    expect(again.output.find("success")).toEqual([
      "Migrated: 20260101000000_create_widgets",
    ]);
  });

  it("reports that there is nothing to roll back", async () => {
    const { code, output } = run(["migrate:rollback"]);

    await expect(code).resolves.toBe(0);
    expect(output.find("success")).toEqual([]);
    expect(output.find("info")).toEqual([
      'Nothing to roll back for scope "app".',
    ]);
  });

  it("accepts --force after the command name", async () => {
    const { code, output } = run(["migrate:rollback", "--force"]);

    await expect(code).resolves.toBe(0);
    expect(output.find("info")).toEqual([
      'Nothing to roll back for scope "app".',
    ]);
  });

  it("undoes a batch in the reverse of the applied order", async () => {
    const trace: string[] = [];
    const alpha: Migration = {
      name: "20260101000001_create_alpha",
      async up() {
        trace.push("alpha:up");
      },
      async down() {
        trace.push("alpha:down");
      },
    };
    const beta: Migration = {
      name: "20260101000002_create_beta",
      async up() {
        trace.push("beta:up");
      },
      async down() {
        trace.push("beta:down");
      },
    };
    const application = applicationWith([alpha, beta]);

    await expect(run(["migrate"], { application }).code).resolves.toBe(0);
    expect(trace).toEqual(["alpha:up", "beta:up"]);

    // Both migrations run in the same batch, so pin the recorded run times:
    // the rollback order has to come from them, not from the row order.
    const db = inspect();
    await db("migrations")
      .where("name", alpha.name)
      .update({ executed_at: "2026-01-01T00:00:01.000Z" });
    await db("migrations")
      .where("name", beta.name)
      .update({ executed_at: "2026-01-01T00:00:02.000Z" });
    await db.destroy();

    const rollback = run(["migrate:rollback"], { application });

    await expect(rollback.code).resolves.toBe(0);
    expect(rollback.output.find("success")).toEqual([
      `Rolled back: ${beta.name}`,
      `Rolled back: ${alpha.name}`,
    ]);
    expect(trace).toEqual(["alpha:up", "beta:up", "beta:down", "alpha:down"]);
  });
});

describe("unattended runs", () => {
  it("asks in production and honours a refusal", async () => {
    const output = new BufferedOutput();
    output.queueAnswer("n");

    const run1 = run(["migrate"], { env: "production", output });

    await expect(run1.code).resolves.toBe(1);
    expect(output.find("warn")).toContain("Cancelled.");
    expect(await inspect().schema.hasTable("widgets")).toBe(false);
  });

  it("asks in production and runs after a confirmation", async () => {
    const output = new BufferedOutput();
    output.queueAnswer("y");

    const run1 = run(["migrate"], { env: "production", output });

    await expect(run1.code).resolves.toBe(0);
    expect(output.find("success")).toEqual([
      "Migrated: 20260101000000_create_widgets",
    ]);
  });

  it("does not prompt at all outside production", async () => {
    // No queued answer: prompting BufferedOutput would throw.
    const output = new BufferedOutput();

    const run1 = run(["migrate"], { output });

    await expect(run1.code).resolves.toBe(0);
    expect(output.find("success")).toEqual([
      "Migrated: 20260101000000_create_widgets",
    ]);
  });

  it("aborts instead of hanging under --no-interaction without --force", async () => {
    const output = new BufferedOutput();

    const run1 = run(["--no-interaction", "migrate"], {
      env: "production",
      output,
    });

    await expect(run1.code).resolves.toBe(1);
    expect(output.find("warn")).toContain("Cancelled.");
    expect(await inspect().schema.hasTable("widgets")).toBe(false);
  });

  it("closes the cycle in production when --force says yes", async () => {
    await expect(run(["migrate"]).code).resolves.toBe(0);

    // No queued answer: --force must bypass the confirmation entirely.
    const forced = run(["--force", "migrate:rollback"], {
      env: "production",
    });

    await expect(forced.code).resolves.toBe(0);
    expect(forced.output.find("success")).toEqual([
      "Rolled back: 20260101000000_create_widgets",
    ]);
    expect(await inspect().schema.hasTable("widgets")).toBe(false);
  });
});

describe("boot guard", () => {
  it("does not migrate behind another command", async () => {
    // `shutdown: false` keeps the connection alive to inspect it below; the
    // console never migrates just because an application booted.
    const { code } = run(["list"], { shutdown: false });

    await expect(code).resolves.toBe(0);
    expect(await getKnex().schema.hasTable("widgets")).toBe(false);
  });

  it("still migrates during a normal application bootstrap", async () => {
    const application = buildApplication();

    await application.bootstrap();

    expect(await getKnex().schema.hasTable("widgets")).toBe(true);

    await application.shutdown();
  });
});
