import { createClient } from "@libsql/client";

let _db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("Missing Turso env vars: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.");
  }
  _db = createClient({ url, authToken });
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    const client = getDb();
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});
