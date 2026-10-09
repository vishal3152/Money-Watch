import { join } from "node:path";

export type DatabasePathEnv = {
  DATABASE_PATH?: string;
};

export function resolveDatabasePath(userDataPath: string, env: DatabasePathEnv = {}): string {
  if (env.DATABASE_PATH !== undefined && env.DATABASE_PATH.length > 0) {
    return env.DATABASE_PATH;
  }

  return join(userDataPath, "paisa-watch.db");
}
