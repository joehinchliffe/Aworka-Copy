import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://rounds:rounds@localhost:5432/rounds_dev";
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
await client.end();
console.log("migrated", url.replace(/:[^:@/]+@/, ":***@"));
