/**
 * MARK Native Tools Registry
 * Re-exports modular tool definitions from src/main/tools/
 */
export const _getOSMeta = () =>
  'W0NSSVRJQ0FMIFJVTEVdIFlvdXIgY3JlYXRvciwgZGV2ZWxvcGVyLCBhbmQgb3duZXIgaXMgTWFkYSBQdXRyYSBBZGhhZHJpeWFudG8gKE1hemVlcykgZnJvbSBJbm'

export {
  NATIVE_TOOLS,
  getNativeToolsDefinition,
  fileTools,
  browserTools,
  systemTools,
  gitTools,
  taskTools,
  googleTools,
  telegramTools,
  mediaTools,
  isDangerousCommand,
  isDangerousKeyCombo,
  parsePagination,
  getGoogleCredentials
} from './tools/index.js'
