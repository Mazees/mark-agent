import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

globalThis.MonacoEnvironment = {
  ...globalThis.MonacoEnvironment,
  getWorker: () => new EditorWorker()
}
loader.config({ monaco })

export default Editor
