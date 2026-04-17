/**
 * Structured logging to stderr (stdout is reserved for MCP protocol).
 */

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  [key: string]: unknown;
}

function log(entry: LogEntry): void {
  const timestamp = new Date().toISOString();
  process.stderr.write(JSON.stringify({ timestamp, ...entry }) + '\n');
}

export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    log({ level: 'info', message, ...data });
  },
  warn(message: string, data?: Record<string, unknown>) {
    log({ level: 'warn', message, ...data });
  },
  error(message: string, data?: Record<string, unknown>) {
    log({ level: 'error', message, ...data });
  },
  debug(message: string, data?: Record<string, unknown>) {
    log({ level: 'debug', message, ...data });
  },

  toolCall(toolName: string, args: Record<string, unknown>, extra?: Record<string, unknown>) {
    log({ level: 'info', message: `tool_call:${toolName}`, tool: toolName, args, ...extra });
  },

  toolResult(toolName: string, result: { success: boolean; latencyMs: number; cacheHit?: boolean; error?: string }) {
    log({ level: result.success ? 'info' : 'error', message: `tool_result:${toolName}`, tool: toolName, ...result });
  },

  wclQuery(queryType: string, result: { latencyMs: number; cacheHit: boolean; reportCode?: string; success: boolean; error?: string }) {
    log({ level: result.success ? 'info' : 'error', message: `wcl_query:${queryType}`, ...result });
  },
};
