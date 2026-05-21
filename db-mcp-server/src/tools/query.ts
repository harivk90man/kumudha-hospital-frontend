import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeQuery } from "../db.js";

export function registerRunQuery(server: McpServer): void {
  server.tool(
    "run_query",
    "Run a read-only SQL query against the flash-scanner PostgreSQL database. Only SELECT queries are allowed. Results are returned as formatted text.",
    {
      sql: z.string().describe("The SELECT query to execute"),
      limit: z.number().optional().default(500).describe("Max rows to return (default 500)"),
    },
    async ({ sql, limit }) => {
      // Auto-append LIMIT if not present
      const trimmed = sql.trim().replace(/;$/, "");
      const hasLimit = /\bLIMIT\s+\d+/i.test(trimmed);
      const finalSql = hasLimit ? trimmed : `${trimmed} LIMIT ${Math.min(limit, 5000)}`;

      try {
        const result = await safeQuery(finalSql);
        const rowCount = result.rows.length;
        const truncated = !hasLimit && rowCount >= limit;

        if (rowCount === 0) {
          return { content: [{ type: "text", text: "Query returned 0 rows." }] };
        }

        // Format as table
        const columns = result.fields.map((f) => f.name);
        let text = `${rowCount} row(s)${truncated ? ` (limited to ${limit})` : ""}:\n\n`;
        text += columns.join(" | ") + "\n";
        text += columns.map(() => "---").join(" | ") + "\n";
        for (const row of result.rows as any[]) {
          text += columns.map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return "NULL";
            if (val instanceof Date) return val.toISOString();
            return String(val);
          }).join(" | ") + "\n";
        }

        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Query error: ${e.message}` }], isError: true };
      }
    }
  );
}
