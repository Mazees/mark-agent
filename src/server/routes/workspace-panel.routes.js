import { Router } from 'express'
import {
  workspaceTree,
  readWorkspaceFile,
  saveWorkspaceFile,
  saveEditorDraft,
  panelState
} from '../services/workspace-files.js'
import { prepareDocument, documentContent } from '../services/document-preview.js'
export const workspacePanelRouter = Router()
const session = (req) => String(req.body?.sessionId || req.query.sessionId || '1')
const allowed = (req) =>
  !req.get('origin') ||
  new URL(req.get('origin')).host === req.get('host') ||
  (process.argv.includes('--dev') && new URL(req.get('origin')).hostname === 'localhost')
const route = (handler) => async (req, res) => {
  try {
    if (!allowed(req))
      return res
        .status(403)
        .json({ success: false, error: 'Gunakan antarmuka Mark untuk mengelola workspace.' })
    res.json({ success: true, data: await handler(req) })
  } catch (error) {
    res.status(409).json({ success: false, error: error.message })
  }
}
workspacePanelRouter.get(
  '/workspace/tree',
  route((req) => workspaceTree(session(req), req.query.directory || '.', req.query.search || ''))
)
workspacePanelRouter.get(
  '/workspace/file',
  route((req) => readWorkspaceFile(session(req), req.query.path))
)
workspacePanelRouter.post(
  '/workspace/file',
  route((req) => saveWorkspaceFile(session(req), req.body))
)
workspacePanelRouter.post(
  '/workspace/draft',
  route((req) => saveEditorDraft(session(req), req.body))
)
workspacePanelRouter.get(
  '/workspace/panel',
  route((req) => panelState(session(req)))
)
workspacePanelRouter.post(
  '/workspace/panel',
  route((req) => panelState(session(req), req.body))
)
workspacePanelRouter.post(
  '/workspace/document',
  route((req) => prepareDocument(session(req), req.body.path))
)
workspacePanelRouter.get('/workspace/document/content', async (req, res) => {
  try {
    if (!allowed(req)) return res.sendStatus(403)
    const file = await documentContent(session(req), req.query.path, req.query.hash)
    res.set('X-Content-Type-Options', 'nosniff').type('pdf').sendFile(file)
  } catch (error) {
    res.status(409).json({ success: false, error: error.message })
  }
})
