import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalQuery } from "../db.js";

export function registerListTables(server: McpServer): void {
  server.tool(
    "list_tables",
    "List all tables in the flash-scanner PostgreSQL database with estimated row counts and sizes.",
    { schema: z.string().optional().default("public").describe("Schema to list tables from") },
    async ({ schema }) => {
      const result = await internalQuery(
        `SELECT
           t.tablename AS table_name,
           c.reltuples::bigint AS estimated_rows,
           pg_size_pretty(pg_total_relation_size(quote_ident(t.tablename))) AS total_size
         FROM pg_tables t
         JOIN pg_class c ON c.relname = t.tablename
         WHERE t.schemaname = $1
         ORDER BY c.reltuples DESC`,
        [schema]
      );

      const text = result.rows
        .map((r: any) => `${r.table_name}: ~${r.estimated_rows} rows (${r.total_size})`)
        .join("\n");

      return {
        content: [
          { type: "text", text: `${result.rows.length} tables in schema "${schema}":\n\n${text}` },
        ],
      };
    }
  );
}
