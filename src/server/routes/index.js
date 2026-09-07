import { configRouter } from './config.routes.js'
import { chatRouter } from './chat.routes.js'
import { memoryRouter } from './memory.routes.js'
import { subagentsRouter } from './subagents.routes.js'
import { skillsRouter } from './skills.routes.js'
import { pluginsRouter } from './plugins.routes.js'
import { awarenessRouter } from './awareness.routes.js'
import { tasksRouter } from './tasks.routes.js'
import { integrationsRouter } from './integrations.routes.js'
import { aiRouter } from './ai.routes.js'

export function registerRoutes(app) {
  app.use('/api', configRouter)
  app.use('/api', chatRouter)
  app.use('/api', memoryRouter)
  app.use('/api', subagentsRouter)
  app.use('/api', skillsRouter)
  app.use('/api', pluginsRouter)
  app.use('/api', awarenessRouter)
  app.use('/api', tasksRouter)
  app.use('/api', integrationsRouter)
  app.use('/api', aiRouter)
}
