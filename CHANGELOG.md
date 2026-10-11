# @veap/database

## 0.1.1

### Patch Changes

- Fix native Node.js ESM module resolution, global scopes in bulk updates, auto-increment primary keys, define DATABASE and APP_MIGRATIONS tokens, augment ApplicationBuilder with withMigrations, and add comprehensive ORM test coverage:
  
  - Define and export `DATABASE` (`Token<Knex>`) and `APP_MIGRATIONS` (`Token<any[]>`) IoC tokens within `@veap/database` (`src/tokens.ts`, `src/index.ts`), decoupling them from `@veap/kernel`.
  - Augment `ApplicationBuilder` from `@veap/kernel` via TypeScript Module Augmentation with `.withMigrations(migrations: any[])` and configure `MigrationsConfigProvider` and `MigrationServiceProvider`.
  - Update `MigrationServiceProvider` to register and resolve `APP_MIGRATIONS`.
  - Fix missing `.js` extensions across all relative module imports/exports in `dist/` ensuring full compliance with native Node.js ESM loaders (`ERR_MODULE_NOT_FOUND` resolution).
  - Add explicit subpath exports (`./migrations`, `./relations`) in `package.json`.
  - Fix `ModelQueryBuilder.update()` to apply `applyGlobalScopes()`, preventing unintentional updates to soft-deleted records or records outside multi-tenant global scopes.
  - Add support for auto-increment integer primary keys in `Model.prototype.save()` via `.returning(pk)`.
  - Prevent double JSON stringification in `casts.ts` when attributes are already formatted as JSON strings.
  - Align `ModelQueryBuilder.paginate()` with `PaginationResult` contract by returning both `page` and `currentPage`.
  - Enable transparent Knex QueryBuilder method delegation (`groupBy`, `having`, `distinct`, etc.) through `ModelQueryBuilder` proxy.
  - Scope PostgreSQL advisory transaction locks strictly to PostgreSQL clients, avoiding SQL syntax errors on SQLite and MySQL.
  - Implement `DatabaseServiceProvider.shutdown()` to properly destroy Knex connection pools on application/test teardown.
  - Automatically wire `EventDispatcher` and `LOGGER` in `DatabaseServiceProvider.boot()` when available in IoC container.
  - Add comprehensive test suites covering relations, eager loading, soft deletes, query builder delegation, safe casts, auto-increment keys, factories, and seeders (increasing test count from 34 to 48 passing tests).
- Updated dependencies []:
  - @veap/kernel@0.1.1

## 0.1.0

### Minor Changes

- Initial public scaffold of the Veap database.
