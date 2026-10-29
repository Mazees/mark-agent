import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  FolderPlus,
  FileText,
  ChevronDown,
  Heading1,
  Heading2,
  Bold,
  Italic,
  CheckSquare,
  Code,
  Link,
  Quote,
  List
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { webApi } from '../api/web-bridge'
import SkillFileTree from '../components/skills/SkillFileTree'
import SkillEditorDialog from '../components/skills/SkillEditorDialog'

const flattenTree = (nodes) => nodes.flatMap((node) => [node, ...flattenTree(node.children || [])])
const parentPath = (path = '') => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const languages = {
  md: 'markdown',
  json: 'json',
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  html: 'html',
  css: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  ps1: 'powershell'
}
const formats = [
  ['h1', Heading1, 'Judul utama'],
  ['h2', Heading2, 'Subjudul'],
  ['bold', Bold, 'Tebal'],
  ['italic', Italic, 'Miring'],
  ['check', CheckSquare, 'Checklist'],
  ['list', List, 'Daftar'],
  ['code', Code, 'Blok kode'],
  ['link', Link, 'Tautan'],
  ['quote', Quote, 'Kutipan']
]

export default function SkillEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tree, setTree] = useState([])
  const [selectedPath, setSelectedPath] = useState(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState({})
  const [filesOpen, setFilesOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [itemName, setItemName] = useState('')
  const editorRef = useRef(null)
  const fileRequestRef = useRef(0)
  const cancelFileRequests = useCallback(() => {
    fileRequestRef.current++
  }, [])
  const dirty = content !== savedContent
  const markdown = selectedPath?.toLowerCase().endsWith('.md')

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError('')
    setNotice('')
    setSelectedPath(null)
    setContent('')
    setSavedContent('')
    setExpanded({})
    const load = async () => {
      try {
        const data = await webApi.getSkillTree(id)
        if (!Array.isArray(data)) throw new Error('Daftar file belum dapat dimuat.')
        const files = flattenTree(data).filter((node) => node.type === 'file')
        const initial = files.find((node) => node.path === 'SKILL.md') || files[0]
        const text = initial ? await webApi.readSkillFile(id, initial.path) : ''
        if (disposed) return
        setTree(data)
        setSelectedPath(initial?.path || null)
        setContent(text)
        setSavedContent(text)
      } catch (failure) {
        if (!disposed) setError(failure.message || 'Skill belum dapat dimuat.')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    load()
    return () => {
      disposed = true
      cancelFileRequests()
    }
  }, [id, cancelFileRequests])

  useEffect(() => {
    if (!dirty) return
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useCallback(async () => {
    if (!selectedPath || busy || loading || !dirty) return
    setBusy('save')
    setError('')
    setNotice('')
    const snapshot = content
    try {
      const result = await webApi.saveSkillFile(id, selectedPath, snapshot)
      if (!result?.success) throw new Error(result?.error || 'Perubahan belum dapat disimpan.')
      setSavedContent(snapshot)
      setNotice('Perubahan berhasil disimpan.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(null)
    }
  }, [id, selectedPath, content, busy, loading, dirty])

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!dialog) save()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [save, dialog])

  const reloadTree = async () => {
    const data = await webApi.getSkillTree(id)
    if (!Array.isArray(data)) throw new Error('Daftar file belum dapat dimuat.')
    setTree(data)
    return data
  }
  const loadFile = async (path) => {
    const request = ++fileRequestRef.current
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const text = await webApi.readSkillFile(id, path)
      if (request !== fileRequestRef.current) return
      setSelectedPath(path)
      setContent(text)
      setSavedContent(text)
      setFilesOpen(false)
    } catch (failure) {
      if (request === fileRequestRef.current) setError(failure.message)
    } finally {
      if (request === fileRequestRef.current) setLoading(false)
    }
  }
  const proceed = (action) => {
    if (busy || loading) return
    setError('')
    if (dirty) setDialog({ kind: 'discard', action })
    else action()
  }
  const openDialog = (kind, node = null) => {
    setError('')
    setNotice('')
    setItemName(node?.name || '')
    setDialog({ kind, node })
  }
  const handleFormat = (format) => {
    const editor = editorRef.current
    const selection = editor?.getSelection()
    const model = editor?.getModel()
    if (!selection || !model) return
    const selected = model.getValueInRange(selection)
    const text = {
      h1: `# ${selected || 'Judul'}`,
      h2: `## ${selected || 'Subjudul'}`,
      bold: `**${selected || 'teks tebal'}**`,
      italic: `*${selected || 'teks miring'}*`,
      check: `- [ ] ${selected || 'Langkah kerja'}`,
      list: `- ${selected || 'Butir daftar'}`,
      code: `\`\`\`\n${selected || 'kode'}\n\`\`\``,
      link: `[${selected || 'Teks tautan'}](https://alamat-situs)`,
      quote: `> ${selected || 'Kutipan'}`
    }[format]
    editor.executeEdits('toolbar', [{ range: selection, text, forceMoveMarkers: true }])
    editor.focus()
  }

  const confirmDialog = async () => {
    if (!dialog || busy) return
    if (dialog.kind === 'discard') {
      const action = dialog.action
      setDialog(null)
      action()
      return
    }
    setError('')
    setBusy('item')
    try {
      const { kind, node } = dialog
      if (kind === 'delete-skill') {
        const result = await webApi.deleteSkill(id)
        if (!result?.success) throw new Error(result?.error || 'Skill belum dapat dihapus.')
        setDialog(null)
        navigate('/skills')
        return
      }
      if (kind === 'delete') {
        const result = await webApi.deleteSkillItem(id, node.path)
        if (!result?.success) throw new Error(result?.error || 'Item belum dapat dihapus.')
        const data = await reloadTree()
        if (selectedPath === node.path || selectedPath?.startsWith(node.path + '/')) {
          const next =
            flattenTree(data).find((item) => item.path === 'SKILL.md') ||
            flattenTree(data).find((item) => item.type === 'file')
          if (next) await loadFile(next.path)
          else {
            setSelectedPath(null)
            setContent('')
            setSavedContent('')
          }
        }
      } else {
        const name = itemName.trim()
        if (
          !name ||
          /[<>:"/\\|?*]/.test(name) ||
          name === '.' ||
          name === '..' ||
          /[. ]$/.test(name)
        )
          throw new Error('Gunakan nama file atau folder yang valid, tanpa pemisah direktori.')
        const base = parentPath(kind === 'rename' ? node.path : selectedPath || '')
        const nextPath = base ? `${base}/${name}` : name
        if (
          flattenTree(tree).some(
            (item) => item.path.toLowerCase() === nextPath.toLowerCase() && item.path !== node?.path
          )
        )
          throw new Error('Nama tersebut sudah digunakan di folder ini.')
        if (kind === 'rename') {
          if (nextPath !== node.path) {
            const result = await webApi.renameSkillItem(id, node.path, nextPath)
            if (!result?.success) throw new Error(result?.error || 'Nama belum dapat diubah.')
            if (selectedPath === node.path || selectedPath?.startsWith(node.path + '/'))
              setSelectedPath(nextPath + selectedPath.slice(node.path.length))
            setExpanded((current) =>
              Object.fromEntries(
                Object.entries(current).map(([key, value]) => [
                  key === node.path || key.startsWith(node.path + '/')
                    ? nextPath + key.slice(node.path.length)
                    : key,
                  value
                ])
              )
            )
          }
        } else {
          const folder = kind === 'folder'
          const result = await webApi.createSkillItem(id, nextPath, folder)
          if (!result?.success) throw new Error(result?.error || 'Item belum dapat dibuat.')
          if (base) setExpanded((current) => ({ ...current, [base]: true }))
          if (folder) setExpanded((current) => ({ ...current, [nextPath]: true }))
          else await loadFile(nextPath)
        }
        await reloadTree()
      }
      setDialog(null)
    } catch (failure) {
      setError(failure.message || 'Perubahan belum dapat diproses.')
    } finally {
      setBusy(null)
    }
  }

  const dialogContent =
    dialog &&
    {
      file: {
        title: 'Buat file',
        description: `File akan dibuat di ${parentPath(selectedPath || '') || 'folder utama skill'}. Sertakan ekstensi, misalnya panduan.md.`,
        confirmLabel: 'Buat file'
      },
      folder: {
        title: 'Buat folder',
        description: `Folder akan dibuat di ${parentPath(selectedPath || '') || 'folder utama skill'}.`,
        confirmLabel: 'Buat folder'
      },
      rename: {
        title: 'Ubah nama',
        description: `Ubah nama ${dialog.node?.name}. Isi file tetap dipertahankan.`,
        confirmLabel: 'Simpan nama'
      },
      delete: {
        title: 'Hapus item?',
        description: `Hapus ${dialog.node?.name}${dialog.node?.type === 'folder' ? ' beserta seluruh isinya' : ''}? Tindakan ini tidak dapat dibatalkan.`,
        confirmLabel: 'Hapus',
        destructive: true
      },
      'delete-skill': {
        title: 'Hapus skill?',
        description: `Skill ${id} beserta semua filenya akan dihapus. Tindakan ini tidak dapat dibatalkan.`,
        confirmLabel: 'Hapus skill',
        destructive: true
      },
      discard: {
        title: 'Perubahan belum disimpan',
        description:
          'Jika dilanjutkan, perubahan pada file ini akan dibuang. Batalkan untuk kembali mengedit dan menyimpannya.',
        confirmLabel: 'Buang perubahan',
        destructive: true
      }
    }[dialog.kind]

  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <div className="mx-auto max-w-6xl px-5 py-7 pb-24 sm:px-8 sm:py-10 sm:pb-24">
        <button
          type="button"
          onClick={() => proceed(() => navigate('/skills'))}
          disabled={!!busy || loading}
          className="mb-8 inline-flex items-center gap-2 rounded-sm text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        >
          <ArrowLeft size={17} aria-hidden="true" /> Kembali ke Skills
        </button>
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold text-white">{id}</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              Edit instruksi utama dan file pendukung skill.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || !!busy || loading}
              className="btn rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
            >
              <Save size={16} aria-hidden="true" />
              {busy === 'save' ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button
              type="button"
              onClick={() => openDialog('delete-skill')}
              disabled={!!busy || loading}
              className="btn btn-ghost rounded-full px-4 text-white/50 hover:text-error"
            >
              <Trash2 size={16} aria-hidden="true" />
              Hapus skill
            </button>
          </div>
        </header>
        {!dialog && error && (
          <p role="alert" className="mt-5 text-sm leading-relaxed text-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-5 text-sm text-primary">
            {notice}
          </p>
        )}
        <div className="mt-8 flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-white/10 md:h-[min(650px,calc(100dvh-240px))] md:flex-row">
          <aside
            aria-label="File skill"
            className="shrink-0 border-b border-white/10 md:w-64 md:border-r md:border-b-0"
          >
            <div className="flex min-h-14 items-center justify-between gap-2 border-b border-white/5 px-3">
              <h2 className="hidden px-1 text-sm font-medium text-white/75 md:block">File skill</h2>
              <button
                type="button"
                onClick={() => setFilesOpen(!filesOpen)}
                aria-expanded={filesOpen}
                aria-controls="skill-files"
                className="flex items-center gap-2 rounded-md px-1 py-2 text-sm text-white/75 focus-visible:outline-2 focus-visible:outline-primary md:hidden"
              >
                File skill
                <ChevronDown
                  size={14}
                  className={filesOpen ? 'rotate-180' : ''}
                  aria-hidden="true"
                />
              </button>
              <div className="flex items-center">
                <button
                  type="button"
                  disabled={!!busy || loading}
                  onClick={() => proceed(() => openDialog('file'))}
                  aria-label="Buat file"
                  title="Buat file"
                  className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!!busy || loading}
                  onClick={() => openDialog('folder')}
                  aria-label="Buat folder"
                  title="Buat folder"
                  className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <FolderPlus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div
              id="skill-files"
              className={`${filesOpen ? 'block' : 'hidden'} max-h-64 overflow-y-auto p-2 custom-scrollbar md:block md:max-h-none md:h-[calc(100%-3.5rem)]`}
            >
              {loading && !tree.length ? (
                <p role="status" className="px-2 py-4 text-xs text-white/45">
                  Memuat file...
                </p>
              ) : tree.length ? (
                <SkillFileTree
                  nodes={tree}
                  selectedPath={selectedPath}
                  expanded={expanded}
                  onToggle={(path) =>
                    setExpanded((current) => ({ ...current, [path]: !current[path] }))
                  }
                  onSelect={(path) => {
                    if (path !== selectedPath) proceed(() => loadFile(path))
                  }}
                  onRename={(node) => openDialog('rename', node)}
                  onDelete={(node) => openDialog('delete', node)}
                  disabled={!!busy || loading}
                />
              ) : (
                <p className="px-2 py-4 text-xs leading-relaxed text-white/45">
                  Belum ada file. Buat SKILL.md untuk menulis instruksi utama.
                </p>
              )}
            </div>
          </aside>
          <section
            aria-label="Editor file"
            className="flex min-h-[440px] min-w-0 flex-1 flex-col bg-[#141211]"
          >
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-white/75">
                <FileText size={15} className="shrink-0 text-white/40" aria-hidden="true" />
                <span className="break-all">{selectedPath || 'Pilih file'}</span>
              </div>
              <span
                role="status"
                className={`shrink-0 text-xs ${dirty ? 'text-primary' : 'text-white/40'}`}
              >
                {loading ? 'Memuat...' : dirty ? 'Belum disimpan' : selectedPath ? 'Tersimpan' : ''}
              </span>
            </div>
            {markdown && (
              <div
                role="toolbar"
                aria-label="Format Markdown"
                className="flex flex-wrap gap-1 border-b border-white/5 px-3 py-2"
              >
                {formats.map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleFormat(key)}
                    disabled={loading || !!busy}
                    aria-label={label}
                    title={label}
                    className="rounded-md p-2 text-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Icon size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
            <div className="relative min-h-[340px] flex-1">
              {loading ? (
                <p role="status" className="p-6 text-sm text-white/45">
                  Memuat editor...
                </p>
              ) : selectedPath ? (
                <Editor
                  height="100%"
                  path={`${id}/${selectedPath}`}
                  language={languages[selectedPath.split('.').pop()?.toLowerCase()] || 'plaintext'}
                  theme="mark-skill"
                  beforeMount={(monaco) =>
                    monaco.editor.defineTheme('mark-skill', {
                      base: 'vs-dark',
                      inherit: true,
                      rules: [],
                      colors: {
                        'editor.background': '#141211',
                        'editorLineNumber.foreground': '#59524f',
                        'editorGutter.background': '#141211'
                      }
                    })
                  }
                  value={content}
                  loading={<p className="p-6 text-sm text-white/45">Memuat editor...</p>}
                  onMount={(editor) => {
                    editorRef.current = editor
                  }}
                  onChange={(value) => {
                    setContent(value || '')
                    setNotice('')
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 18, bottom: 18 },
                    fontFamily: 'Consolas, monospace',
                    readOnly: !!busy
                  }}
                />
              ) : (
                <p className="p-6 text-sm text-white/45">
                  Pilih atau buat file untuk mulai mengedit.
                </p>
              )}
            </div>
            <footer className="border-t border-white/5 px-4 py-2 text-xs text-white/35">
              {selectedPath === 'SKILL.md'
                ? 'Instruksi utama yang dibaca Mark.'
                : selectedPath
                  ? 'File pendukung skill.'
                  : 'File skill disimpan di perangkat ini.'}{' '}
              <span className="ml-2">Ctrl+S untuk menyimpan.</span>
            </footer>
          </section>
        </div>
      </div>
      {dialog && (
        <SkillEditorDialog
          {...dialogContent}
          name={itemName}
          onNameChange={
            ['file', 'folder', 'rename'].includes(dialog.kind) ? setItemName : undefined
          }
          onConfirm={confirmDialog}
          onClose={() => {
            if (!busy) {
              setDialog(null)
              setError('')
            }
          }}
          busy={!!busy}
          error={error}
        />
      )}
    </main>
  )
}
