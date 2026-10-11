export interface DatabaseEventDispatcher {
  publish(event: string, payload: any): Promise<void> | void;
}

let activeDispatcher: DatabaseEventDispatcher | null = null;

export function setDatabaseEventDispatcher(
  dispatcher: DatabaseEventDispatcher | null,
): void {
  activeDispatcher = dispatcher;
}

export function getDatabaseEventDispatcher(): DatabaseEventDispatcher | null {
  return activeDispatcher;
}
