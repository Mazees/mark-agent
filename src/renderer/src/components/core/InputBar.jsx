/* eslint-disable react/prop-types */
import { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react'
import {
  FaMicrophone,
  FaStop,
  FaArrowUp,
  FaSmile,
  FaPaperclip,
  FaTimes,
  FaFileAlt,
  FaFilePdf,
  FaFileCode,
  FaFileImage,
  FaLock,
  FaFolder
} from 'react-icons/fa'
import { Zap, Folder, Wrench, ChevronLeft } from 'lucide-react'
import ConfirmModal from './ConfirmModal'
import { NATIVE_SKILLS } from './native-skills'
import { calculateSessionChars, MAX_CONTEXT_CHARS } from '../../api/ai/contextManager'
import {
  getChatData,
  getSessionCompact,
  getSessionAutoMode,
  setSessionAutoMode
} from '../../api/db'

const EMOJIS = [
  '😂',
  '🤣',
  '😅',
  '🗿',
  '🙏',
  '🔥',
  '🚀',
  '💀',
  '😎',
  '🤔',
  '😭',
  '❤️',
  '👍',
  '✨',
  '👀',
  '💯'
]

const formatFileSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const getFileIcon = (fileName = '') => {
  const ext = fileName.split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return <FaFileImage className="text-primary" />
  if (['pdf'].includes(ext)) return <FaFilePdf className="text-error" />
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp', 'cs'].includes(ext))
    return <FaFileCode className="text-info" />
  return <FaFileAlt className="text-primary" />
}

const InputBar = ({
  sessionId = '1',
  onSubmit,
  isLoading,
  isRecording,
  isProcessing,
  audioIntensity = 0,
  onStartRecord,
  onStopRecord,
  onStop,
  source = 'pc',
  inline = false,
  className = '',
  workspaceRoot = null,
  onSelectWorkspace = null,
  onManualCompact = null
}) => {
  void source
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const contextPopoverRef = useRef(null)
  const gaugeRef = useRef(null)
  const mentionListRef = useRef(null)
  const skillListRef = useRef(null)
  const [inputText, setInputText] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)
  const [showContextPopover, setShowContextPopover] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const lastPromptRef = useRef('')
  const isPastingRef = useRef(false)

  const [skills, setSkills] = useState([])
  const [filteredSkills, setFilteredSkills] = useState([])
  const [showSkillList, setShowSkillList] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)

  // Mention (@) Autocomplete States
  const [showMentionList, setShowMentionList] = useState(false)
  const [mentionCategory, setMentionCategory] = useState('all') // 'all' | 'files' | 'tools'
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionCursorIndex, setMentionCursorIndex] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [workspaceFiles, setWorkspaceFiles] = useState([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [toolGroups, setToolGroups] = useState([])

  const loadToolGroups = useCallback(async () => {
    if (window.api && window.api.getGroupTools) {
      try {
        const data = await window.api.getGroupTools()
        const schema = data?.schema || {}
        const names = data?.names || Object.keys(schema)
        const list = names.map((key) => {
          const desc = schema[key]?.description || ''
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          return {
            name: key,
            label,
            description: desc
          }
        })
        setToolGroups(list)
        return list
      } catch (err) {
        console.error('[InputBar] Failed to load tool groups:', err)
      }
    }
    return []
  }, [])

  useEffect(() => {
    loadToolGroups()
  }, [loadToolGroups])

  const [contextTracker, setContextTracker] = useState({
    currentChars: 0,
    maxChars: 525000,
    percentage: 0,
    lastCompactedAt: null
  })

  const [isAutoMode, setIsAutoMode] = useState(false)

  useEffect(() => {
    let isMounted = true
    getSessionAutoMode(sessionId).then((val) => {
      if (isMounted) setIsAutoMode(Boolean(val))
    })

    const handleAutoModeUpdate = (e) => {
      if (String(e.detail?.sessionId) === String(sessionId)) {
        setIsAutoMode(Boolean(e.detail?.isAutoMode))
      }
    }

    window.addEventListener('session-auto-mode-updated', handleAutoModeUpdate)
    return () => {
      isMounted = false
      window.removeEventListener('session-auto-mode-updated', handleAutoModeUpdate)
    }
  }, [sessionId])

  const handleToggleAutoMode = async () => {
    const next = !isAutoMode
    setIsAutoMode(next)
    await setSessionAutoMode(sessionId, next)
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        contextPopoverRef.current &&
        !contextPopoverRef.current.contains(e.target) &&
        (!gaugeRef.current || !gaugeRef.current.contains(e.target))
      ) {
        setShowContextPopover(false)
      }
    }
    if (showContextPopover) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showContextPopover])

  // Muat status konteks awal sesi saat mount atau saat sessionId berganti
  useEffect(() => {
    let isCancelled = false
    const loadInitialContext = async () => {
      try {
        const [messages, compact] = await Promise.all([
          getChatData(sessionId),
          getSessionCompact(String(sessionId))
        ])
        if (isCancelled) return
        const chars = calculateSessionChars(
          messages || [],
          compact?.summaryBlock || compact?.summary_block || '',
          compact?.lastCompactedMessageId || compact?.last_compacted_message_id || null
        )
        setContextTracker({
          currentChars: chars,
          maxChars: MAX_CONTEXT_CHARS,
          percentage: Math.min(100, (chars / MAX_CONTEXT_CHARS) * 100),
          lastCompactedAt: compact?.lastCompactedAt || null
        })
      } catch {
        // ignore
      }
    }
    loadInitialContext()
    return () => {
      isCancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const handleTrackerUpdate = (e) => {
      if (e.detail) {
        if (e.detail.sessionId && String(e.detail.sessionId) !== String(sessionId)) {
          return
        }
        setContextTracker({
          currentChars: Number(e.detail.currentChars || 0),
          maxChars: Number(e.detail.maxChars || 525000),
          percentage: Number(e.detail.percentage || 0),
          lastCompactedAt: e.detail.lastCompactedAt || null
        })
      }
    }

    window.addEventListener('context-tracker-updated', handleTrackerUpdate)
    return () => {
      window.removeEventListener('context-tracker-updated', handleTrackerUpdate)
    }
  }, [sessionId])

  const reloadSkills = async () => {
    if (window.api && window.api.getSkills) {
      try {
        const loadedSkills = await window.api.getSkills()
        const nativeSkillList = NATIVE_SKILLS.map((s) => ({
          name: s.name,
          description: s.description
        }))
        const merged = [...nativeSkillList, ...(loadedSkills || [])]
        setSkills(merged)
        return merged
      } catch (err) {
        console.error('[InputBar] Failed to reload skills:', err)
      }
    }
    return []
  }

  useEffect(() => {
    reloadSkills()
    if (window.api && window.api.onSkillsUpdated) {
      const unsub = window.api.onSkillsUpdated(() => {
        reloadSkills()
      })
      return () => {
        if (typeof unsub === 'function') unsub()
      }
    }
  }, [])

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus()
      }, 50)
    }
  }, [isLoading])

  // Auto-scroll item terpilih ke viewport saat navigasi keyboard
  useEffect(() => {
    if (showMentionList && mentionListRef.current) {
      const activeEl = mentionListRef.current.children[selectedMentionIndex]
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedMentionIndex, showMentionList])

  useEffect(() => {
    if (showSkillList && skillListRef.current) {
      const activeEl = skillListRef.current.children[selectedSkillIndex]
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedSkillIndex, showSkillList])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    addFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePaperclipClick = async () => {
    if (window.api && window.api.showOpenDialog) {
      try {
        const filePaths = await window.api.showOpenDialog()
        if (filePaths && filePaths.length > 0) {
          const dialogFiles = filePaths.map((p) => ({
            name: p.split(/[/\\]/).pop(),
            path: p,
            size: 0,
            type: ''
          }))
          setAttachedFiles((prev) => {
            const existingPaths = new Set(prev.map((item) => item.path))
            const unique = dialogFiles.filter((item) => !existingPaths.has(item.path))
            return [...prev, ...unique]
          })
          return
        }
      } catch (err) {
        console.error('[InputBar] Open dialog error:', err)
      }
    }
    fileInputRef.current?.click()
  }

  const handlePaste = async (e) => {
    if (isPastingRef.current) return
    const clipboardData = e.clipboardData || window.clipboardData
    if (!clipboardData) return

    let imageFiles = []

    // 1. Ambil file bawaan dari clipboardData.files (sudah ter-deduplikasi oleh browser)
    if (clipboardData.files && clipboardData.files.length > 0) {
      imageFiles = Array.from(clipboardData.files).filter(
        (f) => f.type && f.type.startsWith('image/')
      )
    }

    // 2. Fallback jika files kosong, cek clipboardData.items (hanya ambil file unik pertama)
    if (imageFiles.length === 0 && clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i]
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            const ext = item.type.split('/')[1] || 'png'
            const namedFile = new File([file], `screenshot-${Date.now()}.${ext}`, {
              type: item.type
            })
            imageFiles.push(namedFile)
            break
          }
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      isPastingRef.current = true
      try {
        await addFiles(imageFiles)
      } finally {
        setTimeout(() => {
          isPastingRef.current = false
        }, 300)
      }
    }
  }

  const addFiles = async (newFiles) => {
    const parsedFiles = await Promise.all(
      newFiles.map(async (f) => {
        let resolvedPath = ''
        let previewUrl = null

        // Baca Base64 untuk preview jika file gambar
        if (f.type && f.type.startsWith('image/')) {
          try {
            previewUrl = await new Promise((res) => {
              const reader = new FileReader()
              reader.onload = () => res(reader.result)
              reader.onerror = () => res(null)
              reader.readAsDataURL(f)
            })
          } catch {
            // ignore preview error
          }
        }

        if (window.api && window.api.getPathForFile) {
          try {
            resolvedPath = window.api.getPathForFile(f)
          } catch (e) {
            console.error('[InputBar] getPathForFile error:', e)
          }
        }

        const isRealDiskPath =
          resolvedPath &&
          resolvedPath !== f.name &&
          (resolvedPath.includes('/') || resolvedPath.includes('\\'))

        if (
          !isRealDiskPath &&
          f.path &&
          f.path !== f.name &&
          (f.path.includes('/') || f.path.includes('\\'))
        ) {
          resolvedPath = f.path
        }

        // Jika file belum memiliki path disk asli (misal pasted image atau drag-drop browser)
        if (
          !resolvedPath ||
          resolvedPath === f.name ||
          (!resolvedPath.includes('/') && !resolvedPath.includes('\\'))
        ) {
          try {
            if (window.api?.saveTempFile && previewUrl) {
              const tempPath = await window.api.saveTempFile(previewUrl, f.name)
              if (tempPath) resolvedPath = tempPath
            } else {
              const buffer = await f.arrayBuffer()
              if (buffer && buffer.byteLength > 0 && window.api?.saveTempFile) {
                const tempPath = await window.api.saveTempFile(buffer, f.name)
                if (tempPath) resolvedPath = tempPath
              }
            }
          } catch (err) {
            console.error('[InputBar] Failed to save dragged/pasted file to temp:', err)
          }
        }

        if (!resolvedPath && previewUrl) {
          resolvedPath = previewUrl
        }
        if (!resolvedPath) resolvedPath = f.name

        return {
          name: f.name,
          path: resolvedPath,
          size: f.size,
          type: f.type,
          previewUrl: previewUrl || (resolvedPath.startsWith('data:image/') ? resolvedPath : null)
        }
      })
    )

    setAttachedFiles((prev) => {
      const existingPaths = new Set(prev.map((p) => p.path))
      const unique = parsedFiles.filter((p) => !existingPaths.has(p.path))
      return [...prev, ...unique]
    })

    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 50)
  }

  const removeFile = (indexToRemove) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      addFiles(files)
    }
  }

  const handleFormSubmit = async () => {
    let finalPrompt = inputText
    let userText = inputText
    const skillMatches = inputText.match(/(?:\s|^)\/([a-zA-Z0-9_-]+)/g)

    if (skillMatches && skillMatches.length > 0 && window.api && window.api.readSkill) {
      let combinedSkillsContent = ''
      const loadedSkills = []

      for (const match of skillMatches) {
        const skillName = match.trim().substring(1) // Hilangkan spasi dan '/'

        // INTERCEPT BUILT-IN SKILLS
        const nativeSkill = NATIVE_SKILLS.find(
          (s) => s.name.toLowerCase() === skillName.toLowerCase()
        )
        if (nativeSkill) {
          combinedSkillsContent += `\n\n--- SKILL BAWAAN: ${skillName.toUpperCase()} ---\n${nativeSkill.content}`
          loadedSkills.push(skillName)
          userText = userText.replace(match, '')
          continue
        }

        try {
          const skillData = await window.api.readSkill(skillName)
          if (skillData) {
            // Support both old string format and new object format
            const content = typeof skillData === 'string' ? skillData : skillData.content
            const basePath =
              typeof skillData === 'object' && skillData.basePath ? skillData.basePath : ''

            combinedSkillsContent += `\n\n--- SKILL EXTERNAL: ${skillName.toUpperCase()} ---\n`
            if (basePath) {
              combinedSkillsContent += `[LOKASI ABSOLUT SKILL INI (Base Path): ${basePath}]\n\n`
            }
            combinedSkillsContent += `${content}`

            loadedSkills.push(skillName)
            userText = userText.replace(match, '') // Hapus slash command dari teks yang dilihat AI
          }
        } catch (e) {
          console.error('[InputBar] Failed to read skill:', skillName, e)
        }
      }

      userText = userText.trim()

      if (loadedSkills.length > 0) {
        finalPrompt = `${userText}\n\n=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===\nBerikut adalah instruksi skill khusus yang WAJIB kamu kombinasikan dan ikuti secara ketat untuk mengeksekusi permintaan di atas. Jika skill memiliki referensi sub-file, kamu BISA membacanya menggunakan tool "read-file" dengan menggabungkan "LOKASI ABSOLUT" di bawah ini beserta path relatifnya:\n${combinedSkillsContent}\n=========================================`
      }
    }

    const currentAttachments = [...attachedFiles]
    if (attachedFiles.length > 0) {
      const filePathsText = attachedFiles.map((f) => `"${f.path}"`).join(', ')
      if (finalPrompt.trim()) {
        finalPrompt = `${finalPrompt.trim()}\n\n[FILE TERLAMPIR]: ${filePathsText}`
      } else {
        finalPrompt = `Tolong proses/rangkum file terlampir ini.\n\n[FILE TERLAMPIR]: ${filePathsText}`
      }
      setAttachedFiles([])
    }

    if (finalPrompt.trim()) {
      if (!isLoading) {
        lastPromptRef.current = inputText
      }
      const rawUserText = inputText.trim()
      setInputText('')
      if (typeof onSubmit === 'function') {
        onSubmit(finalPrompt, {
          displayPrompt: rawUserText,
          attachedFiles: currentAttachments
        })
      }
    }
  }

  const handleEmojiClick = (emoji) => {
    setInputText((prev) => prev + emoji)
    setShowEmojiPicker(false)
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 50)
  }

  const fetchWorkspaceFiles = async (query = '') => {
    if (window.api && window.api.getWorkspaceFiles) {
      setIsLoadingFiles(true)
      try {
        const files = await window.api.getWorkspaceFiles(query, workspaceRoot)
        setWorkspaceFiles(files || [])
      } catch (err) {
        console.error('[InputBar] getWorkspaceFiles error:', err)
      } finally {
        setIsLoadingFiles(false)
      }
    }
  }

  const mentionDisplayItems = useMemo(() => {
    if (mentionCategory === 'all' && !mentionQuery.trim()) {
      return [
        {
          type: 'category',
          category: 'files',
          title: 'Files',
          subtitle: 'Cari berkas di workspace'
        },
        {
          type: 'category',
          category: 'tools',
          title: 'Tool Groups',
          subtitle: 'Kelompok kapabilitas tool agen'
        }
      ]
    }

    const q = mentionQuery.toLowerCase().trim()
    const items = []

    // 1. Tool Groups
    if (mentionCategory === 'all' || mentionCategory === 'tools') {
      const matchedTools = toolGroups
        .filter(
          (t) =>
            !q ||
            t.name.toLowerCase().includes(q) ||
            t.label.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        )
        .map((t) => ({
          type: 'tool',
          name: t.name,
          label: t.label,
          description: t.description
        }))
      items.push(...matchedTools)
    }

    // 2. Files
    if (mentionCategory === 'all' || mentionCategory === 'files') {
      const matchedFiles = workspaceFiles
        .filter(
          (f) => !q || f.name.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q)
        )
        .map((f) => ({
          type: 'file',
          name: f.name,
          relativePath: f.relativePath,
          absolutePath: f.absolutePath,
          size: f.size,
          ext: f.ext
        }))
      items.push(...matchedFiles)
    }

    return items
  }, [mentionCategory, mentionQuery, toolGroups, workspaceFiles])

  const selectMentionItem = (item) => {
    if (!item) return

    if (item.type === 'category') {
      setMentionCategory(item.category)
      setSelectedMentionIndex(0)
      if (item.category === 'files') {
        fetchWorkspaceFiles('')
      } else if (item.category === 'tools' && toolGroups.length === 0) {
        loadToolGroups()
      }
      if (inputRef.current) inputRef.current.focus()
      return
    }

    const val = inputText
    const beforeAt = val.slice(0, mentionCursorIndex)
    const afterMention = val.slice(mentionCursorIndex + 1 + mentionQuery.length)

    if (item.type === 'file') {
      const insertTag = `@${item.relativePath} `
      const nextText = `${beforeAt}${insertTag}${afterMention}`
      setInputText(nextText)

      // Lampirkan otomatis ke attachedFiles
      const newAttached = {
        name: item.name,
        path: item.absolutePath,
        size: item.size,
        type: item.ext ? `text/${item.ext.replace('.', '')}` : '',
        previewUrl: null
      }
      setAttachedFiles((prev) => {
        const exists = prev.some((f) => f.path === newAttached.path)
        return exists ? prev : [...prev, newAttached]
      })

      setShowMentionList(false)
      setMentionCategory('all')
      setMentionQuery('')
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = beforeAt.length + insertTag.length
          inputRef.current.focus()
          inputRef.current.setSelectionRange(newPos, newPos)
        }
      }, 50)
      return
    }

    if (item.type === 'tool') {
      const insertTag = `@${item.name} `
      const nextText = `${beforeAt}${insertTag}${afterMention}`
      setInputText(nextText)

      setShowMentionList(false)
      setMentionCategory('all')
      setMentionQuery('')
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = beforeAt.length + insertTag.length
          inputRef.current.focus()
          inputRef.current.setSelectionRange(newPos, newPos)
        }
      }, 50)
      return
    }
  }

  const handleTextChange = async (e) => {
    const val = e.target.value
    setInputText(val)

    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)

    // 1. Deteksi Slash Command (/):
    if (val.startsWith('/')) {
      const currentSkills = skills && skills.length > 0 ? skills : await reloadSkills()
      const query = val.slice(1).toLowerCase()
      const matches = currentSkills.filter((s) => s.name.toLowerCase().includes(query))
      setFilteredSkills(matches)
      setShowSkillList(true)
      setSelectedSkillIndex(0)
      setShowMentionList(false)
      return
    } else {
      setShowSkillList(false)
    }

    // 2. Deteksi Mention Tag (@):
    const atIndex = textBefore.lastIndexOf('@')
    if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBefore[atIndex - 1]))) {
      const afterAt = textBefore.slice(atIndex + 1)
      if (!/\s/.test(afterAt)) {
        if (toolGroups.length === 0) {
          loadToolGroups()
        }
        setShowMentionList(true)
        setMentionQuery(afterAt)
        setMentionCursorIndex(atIndex)
        setSelectedMentionIndex(0)
        fetchWorkspaceFiles(afterAt)
        return
      }
    }

    setShowMentionList(false)
    setMentionCategory('all')
  }

  const selectSkill = (skillObj) => {
    setInputText(`/${skillObj.name} `)
    setShowSkillList(false)
    if (inputRef.current) inputRef.current.focus()
  }

  const handleKeyDown = (e) => {
    // 1. Skill List Navigation
    if (showSkillList && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSkillIndex((prev) => (prev + 1) % filteredSkills.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectSkill(filteredSkills[selectedSkillIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowSkillList(false)
        return
      }
    }

    // 2. Mention (@) Navigation
    if (showMentionList && mentionDisplayItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex((prev) => (prev + 1) % mentionDisplayItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(
          (prev) => (prev - 1 + mentionDisplayItems.length) % mentionDisplayItems.length
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = mentionDisplayItems[selectedMentionIndex]
        if (selected) {
          selectMentionItem(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionList(false)
        setMentionCategory('all')
        return
      }
      if (e.key === 'Backspace' && mentionCategory !== 'all' && mentionQuery === '') {
        e.preventDefault()
        setMentionCategory('all')
        setSelectedMentionIndex(0)
        return
      }
    }

    // 3. Normal Send on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isSendDisabled) {
        handleFormSubmit()
      }
    }
  }

  const isSendDisabled = !inputText.trim() && attachedFiles.length === 0

  return (
    <div
      className={
        className
          ? className
          : inline
            ? 'w-full max-w-4xl mx-auto relative z-10'
            : 'fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50'
      }
    >
      {/* File Attachment Pills Preview */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto py-1 px-2 no-scrollbar animate-[holo-project-in_0.2s_ease-out_forwards]">
          {attachedFiles.map((file, idx) => (
            <div
              key={file.path + idx}
              className="flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-full px-3 py-1.5 text-xs text-white shadow-lg animate-fade-in group hover:border-primary/50 transition-all flex-shrink-0"
            >
              {file.previewUrl ? (
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  className="w-4.5 h-4.5 rounded-full object-cover border border-white/20 shrink-0"
                />
              ) : (
                <span className="text-sm shrink-0">{getFileIcon(file.name)}</span>
              )}
              <span className="max-w-[140px] truncate font-medium">{file.name}</span>
              {file.size > 0 && (
                <span className="text-[10px] text-white/40">{formatFileSize(file.size)}</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="text-white/40 hover:text-error hover:bg-error/20 p-1 rounded-full transition-all cursor-pointer"
                title="Hapus Lampiran"
              >
                <FaTimes size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Workspace Root Active Indicator Pill */}
      {workspaceRoot && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1 bg-base-200/80 border border-primary/30 rounded-lg text-xs text-white/80 w-fit backdrop-blur-md animate-fade-in shadow-md">
          <FaFolder className="text-primary text-xs" />
          <span className="text-[10px] text-primary uppercase font-bold tracking-wider">
            Workspace:
          </span>
          <span className="font-mono text-[11px] truncate max-w-xs">{workspaceRoot}</span>
          {onSelectWorkspace && (
            <button
              type="button"
              onClick={onSelectWorkspace}
              className="ml-1 text-[10px] text-white/50 hover:text-primary transition-colors cursor-pointer underline"
              title="Ganti folder proyek"
            >
              Ganti
            </button>
          )}
        </div>
      )}

      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleFormSubmit()
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center bg-[var(--glass-bg)] border rounded-lg p-2 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-colors duration-300 focus-within:border-primary/50 focus-within:shadow-[0_0_20px_oklch(var(--p)/0.2)] ${
          isDragging
            ? 'border-primary bg-primary/10 shadow-[0_0_30px_oklch(var(--p)/0.3)] scale-[1.02]'
            : 'border-[var(--glass-border)]'
        }`}
      >
        {/* Drag & Drop Overlay Indicator */}
        {isDragging && (
          <div className="absolute inset-0 rounded-lg bg-primary/20 backdrop-blur-md border-2 border-dashed border-primary flex items-center justify-center z-50 pointer-events-none text-white font-medium gap-2 animate-pulse">
            <FaPaperclip className="animate-bounce" size={20} />
            <span>Lepaskan file di sini untuk melampirkan...</span>
          </div>
        )}

        {/* Workspace Root Folder Button */}
        {onSelectWorkspace && (
          <button
            type="button"
            onClick={onSelectWorkspace}
            className={`p-3 rounded-full transition-all flex-shrink-0 relative ${
              workspaceRoot
                ? 'text-primary hover:text-primary hover:bg-primary/10'
                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            }`}
            title={
              workspaceRoot
                ? `Workspace Root: ${workspaceRoot} (Klik untuk ganti)`
                : 'Atur Folder Proyek (Workspace Root)'
            }
          >
            <FaFolder size={16} />
            {workspaceRoot && (
              <span className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-primary ring-1 ring-base-300" />
            )}
          </button>
        )}

        {/* Paperclip File Upload Button */}
        <button
          type="button"
          onClick={handlePaperclipClick}
          className="p-3 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-all flex-shrink-0"
          title="Lampirkan File (PDF, DOCX, TXT, MD, Gambar, dll)"
        >
          <FaPaperclip size={16} />
        </button>

        {/* Mic / Record Toggle (Hold to talk) */}
        <button
          type="button"
          onClick={isRecording ? onStopRecord : onStartRecord}
          disabled={isProcessing || isLoading}
          className={`relative p-3 md:p-4 rounded-full flex-shrink-0 transition-all duration-300 transform outline-none z-10 ${
            isProcessing
              ? 'text-primary bg-primary/20 cursor-wait'
              : isLoading
                ? 'text-white/20 bg-white/5 cursor-not-allowed'
                : isRecording
                  ? 'text-error bg-error/20'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
          style={{
            transform: isRecording && !isProcessing ? `scale(${1 + audioIntensity * 0.3})` : '',
            boxShadow:
              isRecording && !isProcessing
                ? `0 0 ${10 + audioIntensity * 40}px rgba(255,0,0, ${0.3 + audioIntensity * 0.5})`
                : ''
          }}
          title={
            isProcessing
              ? 'Sedang memproses suara...'
              : isLoading
                ? 'Agen sedang sibuk'
                : 'Mulai/Berhenti Rekam (Ctrl+Alt+M)'
          }
        >
          {isRecording && !isProcessing && (
            <div
              className="absolute inset-0 rounded-full bg-error/30 -z-10"
              style={{ transform: `scale(${1 + audioIntensity * 0.8})` }}
            />
          )}
          {isProcessing ? (
            <span className="loading loading-spinner w-[18px] h-[18px]"></span>
          ) : isLoading ? (
            <FaLock size={18} />
          ) : (
            <FaMicrophone size={18} />
          )}
        </button>

        {/* Emoji Button */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-3 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-all"
            title="Insert Emoji"
          >
            <FaSmile size={18} />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-4 bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-2xl p-2 shadow-2xl flex flex-wrap w-52 gap-1 z-[100] animate-[holo-project-in_0.2s_ease-out_forwards]">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl text-2xl transition-all hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Skill Autocomplete Dropdown */}
        {showSkillList && filteredSkills.length > 0 && (
          <div className="absolute bottom-full left-12 mb-2 w-[400px] bg-base-300/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 animate-fade-in">
            <div className="p-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-white/5">
              Available Skills
            </div>
            <div ref={skillListRef} className="max-h-64 overflow-y-auto no-scrollbar">
              {filteredSkills.map((skillObj, idx) => (
                <div
                  key={skillObj.name}
                  onClick={() => selectSkill(skillObj)}
                  className={`px-4 py-3 cursor-pointer transition-colors flex flex-col gap-1 border-b border-white/5 last:border-0 ${
                    idx === selectedSkillIndex
                      ? 'bg-primary-500/20 text-primary-400'
                      : 'hover:bg-white/10 text-gray-300'
                  }`}
                >
                  <div className="font-semibold text-sm">/{skillObj.name}</div>
                  <div
                    className={`text-xs ${idx === selectedSkillIndex ? 'text-primary-400/80' : 'text-gray-400'} line-clamp-2`}
                  >
                    {skillObj.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mention (@) Autocomplete Dropdown */}
        {showMentionList && (mentionDisplayItems.length > 0 || isLoadingFiles) && (
          <div className="absolute bottom-full left-4 mb-2 w-[380px] max-w-[calc(100vw-2rem)] bg-base-300/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 animate-fade-in flex flex-col">

            {/* Items List */}
            <div ref={mentionListRef} className="max-h-64 overflow-y-auto no-scrollbar">
              {mentionDisplayItems.length === 0 && !isLoadingFiles ? (
                <div className="py-3 text-center text-xs text-gray-400">Tidak ada yang cocok.</div>
              ) : (
                mentionDisplayItems.map((item, idx) => (
                  <div
                    key={
                      item.type === 'category'
                        ? item.category
                        : item.type === 'file'
                          ? item.absolutePath
                          : item.name
                    }
                    onClick={() => selectMentionItem(item)}
                    className={`px-3 py-1.5 cursor-pointer transition-colors rounded-lg flex items-center gap-2.5 ${
                      idx === selectedMentionIndex
                        ? 'bg-primary/20 text-primary'
                        : 'hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    {/* Inline Icon */}
                    <div className="shrink-0 text-sm opacity-80">
                      {item.type === 'category' ? (
                        item.category === 'files' ? (
                          <Folder size={15} />
                        ) : (
                          <Wrench size={15} />
                        )
                      ) : item.type === 'file' ? (
                        getFileIcon(item.name)
                      ) : (
                        <Wrench size={15} />
                      )}
                    </div>

                    {/* Text Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">
                        {item.type === 'category'
                          ? item.title
                          : item.type === 'file'
                            ? item.relativePath
                            : `@${item.name}`}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {item.type === 'category'
                          ? item.subtitle
                          : item.type === 'file'
                            ? formatFileSize(item.size)
                            : item.description || item.label}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Input Textarea */}
        <textarea
          ref={inputRef}
          rows={1}
          value={inputText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            isLoading
              ? 'Beri intervensi ke Mark...'
              : attachedFiles.length > 0
                ? 'Tambah instruksi untuk file terlampir...'
                : 'Tanya apapun ke Mark...'
          }
          className="flex-1 resize-none bg-transparent border-none outline-none text-white px-3 py-2.5 text-sm md:text-base leading-normal placeholder:text-white/30 disabled:opacity-50 no-scrollbar"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Auto Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleAutoMode}
            className={`relative flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono transition-all duration-200 cursor-pointer select-none outline-none btn btn-circle ${
              isAutoMode
                ? 'bg-warning/20 text-warning border border-warning/40 font-semibold'
                : 'text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent font-normal'
            }`}
            title={
              isAutoMode
                ? 'Auto Mode: AKTIF. Semua persetujuan tool otomatis diizinkan untuk sesi ini.'
                : 'Auto Mode: NONAKTIF. Klik untuk otomatis menyetujui semua tool di sesi ini.'
            }
          >
            <Zap className={`w-3 h-3 ${isAutoMode ? 'fill-white text-white' : ''}`} />
          </button>

          {/* Ring Gauge Context Indicator (~30px) */}
          {(() => {
            const pct = Math.min(100, Math.max(0, contextTracker.percentage || 0))
            const roundedPct =
              contextTracker.currentChars > 0 ? Math.max(1, Math.round(pct)) : Math.round(pct)
            const radius = 14
            const circumference = 2 * Math.PI * radius
            const strokeDashoffset = circumference - (pct / 100) * circumference
            const colorClass =
              pct >= 85 ? 'stroke-rose-500' : pct >= 50 ? 'stroke-amber-400' : 'stroke-emerald-400'
            const barColorClass =
              pct >= 85 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-400' : 'bg-emerald-400'

            return (
              <div className="relative flex items-center justify-center px-1 select-none">
                {/* Ring Gauge Trigger Button */}
                <div
                  ref={gaugeRef}
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowContextPopover((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setShowContextPopover((prev) => !prev)
                  }}
                  className="relative w-[30px] h-[30px] flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110 group/gauge outline-none"
                  title="Context Window Info (Dual-Layer Hermes Compressor)"
                >
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r={radius}
                      className="stroke-white/10"
                      strokeWidth="2.5"
                      fill="none"
                    />
                    {pct > 0 && (
                      <circle
                        cx="18"
                        cy="18"
                        r={radius}
                        className={`${colorClass} transition-all duration-500 ease-out`}
                        strokeWidth="2.5"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="none"
                      />
                    )}
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-bold text-white/80 group-hover/gauge:text-white tracking-tight leading-none pointer-events-none">
                    {roundedPct}%
                  </span>
                </div>

                {/* Popover Card Overlay */}
                {showContextPopover && (
                  <div
                    ref={contextPopoverRef}
                    className="absolute bottom-full right-0 mb-3.5 w-64 p-3.5 bg-base-200 border border-primary/30 rounded-xl shadow-2xl z-50 animate-fade-in text-left cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium text-white/40 mb-0.5">
                      <span>Session Info</span>
                      <span className="text-[9px] uppercase tracking-wider text-primary font-bold">
                        In-Place
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white mb-2.5">Context Window</div>

                    <div className="flex items-center justify-between text-xs font-semibold mb-1.5 font-mono">
                      <span className="text-white">
                        {contextTracker.currentChars >= 1000
                          ? `${(contextTracker.currentChars / 1000).toFixed(1)}K`
                          : contextTracker.currentChars}{' '}
                        / 525K chars
                      </span>
                      <span className="text-white/60">{roundedPct}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-1.5">
                      <div
                        className={`h-full ${barColorClass} transition-all duration-300 rounded-full`}
                        style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
                      />
                    </div>

                    <div className="text-[10px] text-white/40 mb-2 font-mono">
                      {pct >= 85
                        ? 'Gateway Hygiene Active (>=85%)'
                        : pct >= 50
                          ? 'In-Loop Compressor Guard (>=50%)'
                          : 'Optimal Context Load'}
                    </div>

                    {/* Compact Conversation Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowContextPopover(false)
                        if (typeof onManualCompact === 'function') {
                          onManualCompact()
                        } else {
                          window.dispatchEvent(new CustomEvent('request-manual-compaction'))
                        }
                      }}
                      disabled={isLoading}
                      className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 border border-primary/30 text-xs font-medium text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>Compact Conversation</span>
                    </button>

                    {/* Caret pointing to gauge */}
                    <div className="absolute -bottom-1.5 right-3.5 w-3 h-3 bg-base-200 border-r border-b border-primary/30 rotate-45" />
                  </div>
                )}
              </div>
            )
          })()}

          {isLoading && (
            <button
              type="button"
              onClick={() => setShowAbortConfirm(true)}
              className="p-3 rounded-full bg-error/20 text-error hover:bg-error hover:text-white transition-all"
              title="Stop Generation (Hard Abort)"
            >
              <FaStop size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={isSendDisabled}
            className="p-3 rounded-full bg-success text-success-content disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30 hover:bg-success/80 hover:scale-105 active:scale-95 transition-all"
            title="Send Message"
          >
            <FaArrowUp size={16} />
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={showAbortConfirm}
        title="Hard Abort Proses?"
        message="Yakin mau memberhentikan proses Mark secara paksa? Tindakan ini akan menghentikan secara langsung semua alat yang sedang berjalan dan memutuskan koneksi ke otak AI-nya seketika."
        confirmText="Berhentikan"
        cancelText="Batal"
        isError={true}
        onConfirm={() => {
          setShowAbortConfirm(false)
          if (lastPromptRef.current) {
            setInputText(lastPromptRef.current)
          }
          if (onStop) onStop()
        }}
        onCancel={() => setShowAbortConfirm(false)}
      />
    </div>
  )
}

export default memo(InputBar)
