import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalQuery } from "../db.js";

export function registerTableStats(server: McpServer): void {
  server.tool(
    "table_stats",
    "Get quick statistics for a table: exact row count, date range of a column, and a sample of latest rows. Useful for checking data freshness.",
    {
      table_name: z.string().describe("Table name to analyze"),
      date_column: z.string().optional().describe("Date/timestamp column to get min/max range"),
      sample_rows: z.number().optional().default(5).describe("Number of latest rows to sample"),
    },
    async ({ table_name, date_column, sample_rows }) => {
      // Validate table exists
      const tableCheck = await internalQuery(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table_name]
      );
      if (tableCheck.rows.length === 0) {
        return { content: [{ type: "text", text: `Table "${table_name}" not found.` }] };
      }

      // Exact row count
      const countResult = await internalQuery(`SELECT COUNT(*) AS cnt FROM "${table_name}"`);
      const rowCount = countResult.rows[0].cnt;

      let text = `Table: ${table_name}\nExact row count: ${rowCount}\n`;

      // Date range if column specified
      if (date_column) {
        // Validate column exists
        const colCheck = await internalQuery(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [table_name, date_column]
        );
        if (colCheck.rows.length === 0) {
          text += `\nColumn "${date_column}" not found in table.\n`;
        } else {
          const rangeResult = await internalQuery(
            `SELECT MIN("${date_column}") AS min_val, MAX("${date_column}") AS max_val FROM "${table_name}"`
          );
          const { min_val, max_val } = rangeResult.rows[0];
          text += `\nDate range (${date_column}): ${min_val} → ${max_val}\n`;
        }
      }

      // Sample rows
      const limit = Math.min(sample_rows, 20);
      let orderClause = "";
      if (date_column) {
        const colCheck = await internalQuery(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [table_name, date_column]
        );
        if (colCheck.rows.length > 0) {
          orderClause = `ORDER BY "${date_column}" DESC`;
        }
      }
      const sampleResult = await internalQuery(
        `SELECT * FROM "${table_name}" ${orderClause} LIMIT ${limit}`
      );

      if (sampleResult.rows.length > 0) {
        text += `\nSample (${sampleResult.rows.length} rows):\n`;
        // Column headers
        const columns = sampleResult.fields.map((f) => f.name);
        text += columns.join(" | ") + "\n";
        text += columns.map(() => "---").join(" | ") + "\n";
        for (const row of sampleResult.rows as any[]) {
          text += columns.map((col) => String(row[col] ?? "NULL")).join(" | ") + "\n";
        }
      }

      return { content: [{ type: "text", text }] };
    }
  );
}
