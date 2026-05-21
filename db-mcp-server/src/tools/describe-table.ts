import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalQuery } from "../db.js";

export function registerDescribeTable(server: McpServer): void {
  server.tool(
    "describe_table",
    "Show column definitions, types, constraints, indexes, and foreign keys for a table.",
    { table_name: z.string().describe("Table name to describe") },
    async ({ table_name }) => {
      // Validate table exists
      const tableCheck = await internalQuery(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table_name]
      );
      if (tableCheck.rows.length === 0) {
        return { content: [{ type: "text", text: `Table "${table_name}" not found.` }] };
      }

      // Columns
      const cols = await internalQuery(
        `SELECT column_name, data_type, is_nullable, column_default,
                character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table_name]
      );

      // Primary key columns
      const pkResult = await internalQuery(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
        [table_name]
      );
      const pkCols = new Set(pkResult.rows.map((r: any) => r.column_name));

      // Indexes
      const indexes = await internalQuery(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
        [table_name]
      );

      // Foreign keys
      const fks = await internalQuery(
        `SELECT
           kcu.column_name,
           ccu.table_name AS references_table,
           ccu.column_name AS references_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
        [table_name]
      );

      // Row count estimate
      const countResult = await internalQuery(
        `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
        [table_name]
      );
      const estimateRows = countResult.rows[0]?.estimate ?? "unknown";

      // Format output
      let text = `Table: ${table_name}  (~${estimateRows} rows)\n\n`;

      text += "COLUMNS:\n";
      for (const c of cols.rows as any[]) {
        const pk = pkCols.has(c.column_name) ? " [PK]" : "";
        const nullable = c.is_nullable === "YES" ? " NULL" : " NOT NULL";
        const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
        text += `  ${c.column_name}: ${c.data_type}${nullable}${def}${pk}\n`;
      }

      if (indexes.rows.length > 0) {
        text += "\nINDEXES:\n";
        for (const idx of indexes.rows as any[]) {
          text += `  ${idx.indexname}: ${idx.indexdef}\n`;
        }
      }

      if (fks.rows.length > 0) {
        text += "\nFOREIGN KEYS:\n";
        for (const fk of fks.rows as any[]) {
          text += `  ${fk.column_name} -> ${fk.references_table}(${fk.references_column})\n`;
        }
      }

      return { content: [{ type: "text", text }] };
    }
  );
}
