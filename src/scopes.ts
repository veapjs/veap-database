import type { Model } from "./model.js";
import type { ModelQueryBuilder } from "./query-builder.js";

/**
 * Callback function for applying a global scope.
 */
export type GlobalScopeCallback<M extends Model = any> = (
  builder: ModelQueryBuilder<M>,
  modelClass: any,
) => void;

/**
 * Interface for class-based global scopes.
 */
export interface Scope<M extends Model = any> {
  apply(builder: ModelQueryBuilder<M>, modelClass: any): void;
}

/**
 * Type representing either a callback or a Scope object.
 */
export type GlobalScope<M extends Model = any> =
  | GlobalScopeCallback<M>
  | Scope<M>;
