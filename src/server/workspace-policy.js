import os from 'node:os'
import path from 'node:path'
import { isMainSession, workspaceKey } from '../shared/workspaces.js'

export const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), 'Documents', 'Mark Workspace')

export function sessionForClient(session) {
  return session && isMainSession(session.id)
    ? { ...session, workspaceRoot: DEFAULT_WORKSPACE_ROOT }
    : session
}

export function isInvalidMainWorkspace(session) {
  if (!isMainSession(session?.id)) return false
  return ['workspaceRoot', 'workspace_root', 'workspace'].some(
    (field) =>
      session[field] && workspaceKey(session[field]) !== workspaceKey(DEFAULT_WORKSPACE_ROOT)
  )
}
