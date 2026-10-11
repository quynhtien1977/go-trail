import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
for (const key of ["DIRECT_URL", "DATABASE_URL"]) {
  const value = process.env[key]?.trim();
  if (!value) {
    console.error(`${key}: missing`);
    process.exitCode = 1;
    continue;
  }
  const client = new pg.Client({ connectionString: value, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_database() AS database, current_user AS role, count(*)::int AS tables FROM pg_tables WHERE schemaname = 'public'");
    console.log(`${key}: connected; database=${rows[0].database}; public tables=${rows[0].tables}`);
  } catch (error) {
    console.error(`${key}: connection failed (${error.code || error.name}); details suppressed`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
