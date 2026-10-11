[![CI](https://github.com/veapjs/veap-database/actions/workflows/ci.yml/badge.svg)](https://github.com/veapjs/veap-database/actions/workflows/ci.yml)
[![Release](https://github.com/veapjs/veap-database/actions/workflows/release.yml/badge.svg)](https://github.com/veapjs/veap-database/actions/workflows/release.yml)

# @veap/database

Eloquent-inspired Active Record ORM powered by Knex with AsyncLocalStorage
transaction scoping and automatic migrations for PostgreSQL, MySQL, and SQLite.

## Overview

`@veap/database` brings expressive, developer-friendly Active Record modeling to
TypeScript. It combines the ergonomic query building of Laravel Eloquent with
the battle-tested reliability of Knex. With built-in `AsyncLocalStorage`
context propagation, database transactions flow seamlessly across function and
module boundaries without manual transaction object passing.

## Features

- **Active Record models**: Clean declarative models with timestamps, UUID
  primary keys, attribute casting (JSON, dates, booleans), and local scopes.
- **AsyncLocalStorage transactions**: Zero-boilerplate `transaction()` blocks
  that bind nested queries automatically to the current transaction.
- **Expressive relations**: Full relation graph support including `belongsTo`,
  `hasMany`, `hasOne`, `belongsToMany`, and polymorphic variants (`morphTo`,
  `morphMany`, `morphOne`, `morphToMany`).
- **Eager loading & query builder**: Fluid chainable queries with `.with()`,
  `.where()`, `.orderBy()`, `.paginate()`, and `.first()`.
- **Knex proxy & raw queries**: Direct access to Knex via `getKnex()` and the
  convenient dynamic proxy `dbClient`.
- **Migration & Schema runner**: Declarative `Schema` builder and automated
  migration runner supporting versioned schema updates.
- **IoC integration**: Ships with `DatabaseServiceProvider` and
  `MigrationServiceProvider` for modular Veap applications.

## Installation

```bash
# Using bun
bun add @veap/database better-sqlite3 # or pg / mysql2

# Using pnpm
pnpm add @veap/database better-sqlite3

# Using npm
npm install @veap/database better-sqlite3
```

## Usage

### Define Active Record Models

Create models extending the base `Model` class:

```ts
import { Model, belongsTo, hasMany } from "@veap/database";
import type { BelongsTo, HasMany } from "@veap/database";

export class Author extends Model {
  static override tableName = "authors";

  declare id: string;
  declare name: string;
  declare email: string;

  public posts(): HasMany<Post> {
    return hasMany(this, Post, "author_id");
  }
}

export class Post extends Model {
  static override tableName = "posts";

  declare id: string;
  declare title: string;
  declare content: string;
  declare author_id: string;

  public author(): BelongsTo<Author> {
    return belongsTo(this, Author, "author_id");
  }
}
```

### Querying and CRUD Operations

Perform common queries and persistence operations:

```ts
// Create
const author = await Author.create({
  name: "Ada Lovelace",
  email: "ada@example.com",
});

// Find and update
const post = await Post.query().where("slug", "first-post").first();
if (post) {
  post.title = "Updated Title";
  await post.save();
}

// Eager loading relations
const postsWithAuthors = await Post.query()
  .with("author")
  .where("status", "published")
  .orderBy("created_at", "desc")
  .get();
```

### Seamless Transactions with AsyncLocalStorage

Run operations inside a transaction without passing around connection objects:

```ts
import { transaction } from "@veap/database";

await transaction(async () => {
  const author = await Author.create({
    name: "Grace Hopper",
    email: "grace@example.com",
  });

  await Post.create({
    title: "Compilers and Nanoseconds",
    content: "...",
    author_id: author.id,
  });
  // If any error is thrown, the entire block rolls back automatically.
});
```

### Standalone Database Initialization

When using outside the Veap application builder:

```ts
import { initDatabase } from "@veap/database";

initDatabase({
  client: "better-sqlite3",
  connection: {
    filename: "./data/app.sqlite",
  },
  useNullAsDefault: true,
});
```

### IoC Service Provider Setup

When composing inside a Veap application:

```ts
import { Application } from "@veap/kernel";
import { DatabaseServiceProvider } from "@veap/database";

export const app = Application.configure()
  .use(DatabaseServiceProvider)
  .create();
```

## Subpath Exports

| Export Path      | Content                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `@veap/database` | Core ORM, Model, relations, transactions, schema builder, and providers |

## Documentation

For full guides and relational modeling patterns, visit:

- **Official Website**: [https://veap.pl](https://veap.pl)
- **Documentation**: [https://veap.pl/docs](https://veap.pl/docs)
- **GitHub Repository**: [https://github.com/veapjs/veap-database](https://github.com/veapjs/veap-database)

## License

MIT
