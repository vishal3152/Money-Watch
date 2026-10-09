import { defineConfig } from "drizzle-kit";

const databasePath = process.env.DATABASE_PATH;

if (!databasePath) {
  throw new Error("DATABASE_PATH is required.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath
  }
});
