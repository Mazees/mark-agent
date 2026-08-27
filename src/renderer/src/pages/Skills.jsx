import { useState, useEffect, useRef } from 'react'
import { Plus, FileText, Upload, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { webApi } from '../api/web-bridge'

const Skills = () => {
  const [skills, setSkills] = useState([])
  const [newSkillName, setNewSkillName] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const loadSkills = async () => {
    try {
      setIsRefreshing(true)
      const list = await webApi.getSkills()
      setSkills(list)
    } catch (e) {
      console.error(e)
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  useEffect(() => {
    loadSkills()
    const unsub = webApi.onSkillsUpdated(() => {
      loadSkills()
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const handleCreateNew = async () => {
    if (!newSkillName.trim()) return
    const name = newSkillName.trim().replace(/\s+/g, '-').toLowerCase()
    try {
      const template = `---
name: ${name}
description: Tulis deskripsi singkat tentang skill ini...
author: User
tags: []
---

# Skill: ${name}

Tulis instruksi mendetail untuk AI di sini...
- Gunakan format checklist [ ] jika ada langkah-langkah.
- Tambahkan blok Critical Rules untuk batasan mutlak.
`
      await webApi.saveSkillFile(name, 'SKILL.md', template)
      setNewSkillName('')
      navigate(`/skill-editor/${name}`)
    } catch (e) {
      console.error(e)
    }
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsRefreshing(true)
      const result = await webApi.installSkill(file)
      if (result.success) {
        await loadSkills()
      } else {
        alert(result.error || 'Gagal menginstal skill package.')
      }
    } catch (err) {
      console.error(err)
      alert('Gagal mengunggah dan menginstal skill: ' + err.message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setIsRefreshing(false)
    }
  }

  return (
    <div className="h-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Hidden File Input for ZIP Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".zip"
        className="hidden"
      />

      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-32 space-y-8">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn btn-ghost btn-sm btn-circle shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.2em"
                  height="1.2em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold">Mark Skills</h1>
                <p className="opacity-50 text-sm mt-1">
                  Daftar kemampuan kustom AI yang diinstal via Markdown.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost btn-sm btn-circle"
                onClick={loadSkills}
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Refresh Skills"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <button
                className="btn btn-outline btn-success btn-sm gap-2"
                onClick={() => fileInputRef.current?.click()}
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <Upload size={14} /> Install Skill (.zip)
              </button>
            </div>
          </div>

          {/* Form Create New */}
          <section className="space-y-5">
            <div className="card bg-base-100/50 backdrop-blur-xl border border-base-content/10 shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-base font-bold uppercase tracking-wider opacity-70">
                  Buat Skill Baru
                </h2>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Nama skill (cth: copywriter)..."
                    className="input input-bordered w-full bg-base-200/50"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
                  />
                  <button className="btn btn-primary gap-2" onClick={handleCreateNew}>
                    <Plus size={16} /> Buat
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Grid List */}
          <section className="space-y-5">
            <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
              Installed Skills
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {skills.map((skillObj) => {
                const targetKey = skillObj.folderName || skillObj.name
                return (
                  <div
                    key={targetKey}
                    className="card bg-base-100/50 backdrop-blur-xl border border-base-content/10 shadow-xl hover:border-primary/30 transition-all cursor-pointer group"
                    onClick={() => navigate(`/skill-editor/${targetKey}`)}
                  >
                    <div className="card-body p-5">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-base-200 rounded-xl group-hover:text-primary transition-colors">
                          <FileText size={24} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                            {skillObj.name}
                          </h3>
                          <p className="text-xs opacity-70 mt-1 line-clamp-2">
                            {skillObj.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {skills.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center p-12 text-base-content/50 border border-dashed border-base-content/10 rounded-2xl bg-base-100/20">
                  <FileText size={48} className="opacity-20 mb-4" />
                  <p className="text-lg font-medium">Belum ada skill.</p>
                  <p className="text-sm opacity-60">Install dari file .zip atau buat baru di atas!</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Skills
