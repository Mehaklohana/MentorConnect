/* Creates the mentorconnect database and loads db/schema.sql using the app's pg library.
   Works without psql client tools. Usage: node db-init.js */
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
    const base = process.env.DATABASE_URL;
    if (!base) throw new Error('DATABASE_URL is not set');
    const adminUrl = base.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

    // 1. Create the database if missing (connect to the maintenance db "postgres")
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'mentorconnect'`);
    if (exists.rowCount === 0) {
        await admin.query('CREATE DATABASE mentorconnect');
        console.log('Created database mentorconnect');
    } else {
        console.log('Database mentorconnect already exists');
    }
    await admin.end();

    // 2. Load schema (multiple statements via simple query protocol)
    const client = new Client({ connectionString: base });
    await client.connect();
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('Schema loaded');

    const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));
    await client.end();
    console.log('DB INIT COMPLETE');
}

main().then(() => process.exit(0)).catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
