#!/bin/sh
# Apply database migrations, then start the server.
set -e
cd /app/apps/web
NODE_PATH=/app/node_modules_migrate node -e '
const { drizzle } = require("drizzle-orm/postgres-js");
const { migrate } = require("drizzle-orm/postgres-js/migrator");
const postgres = require("postgres");
const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
migrate(drizzle(client), { migrationsFolder: "drizzle" }).then(() => client.end()).then(() => console.log("migrations applied"));
'
exec node server.js
