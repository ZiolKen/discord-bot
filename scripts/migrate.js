const fs = require("fs");
const path = require("path");
const db = require("../src/db");

async function main() {
  const schemaPath = path.join(__dirname, "..", "src", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  const statements = sql
    .split(/;\s*\n/g)
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await db.query(stmt);
  }

  console.log("✅ Schema migrated successfully");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
