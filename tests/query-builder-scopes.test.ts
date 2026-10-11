import type { Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initDatabase } from "../src/connection.js";
import { Model } from "../src/model.js";

class Article extends Model {
  static override table = "articles";
  static override softDeletes = true;
  static override fillable = ["title", "status", "category_id", "views"];

  declare title: string;
  declare status: string;
  declare category_id: string;
  declare views: number;
  declare deleted_at: any;

  category() {
    return this.belongsTo(Category, "category_id");
  }
}

class Category extends Model {
  static override table = "categories";
  static override fillable = ["name"];

  declare name: string;

  articles() {
    return this.hasMany(Article, "category_id");
  }
}

describe("QueryBuilder & Scopes & Pagination & Soft Deletes", () => {
  let db: Knex;

  beforeAll(async () => {
    db = initDatabase({
      client: "better-sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });

    await db.schema.createTable("categories", (table) => {
      table.text("id").primary();
      table.string("name").notNullable();
      table.timestamps(true, true);
    });

    await db.schema.createTable("articles", (table) => {
      table.text("id").primary();
      table.string("title").notNullable();
      table.string("status").defaultTo("draft");
      table.text("category_id").nullable();
      table.integer("views").defaultTo(0);
      table.timestamp("deleted_at").nullable();
      table.timestamps(true, true);
    });
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db("articles").delete();
    await db("categories").delete();
  });

  it("ModelQueryBuilder.update() applies soft-delete scope (does not update trashed rows)", async () => {
    const active1 = await Article.create({
      title: "Active 1",
      status: "draft",
    });
    const active2 = await Article.create({
      title: "Active 2",
      status: "draft",
    });
    const trashed = await Article.create({ title: "Trashed", status: "draft" });

    // Soft delete one article
    await trashed.delete();
    expect(trashed.trashed()).toBe(true);

    // Bulk update all draft articles
    const updatedCount = await Article.where("status", "draft").update({
      status: "published",
    });

    expect(updatedCount).toBe(2);

    const refreshedActive1 = await Article.find(active1.id);
    expect(refreshedActive1?.status).toBe("published");

    const refreshedActive2 = await Article.find(active2.id);
    expect(refreshedActive2?.status).toBe("published");

    // The trashed article must NOT have been updated!
    const refreshedTrashed = await Article.withTrashed().find(trashed.id);
    expect(refreshedTrashed?.status).toBe("draft");
  });

  it("paginate() returns both page and currentPage matching PaginationResult contract", async () => {
    for (let i = 1; i <= 25; i++) {
      await Article.create({ title: `Article ${i}`, status: "draft" });
    }

    const page1 = await Article.query().paginate(1, 10);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);
    expect(page1.currentPage).toBe(1);
    expect(page1.perPage).toBe(10);
    expect(page1.lastPage).toBe(3);
    expect(page1.data.length).toBe(10);

    const page3 = await Article.query().paginate(3, 10);
    expect(page3.page).toBe(3);
    expect(page3.currentPage).toBe(3);
    expect(page3.data.length).toBe(5);
  });

  it("delegates underlying Knex builder methods through Proxy (e.g. groupBy, having, distinct)", async () => {
    const cat1 = await Category.create({ name: "Tech" });
    const cat2 = await Category.create({ name: "News" });

    await Article.create({ title: "A1", category_id: cat1.id, views: 100 });
    await Article.create({ title: "A2", category_id: cat1.id, views: 200 });
    await Article.create({ title: "A3", category_id: cat2.id, views: 50 });

    // groupBy via ModelQueryBuilder proxy
    const grouped = await Article.query()
      .select("category_id")
      .groupBy("category_id")
      .get();

    expect(grouped.length).toBe(2);
    const categoryIds = grouped.map((g: Article) => g.category_id);
    expect(categoryIds).toContain(cat1.id);
    expect(categoryIds).toContain(cat2.id);
  });

  it("supports soft deletes restoration and onlyTrashed filtering", async () => {
    const article = await Article.create({
      title: "To Delete",
      status: "draft",
    });
    await article.delete();

    expect(await Article.where("id", article.id).first()).toBeNull();
    expect(
      await Article.onlyTrashed().where("id", article.id).first(),
    ).not.toBeNull();

    await article.restore();
    expect(await Article.where("id", article.id).first()).not.toBeNull();
    expect(
      await Article.onlyTrashed().where("id", article.id).first(),
    ).toBeNull();
  });
});
