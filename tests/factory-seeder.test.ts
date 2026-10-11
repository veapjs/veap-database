import type { Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initDatabase } from "../src/connection.js";
import { defineFactory } from "../src/factory.js";
import { Model } from "../src/model.js";
import { runSeeders, Seeder } from "../src/seeder.js";

class Customer extends Model {
  static override table = "customers";
  static override fillable = ["name", "email", "status"];

  declare name: string;
  declare email: string;
  declare status: string;
}

const CustomerFactory = defineFactory(Customer, () => ({
  name: "Default Name",
  email: `test_${Math.random()}@example.com`,
  status: "active",
}));

class CustomerSeeder extends Seeder {
  async run(): Promise<void> {
    await Customer.create({
      name: "Seeded 1",
      email: "seed1@example.com",
      status: "active",
    });
    await Customer.create({
      name: "Seeded 2",
      email: "seed2@example.com",
      status: "inactive",
    });
  }
}

describe("Factory & Seeder", () => {
  let db: Knex;

  beforeAll(async () => {
    db = initDatabase({
      client: "better-sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });

    await db.schema.createTable("customers", (t) => {
      t.text("id").primary();
      t.string("name").notNullable();
      t.string("email").notNullable();
      t.string("status").defaultTo("active");
      t.timestamps(true, true);
    });
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db("customers").delete();
  });

  it("creates models via defineFactory with count, state, and sequence", async () => {
    const factory = CustomerFactory.count(3)
      .sequence({ status: "gold" }, { status: "silver" }, { status: "bronze" })
      .state({ name: "VIP Customer" });

    const customers = (await factory.create()) as Customer[];
    expect(customers.length).toBe(3);

    expect(customers[0]?.name).toBe("VIP Customer");
    expect(customers[0]?.status).toBe("gold");
    expect(customers[0]?.id).toBeDefined();

    expect(customers[1]?.status).toBe("silver");
    expect(customers[2]?.status).toBe("bronze");

    const countInDb = await Customer.query().count();
    expect(countInDb).toBe(3);
  });

  it("runs database seeders via runSeeders", async () => {
    await runSeeders(CustomerSeeder, { inTransaction: true });

    const count = await Customer.query().count();
    expect(count).toBe(2);

    const seeded = await Customer.where("email", "seed1@example.com").first();
    expect(seeded?.name).toBe("Seeded 1");
  });
});
