import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerListTables } from "./tools/list-tables.js";
import { registerDescribeTable } from "./tools/describe-table.js";
import { registerTableStats } from "./tools/table-stats.js";
import { registerRunQuery } from "./tools/query.js";
import { shutdown } from "./db.js";

const server = new McpServer({
  name: "flash-scanner-db",
  version: "1.0.0",
});

// Register all tools
registerListTables(server);
registerDescribeTable(server);
registerTableStats(server);
registerRunQuery(server);

// Start server on stdio
const transport = new StdioServerTransport();
await server.connect(transport);

// Graceful shutdown
process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
