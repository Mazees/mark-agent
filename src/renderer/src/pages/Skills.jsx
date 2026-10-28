import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, FileText, Upload, RefreshCw, Search, FolderInput } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { webApi } from '../api/web-bridge'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [query, setQuery] = useState('')
  const [newSkillName, setNewSkillName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [migration, setMigration] = useState(null)
  const [migrationReport, setMigrationReport] = useState(null)
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const createButtonRef = useRef(null)
  const requestRef = useRef(0)
  const navigate = useNavigate()
  const cancelRequests = useCallback(() => {
    requestRef.current++
  }, [])

  const loadSkills = useCallback(async () => {
    const request = ++requestRef.current
    setRefreshing(true)
    try {
      const [list, status] = await Promise.all([
        webApi.getSkills(),
        webApi.getSkillMigrationStatus()
      ])
      if (!Array.isArray(list)) throw new Error('Daftar skill belum dapat dimuat.')
      if (request === requestRef.current) {
        setSkills(list)
        setMigration(status)
      }
    } catch (failure) {
      if (request === requestRef.current)
        setError(failure.message || 'Daftar skill belum dapat dimuat.')
    } finally {
      if (request === requestRef.current) {
        setRefreshing(false)
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadSkills()
    const unsubscribe = webApi.onSkillsUpdated(loadSkills)
    return () => {
      cancelRequests()
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [loadSkills, cancelRequests])

  useEffect(() => {
    if (creating) nameInputRef.current?.focus()
  }, [creating])

  const visibleSkills = useMemo(() => {
    const term = query.trim().toLowerCase()
    return skills
      .filter((skill) =>
        [skill.name, skill.folderName, skill.description].join(' ').toLowerCase().includes(term)
      )
      .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'id'))
  }, [skills, query])

  const closeCreate = () => {
    setCreating(false)
    setNewSkillName('')
    setError('')
    createButtonRef.current?.focus()
  }

  const handleCreateNew = async (event) => {
    event.preventDefault()
    if (busy) return
    const name = newSkillName.trim().replace(/\s+/g, '-').toLowerCase()
    setError('')
    setNotice('')
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      setError('Gunakan huruf, angka, tanda hubung, atau garis bawah untuk nama skill.')
      nameInputRef.current?.focus()
      return
    }
    if (skills.some((skill) => (skill.folderName || skill.name).toLowerCase() === name)) {
      setError('Nama skill sudah digunakan. Pilih nama lain agar skill yang ada tidak tertimpa.')
      nameInputRef.current?.focus()
      return
    }
    setBusy('create')
    try {
      const template = `---
name: ${name}
description: Jelaskan kemampuan skill dan kapan Mark perlu menggunakannya.
author: User
tags: []
---

# ${name}

Tulis instruksi yang perlu diikuti Mark di sini.

## Langkah kerja

- Jelaskan langkah yang perlu dilakukan.
- Sertakan cara memeriksa hasilnya.

## Batasan

- Tuliskan batasan khusus jika diperlukan.
`
      const result = await webApi.saveSkillFile(name, 'SKILL.md', template)
      if (!result?.success) throw new Error(result?.error || 'Skill belum dapat dibuat.')
      navigate(`/skill-editor/${encodeURIComponent(name)}`)
    } catch (failure) {
      setError(failure.message || 'Skill belum dapat dibuat.')
    } finally {
      setBusy(null)
    }
  }

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0]
    if (!file || busy) return
    setBusy('install')
    setError('')
    setNotice('')
    try {
      const result = await webApi.installSkill(file)
      if (!result?.success) throw new Error(result?.error || 'Skill belum dapat diinstal.')
      await loadSkills()
      setNotice('Skill berhasil diinstal. Pilih skill untuk melihat atau mengubah instruksinya.')
    } catch (failure) {
      setError(failure.message || 'Skill belum dapat diinstal.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setBusy(null)
    }
  }

  const handleMigration = async () => {
    if (busy || !migration?.pending) return
    setBusy('migrate')
    setError('')
    setNotice('')
    setMigrationReport(null)
    try {
      const report = await webApi.migrateSkills()
      setMigrationReport(report)
      await loadSkills()
      setNotice(`${report.migrated.length} skill dipindahkan ke folder bersama.`)
    } catch (failure) {
      setError(failure.message || 'Migrasi skill belum berhasil.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <div className="mx-auto max-w-5xl px-5 py-7 pb-28 sm:px-8 sm:py-10 sm:pb-28">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 rounded-sm text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        >
          <ArrowLeft size={17} aria-hidden="true" /> Kembali
        </Link>

        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-white">Skills</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              Kelola instruksi dan cara kerja khusus yang dapat digunakan Mark.
            </p>
          </div>
          <label className="relative block w-full sm:w-72 sm:shrink-0">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              aria-hidden="true"
            />
            <input
              aria-label="Cari skill"
              placeholder="Cari skill..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-full border border-white/15 bg-transparent pl-10 pr-4 text-sm outline-none focus:border-primary/60"
            />
          </label>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            ref={createButtonRef}
            type="button"
            className="btn rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
            disabled={!!busy || loading}
            aria-expanded={creating}
            aria-controls="create-skill"
            onClick={() => {
              setError('')
              setNotice('')
              if (creating) closeCreate()
              else setCreating(true)
            }}
          >
            <Plus size={16} aria-hidden="true" /> Buat skill
          </button>
          <button
            type="button"
            className="btn btn-ghost rounded-full px-4"
            disabled={!!busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
            {busy === 'install' ? 'Menginstal...' : 'Install ZIP'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".zip"
            className="hidden"
            aria-label="Pilih paket skill ZIP"
            disabled={!!busy}
          />
          <button
            type="button"
            className="btn btn-ghost rounded-full px-4"
            disabled={!!busy || refreshing}
            onClick={() => {
              setError('')
              setNotice('')
              loadSkills()
            }}
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
              aria-hidden="true"
            />
            Muat ulang
          </button>
        </div>

        <section aria-labelledby="skill-location" className="mt-8 border-y border-white/10 py-5">
          <h2 id="skill-location" className="text-sm font-medium text-white/75">
            Lokasi skill
          </h2>
          <p className="mt-2 break-all text-sm text-white/55">
            {migration?.directory || '~/.agents/skills'}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/45">
            Skill baru disimpan di folder bersama ini. Perubahan melalui Mark juga berlaku untuk
            agent lain yang membaca folder yang sama.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-ghost rounded-full px-4"
              onClick={handleMigration}
              disabled={!!busy || !migration?.pending}
            >
              <FolderInput size={16} aria-hidden="true" />
              {busy === 'migrate' ? 'Memindahkan...' : 'Migrasi skill lama'}
            </button>
            {migration && (
              <span className="text-xs text-white/45">
                {migration.pending
                  ? `${migration.pending} skill di folder lama`
                  : 'Tidak ada skill yang perlu dimigrasikan.'}
              </span>
            )}
          </div>
          {!!migration?.pending && (
            <p className="mt-2 break-words text-xs leading-relaxed text-white/40">
              Dari {migration.source}. Nama yang bentrok dilewati dan tetap tersimpan di folder
              lama.
            </p>
          )}
          {!!migrationReport?.conflicts.length && (
            <p role="status" className="mt-3 break-words text-sm text-white/60">
              Belum dipindahkan karena nama sudah digunakan: {migrationReport.conflicts.join(', ')}.
            </p>
          )}
          {!!migrationReport?.failed.length && (
            <ul role="alert" className="mt-3 space-y-1 text-sm text-error">
              {migrationReport.failed.map((item) => (
                <li key={item.name} className="break-words">
                  {item.name}: {item.error}
                </li>
              ))}
            </ul>
          )}
        </section>

        {creating && (
          <form
            id="create-skill"
            onSubmit={handleCreateNew}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) closeCreate()
            }}
            className="mt-6 border-y border-white/10 py-6"
          >
            <label htmlFor="skill-name" className="block text-sm font-medium text-white/85">
              Nama skill
            </label>
            <p id="skill-name-hint" className="mt-2 text-sm leading-relaxed text-white/50">
              Contoh: penulis-artikel. Setelah dibuat, isi instruksinya di editor.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="skill-name"
                ref={nameInputRef}
                type="text"
                required
                autoComplete="off"
                aria-describedby="skill-name-hint"
                className="h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none focus:border-primary/60"
                value={newSkillName}
                onChange={(event) => setNewSkillName(event.target.value)}
                disabled={!!busy}
              />
              <button
                type="submit"
                className="btn rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
                disabled={!!busy || !newSkillName.trim()}
              >
                {busy === 'create' ? 'Membuat...' : 'Buat dan buka editor'}
              </button>
              <button
                type="button"
                className="btn btn-ghost rounded-full px-4"
                disabled={!!busy}
                onClick={closeCreate}
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-5 text-sm leading-relaxed text-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-5 text-sm leading-relaxed text-primary">
            {notice}
          </p>
        )}

        <section
          aria-labelledby="installed-skills"
          aria-busy={loading || refreshing}
          className="mt-12"
        >
          <h2 id="installed-skills" className="mb-5 text-sm font-medium text-white/75">
            Terpasang {!loading && <span className="ml-1 text-white/40">{skills.length}</span>}
          </h2>
          {loading ? (
            <p role="status" className="py-8 text-sm text-white/45">
              Memuat skill...
            </p>
          ) : visibleSkills.length ? (
            <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2">
              {visibleSkills.map((skill) => (
                <Link
                  key={skill.folderName || skill.name}
                  to={`/skill-editor/${encodeURIComponent(skill.folderName || skill.name)}`}
                  className="flex min-w-0 items-start gap-4 rounded-lg px-5 py-5 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10">
                    <FileText size={24} className="text-primary" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-white">
                      {skill.name}
                    </span>
                    <span className="mt-1.5 line-clamp-2 break-words text-sm leading-relaxed text-white/50">
                      {skill.description || 'Belum ada deskripsi.'}
                    </span>
                    <span className="mt-2 block break-all text-xs text-white/35">
                      {skill.skillFile || skill.path}
                    </span>
                    {skill.allowImplicitInvocation === false && (
                      <span className="mt-1 block text-xs text-white/45">
                        Aktif melalui pemilihan eksplisit
                      </span>
                    )}
                    {skill.metadataWarnings?.map((warning) => (
                      <span key={warning} className="mt-1 block text-xs text-warning">
                        {warning}
                      </span>
                    ))}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p role="status" className="py-8 text-sm leading-relaxed text-white/45">
              {query.trim()
                ? `Tidak ada skill yang cocok dengan “${query}”.`
                : 'Belum ada skill terpasang. Buat skill baru atau install dari paket ZIP.'}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
