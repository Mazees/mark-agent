/* eslint-disable react/prop-types */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DiffEditor } from '@monaco-editor/react'
import { X } from 'lucide-react'

function parseToolArgs(tool, query) {
  let parsed = {}
  if (typeof query === 'object' && query !== null) {
    parsed = { ...query }
  } else if (typeof query === 'string') {
    try {
      parsed = JSON.parse(query)
    } catch {
      const parts = query.split('||')
      if (tool === 'write-file') {
        parsed = { path: parts[0]?.trim(), content: parts.slice(1).join('||') }
      } else if (tool === 'replace-content') {
        parsed = {
          path: parts[0]?.trim(),
          target_content: parts[1],
          replacement_content: parts.slice(2).join('||')
        }
      } else if (tool === 'replace-lines') {
        parsed = {
          path: parts[0]?.trim(),
          start_line: parts[1],
          end_line: parts[2],
          new_code: parts.slice(3).join('||')
        }
      } else if (tool === 'delete-file') {
        parsed = { path: parts[0]?.trim() }
      } else {
        parsed = { path: parts[0]?.trim() }
      }
    }
  }
  return parsed
}

function getLanguageFromPath(filePath) {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php'
  }
  return map[ext] || 'plaintext'
}

export const FileDiffModal = ({ isOpen = false, onClose, tool = '', query = null, onResolve }) => {
  const [loading, setLoading] = useState(true)
  const [originalContent, setOriginalContent] = useState('')
  const [modifiedContent, setModifiedContent] = useState('')
  const [filePath, setFilePath] = useState('')
  const [isNewFile, setIsNewFile] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const isViewOnly = !onResolve || tool === 'read-file' || tool === 'view-artifact'

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true

    const loadDiff = async () => {
      setLoading(true)
      setErrorMessage('')
      try {
        const parsed = parseToolArgs(tool, query)
        const targetPath = (parsed.path || parsed.filePath || parsed.target || '').trim()
        setFilePath(targetPath)

        if (!targetPath) {
          if (isMounted) {
            setErrorMessage('Path file tidak ditemukan dalam argumen tool.')
            setLoading(false)
          }
          return
        }

        let original = ''
        let exists = true

        if (window.api?.executeNativeTool) {
          const res = await window.api.executeNativeTool('read-file', {
            path: targetPath,
            raw: true
          })
          if (res && res.success) {
            original = res.content || ''
            exists = res.exists !== false
          } else if (res && res.exists === false) {
            original = ''
            exists = false
          }
        }

        let modified = original
        if (tool === 'write-file') {
          modified =
            typeof parsed.content === 'string'
              ? parsed.content
              : JSON.stringify(parsed.content ?? '', null, 2)
        } else if (tool === 'replace-content') {
          const target = parsed.target_content ?? ''
          const replacement = parsed.replacement_content ?? ''
          if (original.includes(target)) {
            modified = original.replace(target, replacement)
          } else {
            modified = original
          }
        } else if (tool === 'replace-lines') {
          const startLine = parseInt(parsed.start_line, 10)
          const endLine = parseInt(parsed.end_line, 10)
          const newCode = parsed.new_code !== undefined ? parsed.new_code : parsed.content || ''
          const lines = original.split('\n')
          if (
            !isNaN(startLine) &&
            !isNaN(endLine) &&
            startLine >= 1 &&
            startLine <= lines.length &&
            endLine >= startLine
          ) {
            lines.splice(startLine - 1, endLine - startLine + 1, newCode)
            modified = lines.join('\n')
          }
        } else if (tool === 'delete-file') {
          modified = ''
        }

        if (isMounted) {
          setOriginalContent(original)
          setModifiedContent(modified)
          setIsNewFile(!exists)
          setLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(`Gagal memuat perbandingan berkas: ${err.message}`)
          setLoading(false)
        }
      }
    }

    loadDiff()

    return () => {
      isMounted = false
    }
  }, [isOpen, tool, query])

  if (!isOpen) return null

  const language = getLanguageFromPath(filePath)
  const fileName = filePath
    ? filePath
        .replace(/[\\/]+/g, '/')
        .split('/')
        .pop()
    : ''

  const modalContent = (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 sm:p-6 animate-[response-fade-in_0.15s_ease-out_forwards]"
      onClick={onClose}
    >
      <div
        className="bg-base-300 border border-white/10 rounded-xl shadow-2xl flex flex-col w-[94vw] max-w-5xl h-[85vh] overflow-hidden text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Informative */}
        <div className="flex items-center justify-between px-4 py-3 bg-base-200/90 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-white truncate text-xs sm:text-sm">
              Review Perubahan Berkas: {fileName}
            </span>
            {filePath && (
              <span
                className="text-[11px] font-mono text-white/40 truncate hidden sm:inline"
                title={filePath}
              >
                ({filePath})
              </span>
            )}
            {isViewOnly ? (
              <span className="bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded text-[11px] font-mono shrink-0">
                Artefak Tahap
              </span>
            ) : (
              <>
                {tool && (
                  <span className="bg-white/10 text-white/80 px-2 py-0.5 rounded text-[11px] font-mono shrink-0">
                    {tool}
                  </span>
                )}
                {isNewFile && (
                  <span className="bg-success/15 text-success px-2 py-0.5 rounded text-[11px] font-semibold shrink-0">
                    Berkas Baru
                  </span>
                )}
                {tool === 'delete-file' && (
                  <span className="bg-error/15 text-error px-2 py-0.5 rounded text-[11px] font-semibold shrink-0">
                    Hapus Berkas
                  </span>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-circle text-white/60 hover:text-white"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diff Content Area */}
        <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/60 text-xs font-mono">
              <span className="loading loading-spinner loading-sm text-primary" />
              <span>Memuat perbandingan berkas...</span>
            </div>
          ) : errorMessage ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-error text-xs font-mono">
              {errorMessage}
            </div>
          ) : (
            <DiffEditor
              height="100%"
              original={originalContent}
              modified={modifiedContent}
              language={language}
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: !isViewOnly,
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 8, bottom: 8 }
              }}
            />
          )}
        </div>

        {/* Footer Informative Actions */}
        <div className="flex flex-wrap items-center justify-end px-4 py-3 bg-base-200/90 border-t border-white/10 shrink-0 gap-2">
          {isViewOnly ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary btn-sm text-black font-semibold rounded-lg px-4 shadow-sm"
              >
                Tutup Pratinjau
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onResolve && onResolve('reject')}
                className="btn btn-ghost btn-sm text-error/80 hover:text-error hover:bg-error/10 rounded-lg px-3"
              >
                Tolak
              </button>
              <button
                type="button"
                onClick={() => onResolve && onResolve('approve_session')}
                className="btn btn-ghost btn-sm text-warning/80 hover:text-warning hover:bg-warning/10 rounded-lg px-3"
              >
                Izinkan Sesi Ini
              </button>
              <button
                type="button"
                onClick={() => onResolve && onResolve('approve_always')}
                className="btn btn-ghost btn-sm text-white/40 hover:text-error hover:bg-error/10 rounded-lg px-3"
              >
                Izinkan Selamanya
              </button>
              <button
                type="button"
                onClick={() => onResolve && onResolve('approve_once')}
                className="btn btn-primary btn-sm text-black font-semibold rounded-lg px-4 shadow-sm"
              >
                Izinkan Sekali
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modalContent, document.body)
}

export default FileDiffModal
