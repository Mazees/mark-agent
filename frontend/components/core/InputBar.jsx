import React, { useRef, useEffect, useState } from 'react'
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
import ConfirmModal from './ConfirmModal'
import { NATIVE_SKILLS } from './native-skills'

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
    return <FaFileImage className="text-accent" />
  if (['pdf'].includes(ext)) return <FaFilePdf className="text-error" />
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp', 'cs'].includes(ext))
    return <FaFileCode className="text-info" />
  return <FaFileAlt className="text-primary" />
}

const InputBar = ({
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
  onSelectWorkspace = null
}) => {
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [inputText, setInputText] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const lastPromptRef = useRef('')

  const [skills, setSkills] = useState([])
  const [filteredSkills, setFilteredSkills] = useState([])
  const [showSkillList, setShowSkillList] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)

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

  const addFiles = async (newFiles) => {
    const parsedFiles = await Promise.all(
      newFiles.map(async (f) => {
        let resolvedPath = ''
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

        if (!isRealDiskPath && f.path && f.path !== f.name && (f.path.includes('/') || f.path.includes('\\'))) {
          resolvedPath = f.path
        }

        // Jika file berasal dari drag & drop web / memory tanpa local path asli
        if (
          (!resolvedPath ||
            resolvedPath === f.name ||
            (!resolvedPath.includes('/') && !resolvedPath.includes('\\'))) &&
          window.api?.saveTempFile
        ) {
          try {
            const buffer = await f.arrayBuffer()
            if (buffer && buffer.byteLength > 0) {
              const tempPath = await window.api.saveTempFile(buffer, f.name)
              if (tempPath) {
                resolvedPath = tempPath
              }
            }
          } catch (err) {
            console.error('[InputBar] Failed to save dragged file to temp:', err)
          }
        }

        if (!resolvedPath) resolvedPath = f.name

        return {
          name: f.name,
          path: resolvedPath,
          size: f.size,
          type: f.type
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
        const nativeSkill = NATIVE_SKILLS.find(s => s.name.toLowerCase() === skillName.toLowerCase())
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
            const basePath = typeof skillData === 'object' && skillData.basePath ? skillData.basePath : ''

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
      setInputText('')
      if (typeof onSubmit === 'function') {
        onSubmit(finalPrompt)
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

  const handleTextChange = async (e) => {
    const val = e.target.value
    setInputText(val)
    
    if (val.startsWith('/')) {
      const currentSkills = (skills && skills.length > 0) ? skills : await reloadSkills()
      const query = val.slice(1).toLowerCase()
      const matches = currentSkills.filter(s => s.name.toLowerCase().includes(query))
      setFilteredSkills(matches)
      setShowSkillList(true)
      setSelectedSkillIndex(0)
    } else {
      setShowSkillList(false)
    }
  }

  const selectSkill = (skillObj) => {
    setInputText(`/${skillObj.name} `)
    setShowSkillList(false)
    if (inputRef.current) inputRef.current.focus()
  }

  const handleKeyDown = (e) => {
    if (showSkillList && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSkillIndex(prev => (prev + 1) % filteredSkills.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSkillIndex(prev => (prev - 1 + filteredSkills.length) % filteredSkills.length)
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
              <span className="text-sm">{getFileIcon(file.name)}</span>
              <span className="max-w-[140px] truncate font-medium">{file.name}</span>
              {file.size > 0 && (
                <span className="text-[10px] text-white/40">{formatFileSize(file.size)}</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="text-white/40 hover:text-error hover:bg-error/20 p-1 rounded-full transition-all"
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
          <span className="text-[10px] text-primary uppercase font-bold tracking-wider">Workspace:</span>
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
            title={workspaceRoot ? `Workspace Root: ${workspaceRoot} (Klik untuk ganti)` : 'Atur Folder Proyek (Workspace Root)'}
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
            boxShadow: isRecording && !isProcessing ? `0 0 ${10 + audioIntensity * 40}px rgba(255,0,0, ${0.3 + audioIntensity * 0.5})` : ''
          }}
          title={isProcessing ? 'Sedang memproses suara...' : isLoading ? 'Agen sedang sibuk' : 'Mulai/Berhenti Rekam (Ctrl+Alt+M)'}
        >
          {isRecording && !isProcessing && (
            <div 
              className="absolute inset-0 rounded-full bg-error/30 -z-10 transition-transform duration-75"
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
            <div className="max-h-64 overflow-y-auto no-scrollbar">
              {filteredSkills.map((skillObj, idx) => (
                <div
                  key={skillObj.name}
                  onClick={() => selectSkill(skillObj)}
                  className={`px-4 py-3 cursor-pointer transition-colors flex flex-col gap-1 border-b border-white/5 last:border-0 ${
                    idx === selectedSkillIndex 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'hover:bg-white/10 text-gray-300'
                  }`}
                >
                  <div className="font-semibold text-sm">/{skillObj.name}</div>
                  <div className={`text-xs ${idx === selectedSkillIndex ? 'text-emerald-400/80' : 'text-gray-400'} line-clamp-2`}>
                    {skillObj.description}
                  </div>
                </div>
              ))}
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

export default InputBar
