import type { Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initDatabase } from "../src/connection.js";
import { Model } from "../src/model.js";
import { MorphMap } from "../src/relations/morph-map.js";

class User extends Model {
  static override table = "users";
  static override fillable = ["name", "email"];

  declare name: string;
  declare email: string;
  declare posts_count?: number;

  profile() {
    return this.hasOne(Profile, "user_id");
  }

  posts() {
    return this.hasMany(Post, "author_id");
  }

  roles() {
    return this.belongsToMany(Role, "user_roles", "user_id", "role_id");
  }
}

class Profile extends Model {
  static override table = "profiles";
  static override fillable = ["user_id", "bio"];

  declare user_id: string;
  declare bio: string;

  user() {
    return this.belongsTo(User, "user_id");
  }
}

class Role extends Model {
  static override table = "roles";
  static override fillable = ["name"];

  declare name: string;

  users() {
    return this.belongsToMany(User, "user_roles", "role_id", "user_id");
  }
}

class Post extends Model {
  static override table = "posts";
  static override fillable = ["author_id", "title"];

  declare author_id: string;
  declare title: string;

  author() {
    return this.belongsTo(User, "author_id");
  }

  comments() {
    return this.morphMany(Comment, "commentable");
  }
}

class Comment extends Model {
  static override table = "comments";
  static override fillable = ["commentable_id", "commentable_type", "content"];

  declare commentable_id: string;
  declare commentable_type: string;
  declare content: string;

  commentable() {
    return this.morphTo("commentable");
  }
}

describe("Relations & Eager Loading & Polymorphism", () => {
  let db: Knex;

  beforeAll(async () => {
    db = initDatabase({
      client: "better-sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });

    MorphMap.register({
      post: Post,
      user: User,
    });

    await db.schema.createTable("users", (t) => {
      t.text("id").primary();
      t.string("name").notNullable();
      t.string("email").notNullable();
      t.timestamps(true, true);
    });

    await db.schema.createTable("profiles", (t) => {
      t.text("id").primary();
      t.text("user_id").notNullable();
      t.text("bio").nullable();
      t.timestamps(true, true);
    });

    await db.schema.createTable("roles", (t) => {
      t.text("id").primary();
      t.string("name").notNullable();
      t.timestamps(true, true);
    });

    await db.schema.createTable("user_roles", (t) => {
      t.text("user_id").notNullable();
      t.text("role_id").notNullable();
    });

    await db.schema.createTable("posts", (t) => {
      t.text("id").primary();
      t.text("author_id").notNullable();
      t.string("title").notNullable();
      t.timestamps(true, true);
    });

    await db.schema.createTable("comments", (t) => {
      t.text("id").primary();
      t.text("commentable_id").notNullable();
      t.string("commentable_type").notNullable();
      t.text("content").notNullable();
      t.timestamps(true, true);
    });
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db("comments").delete();
    await db("posts").delete();
    await db("user_roles").delete();
    await db("roles").delete();
    await db("profiles").delete();
    await db("users").delete();
  });

  it("handles HasOne and BelongsTo relations", async () => {
    const user = await User.create({ name: "Bob", email: "bob@test.com" });
    const profile = await Profile.create({
      user_id: user.id,
      bio: "Software Engineer",
    });

    const userProfile = await user.profile().get();
    expect(userProfile).not.toBeNull();
    expect(userProfile?.bio).toBe("Software Engineer");

    const profileUser = await profile.user().get();
    expect(profileUser).not.toBeNull();
    expect(profileUser?.name).toBe("Bob");
  });

  it("handles HasMany and eager loading (.with)", async () => {
    const u1 = await User.create({ name: "Alice", email: "alice@test.com" });
    const u2 = await User.create({
      name: "Charlie",
      email: "charlie@test.com",
    });

    await Post.create({ author_id: u1.id, title: "Post 1" });
    await Post.create({ author_id: u1.id, title: "Post 2" });
    await Post.create({ author_id: u2.id, title: "Post 3" });

    const usersWithPosts = await User.query().with("posts").get();
    expect(usersWithPosts.length).toBe(2);

    const alice = usersWithPosts.find((u) => u.name === "Alice");
    expect(alice).toBeDefined();
    expect(alice?.posts?.length).toBe(2);

    const charlie = usersWithPosts.find((u) => u.name === "Charlie");
    expect(charlie).toBeDefined();
    expect(charlie?.posts?.length).toBe(1);
  });

  it("handles BelongsToMany relations with attach and detach", async () => {
    const user = await User.create({
      name: "Admin User",
      email: "admin@test.com",
    });
    const role1 = await Role.create({ name: "admin" });
    const role2 = await Role.create({ name: "editor" });

    await user.roles().attach(role1.id);
    await user.roles().attach(role2.id);

    const loadedRoles = await user.roles().get();
    expect(loadedRoles.length).toBe(2);

    await user.roles().detach(role2.id);
    const remainingRoles = await user.roles().get();
    expect(remainingRoles.length).toBe(1);
    expect(remainingRoles[0]?.name).toBe("admin");
  });

  it("handles polymorphic MorphMany and MorphTo relations", async () => {
    const user = await User.create({
      name: "Writer",
      email: "writer@test.com",
    });
    const post = await Post.create({ author_id: user.id, title: "Morph Post" });

    const comment = await post.comments().create({
      content: "Great post!",
    });

    expect(comment.id).toBeDefined();
    expect(comment.commentable_type).toBe("post");
    expect(comment.commentable_id).toBe(post.id);

    const loadedComments = await post.comments().get();
    expect(loadedComments.length).toBe(1);
    expect(loadedComments[0]?.content).toBe("Great post!");

    const parentPost = await comment.commentable().get();
    expect(parentPost).not.toBeNull();
    expect(parentPost?.title).toBe("Morph Post");
  });

  it("supports withCount subquery counts", async () => {
    const u1 = await User.create({ name: "Popular", email: "pop@test.com" });
    await Post.create({ author_id: u1.id, title: "P1" });
    await Post.create({ author_id: u1.id, title: "P2" });
    await Post.create({ author_id: u1.id, title: "P3" });

    const userWithCount = await User.query()
      .where("id", u1.id)
      .withCount("posts")
      .first();

    expect(userWithCount).not.toBeNull();
    expect(userWithCount?.posts_count).toBe(3);
  });
});
