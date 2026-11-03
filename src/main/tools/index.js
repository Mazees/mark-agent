import { fileTools } from './file-tools.js'
import { browserTools } from './browser-tools.js'
import { systemTools, isDangerousCommand, isDangerousKeyCombo } from './system-tools.js'
import { gitTools } from './git-tools.js'
import { taskTools } from './task-tools.js'
import { googleTools, parsePagination, getGoogleCredentials } from './google-tools.js'
import { telegramTools } from './telegram-tools.js'
import { mediaTools } from './media-tools.js'
import { learnTools } from './learn-tools.js'
import { wrapCodingTool } from '../../server/services/coding-execution.js'

const tools = {
  ...fileTools,
  ...browserTools,
  ...systemTools,
  ...gitTools,
  ...taskTools,
  ...googleTools,
  ...telegramTools,
  ...mediaTools,
  ...learnTools
}

export const NATIVE_TOOLS = Object.fromEntries(
  Object.entries(tools).map(([name, tool]) => [name, wrapCodingTool(name, tool)])
)

export const getNativeToolsDefinition = () => NATIVE_TOOLS

export {
  fileTools,
  browserTools,
  systemTools,
  gitTools,
  taskTools,
  googleTools,
  telegramTools,
  mediaTools,
  learnTools,
  isDangerousCommand,
  isDangerousKeyCombo,
  parsePagination,
  getGoogleCredentials
}
