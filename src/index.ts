#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import mysql from "mysql2/promise";
import { z } from "zod";

// Parse CLI args or env vars
function getConfig() {
  const args = process.argv.slice(2);
  const get = (flag: string, env: string, def = "") => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : process.env[env] ?? def;
  };
  return {
    host: get("--db-host", "DORIS_HOST", "127.0.0.1"),
    port: parseInt(get("--db-port", "DORIS_PORT", "9030")),
    user: get("--db-user", "DORIS_USER", "root"),
    password: get("--db-password", "DORIS_PASSWORD", ""),
    database: get("--db-name", "DORIS_DATABASE", ""),
  };
}

const config = getConfig();

async function getConnection() {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || undefined,
    connectTimeout: 10000,
  });
}

// SHOW / DESCRIBE / EXPLAIN 等命令 Doris Nereids 优化器不支持，需要提前关闭
const NEREIDS_UNSUPPORTED = /^\s*(SHOW|DESCRIBE|DESC|EXPLAIN|ALTER|DROP|CREATE|ADMIN|RECOVER|TRUNCATE)\b/i;

async function query(sql: string, params?: (string | number | null)[], database?: string) {
  const conn = await getConnection();
  try {
    if (database) {
      await conn.query(`USE \`${database}\``);
    }
    // 对已知不兼容 Nereids 的命令，提前关闭优化器
    if (NEREIDS_UNSUPPORTED.test(sql)) {
      await conn.query("SET enable_nereids_planner=false");
    }
    // 有参数时用 execute (prepared statement)，无参数时用 query (text protocol)
    // Doris Nereids 在 prepared statement 阶段就会拒绝不支持的命令
    const [rows] = params ? await conn.execute(sql, params) : await conn.query(sql);
    return rows;
  } catch (err: any) {
    // 兜底：如果仍然遇到 Nereids 错误，关闭优化器后用 text protocol 重试
    const errInfo = JSON.stringify({ message: err?.message, sqlMessage: err?.sqlMessage, code: err?.code });
    if (errInfo.includes('MustFallbackException') || errInfo.includes('fallback')) {
      await conn.query("SET enable_nereids_planner=false");
      const [rows] = params ? await conn.execute(sql, params) : await conn.query(sql);
      return rows;
    }
    throw err;
  } finally {
    await conn.end();
  }
}

const server = new Server(
  { name: "doris-mcp-server", version: "1.0.3" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "exec_query",
      description: "Execute a read-only SQL query on Apache Doris",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to execute" },
          database: { type: "string", description: "Database to use (optional)" },
        },
        required: ["sql"],
      },
    },
    {
      name: "get_db_list",
      description: "List all databases in Doris",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_db_table_list",
      description: "List all tables in a database",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name" },
        },
        required: ["database"],
      },
    },
    {
      name: "get_table_schema",
      description: "Get the schema (columns) of a table",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name" },
          table: { type: "string", description: "Table name" },
        },
        required: ["database", "table"],
      },
    },
    {
      name: "get_table_comment",
      description: "Get table and column comments",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name" },
          table: { type: "string", description: "Table name" },
        },
        required: ["database", "table"],
      },
    },
    {
      name: "get_table_indexes",
      description: "Get indexes of a table",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name" },
          table: { type: "string", description: "Table name" },
        },
        required: ["database", "table"],
      },
    },
    {
      name: "get_table_partitions",
      description: "Get partition info of a table",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name" },
          table: { type: "string", description: "Table name" },
        },
        required: ["database", "table"],
      },
    },
    {
      name: "get_table_status",
      description: "Get table status including row count and size",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name" },
          table: { type: "string", description: "Table name (optional, lists all if omitted)" },
        },
        required: ["database"],
      },
    },
    {
      name: "explain_query",
      description: "Explain a SQL query execution plan",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to explain" },
          database: { type: "string", description: "Database to use (optional)" },
        },
        required: ["sql"],
      },
    },
    {
      name: "get_running_queries",
      description: "Get currently running queries in Doris",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_backends",
      description: "Get Doris backend node status",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let rows: unknown;

    switch (name) {
      case "exec_query": {
        const { sql, database } = z.object({ sql: z.string(), database: z.string().optional() }).parse(args);
        rows = await query(sql, undefined, database);
        break;
      }
      case "get_db_list":
        rows = await query("SELECT SCHEMA_NAME as db_name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME");
        break;
      case "get_db_table_list": {
        const { database } = z.object({ database: z.string() }).parse(args);
        rows = await query(
          "SELECT TABLE_NAME as `Table` FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
          [database]
        );
        break;
      }
      case "get_table_schema": {
        const { database, table } = z.object({ database: z.string(), table: z.string() }).parse(args);
        rows = await query(`DESCRIBE \`${database}\`.\`${table}\``);
        break;
      }
      case "get_table_comment": {
        const { database, table } = z.object({ database: z.string(), table: z.string() }).parse(args);
        rows = await query(
          `SELECT COLUMN_NAME, COLUMN_COMMENT, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [database, table]
        );
        break;
      }
      case "get_table_indexes": {
        const { database, table } = z.object({ database: z.string(), table: z.string() }).parse(args);
        rows = await query(
          `SELECT INDEX_NAME, COLUMN_NAME, INDEX_TYPE, NON_UNIQUE
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
          [database, table]
        );
        break;
      }
      case "get_table_partitions": {
        const { database, table } = z.object({ database: z.string(), table: z.string() }).parse(args);
        rows = await query(`SHOW PARTITIONS FROM \`${database}\`.\`${table}\``);
        break;
      }
      case "get_table_status": {
        const { database, table } = z.object({ database: z.string(), table: z.string().optional() }).parse(args);
        const sql = table
          ? `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, TABLE_COMMENT, CREATE_TIME
             FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`
          : `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, TABLE_COMMENT, CREATE_TIME
             FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`;
        rows = table ? await query(sql, [database, table]) : await query(sql, [database]);
        break;
      }
      case "explain_query": {
        const { sql, database } = z.object({ sql: z.string(), database: z.string().optional() }).parse(args);
        rows = await query(`EXPLAIN ${sql}`, undefined, database);
        break;
      }
      case "get_running_queries":
        rows = await query("SHOW PROC '/current_queries'");
        break;
      case "get_backends":
        rows = await query("SHOW BACKENDS");
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
