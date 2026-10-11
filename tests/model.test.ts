import type { Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initDatabase, transaction } from "../src/connection";
import { Model } from "../src/model";

class User extends Model {
  static override table = "users";
  static override fillable = ["name", "email", "role"];
}

class Post extends Model {
  static override table = "posts";
  static override fillable = ["user_id", "title", "content"];

  user() {
    return this.belongsTo(User, "user_id");
  }
}

describe("Active Record Model (Standalone @veap/database)", () => {
  let db: Knex;

  beforeAll(async () => {
    db = initDatabase({
      client: "better-sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });

    await db.schema.createTable("users", (table) => {
      table.text("id").primary();
      table.string("name").notNullable();
      table.string("email").notNullable().unique();
      table.string("role").defaultTo("user");
      table.timestamps(true, true);
    });

    await db.schema.createTable("posts", (table) => {
      table.text("id").primary();
      table.text("user_id").notNullable();
      table.string("title").notNullable();
      table.text("content").nullable();
      table.timestamps(true, true);
    });
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db("posts").delete();
    await db("users").delete();
  });

  it("creates and retrieves model instances", async () => {
    const user = await User.create({
      name: "Alice",
      email: "alice@example.com",
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");

    const found = await User.find(user.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Alice");
  });

  it("updates and deletes model instances", async () => {
    const user = await User.create({
      name: "Bob",
      email: "bob@example.com",
    });

    await user.update({ name: "Robert" });
    const updated = await User.find(user.id);
    expect(updated?.name).toBe("Robert");

    await user.delete();
    const deleted = await User.find(user.id);
    expect(deleted).toBeNull();
  });

  it("supports query builder methods (.where, .first, .count)", async () => {
    await User.create({ name: "User 1", email: "u1@test.com", role: "admin" });
    await User.create({ name: "User 2", email: "u2@test.com", role: "user" });
    await User.create({ name: "User 3", email: "u3@test.com", role: "admin" });

    const admins = await User.where("role", "admin").get();
    expect(admins.length).toBe(2);

    const firstAdmin = await User.where("role", "admin").first();
    expect(firstAdmin?.name).toBe("User 1");

    const count = await User.where("role", "admin").count();
    expect(count).toBe(2);
  });

  it("handles transactions with Model operations and rollback", async () => {
    try {
      await transaction(async () => {
        await User.create({
          name: "Rollback User",
          email: "rollback@test.com",
        });
        throw new Error("Intentional rollback");
      });
    } catch {
      // ignore
    }

    const count = await User.where("email", "rollback@test.com").count();
    expect(count).toBe(0);
  });
});
