import { fileTools } from './file-tools.js'
import { browserTools } from './browser-tools.js'
import { systemTools, isDangerousCommand, isDangerousKeyCombo } from './system-tools.js'
import { gitTools } from './git-tools.js'
import { taskTools } from './task-tools.js'
import { googleTools, parsePagination, getGoogleCredentials } from './google-tools.js'
import { telegramTools } from './telegram-tools.js'
import { mediaTools } from './media-tools.js'

export const NATIVE_TOOLS = {
  ...fileTools,
  ...browserTools,
  ...systemTools,
  ...gitTools,
  ...taskTools,
  ...googleTools,
  ...telegramTools,
  ...mediaTools
}

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
  isDangerousCommand,
  isDangerousKeyCombo,
  parsePagination,
  getGoogleCredentials
}
