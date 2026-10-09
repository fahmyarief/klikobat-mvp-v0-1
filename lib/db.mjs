import postgres from "postgres";

let client;

export function getDatabase() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) {
    client = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return client;
}
