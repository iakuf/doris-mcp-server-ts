import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "1.12.239.236", port: 9030,
  user: "cdn_worker", password: "GN5ZuMlUFrbmcHWn",
  connectionLimit: 2, connectTimeout: 10000,
});

async function q(label, sql, params) {
  const [rows] = params ? await pool.execute(sql, params) : await pool.query(sql);
  console.log(`[OK] ${label}: ${JSON.stringify(rows).slice(0, 150)}`);
}

try {
  await q("get_catalog_list",        "SHOW CATALOGS");
  await q("get_db_list",             "SHOW DATABASES FROM `internal`");
  await q("get_db_table_list",       "SHOW TABLES FROM `internal`.`cdn_analytics`");
  await q("get_table_schema",        "DESCRIBE `internal`.`cdn_analytics`.`bandwidth_stats`");
  await q("get_table_comment",       "SELECT TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", ["cdn_analytics", "bandwidth_stats"]);
  await q("get_table_column_comments","SELECT COLUMN_NAME, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION", ["cdn_analytics", "bandwidth_stats"]);
  await q("get_table_indexes",       "SHOW INDEX FROM `cdn_analytics`.`bandwidth_stats`");
  await q("get_table_data_size",     "SELECT TABLE_NAME, DATA_LENGTH, INDEX_LENGTH, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", ["cdn_analytics", "bandwidth_stats"]);
  await q("exec_query",              "SELECT * FROM (SELECT COUNT(*) as cnt FROM cdn_analytics.bandwidth_stats) __t LIMIT 200");
  await q("get_sql_explain",         "EXPLAIN SELECT domain FROM cdn_analytics.bandwidth_stats LIMIT 1");

  console.log("\nALL 10 TOOLS PASSED");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
