const fs = require('fs');
const path = require('path');
const { shards } = require('../src/db');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'src', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const statements = sql
    .split(/;\s*(?:\n|$)/g)
    .map(s => s.trim())
    .filter(Boolean);

  for (const shard of shards) {
    console.log(`🔧 Migrating shard ${shard.index}...`);
    const client = await shard.pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of statements) {
        await client.query(stmt);
      }
      await client.query('COMMIT');
      console.log(`✅ Shard ${shard.index} migrated`);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error(`❌ Migration failed on shard ${shard.index}:`, e);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('✅ All shards migrated successfully');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});
