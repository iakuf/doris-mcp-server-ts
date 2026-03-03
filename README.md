# doris-mcp-server

Apache Doris MCP Server implemented in TypeScript.

Connects to Apache Doris via the MySQL-compatible protocol (port 9030) and exposes the same tool interface as the official [apache/doris-mcp-server](https://github.com/apache/doris-mcp-server), with zero Python dependencies.

## Requirements

- Node.js >= 18
- Apache Doris (any version with MySQL protocol enabled, default port 9030)

## Installation

```bash
npm install -g doris-mcp-server
```

## Usage

### Stdio mode (for MCP clients like Cursor, Kiro, Claude Desktop)

```bash
doris-mcp-server \
  --db-host 127.0.0.1 \
  --db-port 9030 \
  --db-user root \
  --db-password your_password
```

### Environment variables

```bash
export DORIS_HOST=127.0.0.1
export DORIS_PORT=9030
export DORIS_USER=root
export DORIS_PASSWORD=your_password
export DORIS_DATABASE=information_schema

doris-mcp-server
```

### MCP client configuration (Kiro / Cursor)

```json
{
  "mcpServers": {
    "doris": {
      "command": "doris-mcp-server",
      "args": [
        "--db-host", "127.0.0.1",
        "--db-port", "9030",
        "--db-user", "root",
        "--db-password", "your_password"
      ]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `exec_query` | Execute a SQL query and return results as JSON |
| `get_catalog_list` | List all catalogs |
| `get_db_list` | List all databases |
| `get_db_table_list` | List all tables in a database |
| `get_table_schema` | Get column definitions for a table |
| `get_table_comment` | Get the table-level comment |
| `get_table_column_comments` | Get comments for all columns in a table |
| `get_table_indexes` | Get index information for a table |
| `get_recent_audit_logs` | Query recent audit log records |
| `get_sql_explain` | Get the execution plan for a SQL query |
| `get_table_data_size` | Get data size information for a table or database |

All metadata tools support optional `db_name` and `catalog_name` parameters for multi-catalog environments.

## Command Line Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--db-host` | Doris FE host | `127.0.0.1` |
| `--db-port` | Doris MySQL port | `9030` |
| `--db-user` | Database username | `root` |
| `--db-password` | Database password | _(empty)_ |
| `--db-database` | Default database | `information_schema` |

## Comparison with official Python server

| Feature | This package | apache/doris-mcp-server |
|---------|-------------|------------------------|
| Language | TypeScript / Node.js | Python |
| Transport | stdio | stdio + HTTP |
| Core query tools | All 11 | All 11+ |
| Advanced analytics | No | Yes (7 tools) |
| ADBC / Arrow Flight | No | Yes |
| Zero extra runtime | Yes (Node.js only) | No (Python 3.12+) |

## License

Apache 2.0
