/* eslint-disable react/prop-types */
import { useEffect, useRef } from 'react'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
globalThis.MonacoEnvironment = {
  ...globalThis.MonacoEnvironment,
  getWorker: () => new EditorWorker()
}
loader.config({ monaco })
export default function CodingDiff({
  original = '',
  modified = '',
  theme = 'vs-dark',
  options = {}
}) {
  const container = useRef(null)
  const editor = useRef(null)
  const models = useRef(null)
  useEffect(() => {
    const instance = monaco.editor.createDiffEditor(container.current, {
      theme,
      automaticLayout: true,
      readOnly: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontLigatures: false
    })
    const originalModel = monaco.editor.createModel('', 'plaintext')
    const modifiedModel = monaco.editor.createModel('', 'plaintext')
    models.current = { original: originalModel, modified: modifiedModel }
    instance.setModel(models.current)
    editor.current = instance
    return () => {
      instance.setModel(null)
      instance.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
      editor.current = null
      models.current = null
    }
  }, [theme])
  useEffect(() => {
    models.current?.original.setValue(original)
    models.current?.modified.setValue(modified)
  }, [original, modified, theme])
  useEffect(() => {
    editor.current?.updateOptions(options)
  }, [options, theme])
  return (
    <div
      ref={container}
      className="mark-code-diff w-full h-full"
      aria-label="Diff berkas hanya baca"
    />
  )
}
