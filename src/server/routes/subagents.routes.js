import { subagentRuntime } from '../services/subagents/service.js'
import { dbStore } from '../memory/db-store.js'
import { createSubagentRouter } from '../services/subagents/router.js'
export const subagentsRouter = createSubagentRouter(subagentRuntime, dbStore)
