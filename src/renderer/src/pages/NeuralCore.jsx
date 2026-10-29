import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Download,
  GraduationCap,
  Network,
  RefreshCw,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import {
  getRelationship,
  getAllLearnedSkills,
  deleteLearnedSkill,
  getAllChatArchives,
  getAllMemory,
  deleteMemory,
  deleteChatArchive,
  resetAiDatabase,
  exportDatabaseDump,
  restoreDatabaseDump
} from '../api/db'
import { webApi } from '../api/web-bridge'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { EmotionalCortexLobe } from '../components/neural-core/EmotionalCortexLobe'
import { SynapticMemoryLobe } from '../components/neural-core/SynapticMemoryLobe'
import { ProceduralMatrixLobe } from '../components/neural-core/ProceduralMatrixLobe'
import { ProceduralSkillModal } from '../components/neural-core/ProceduralSkillModal'
import { NodeDissectionModal } from '../components/neural-core/NodeDissectionModal'
import { ResetAiModal } from '../components/neural-core/ResetAiModal'
import NeuralDialog from '../components/neural-core/NeuralDialog'
import { buildMemoryGraph, neuralTab } from '../components/neural-core/neuralCoreData'
import { describePersonality } from '../components/neural-core/traitMeta'

const tabs = {
  overview: 'Ringkasan',
  personality: 'Karakter',
  memory: 'Memori',
  skills: 'Skill dipelajari',
  data: 'Kelola data'
}
const emptyData = { traits: null, skills: [], archives: [], memories: [], diskSkills: [] }

export default function NeuralCore() {
  const [params, setParams] = useSearchParams()
  const activeTab = neuralTab(params.get('tab'))
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [skillSearch, setSkillSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreError, setRestoreError] = useState('')
  const fileInput = useRef(null)
  const mounted = useRef(false)
  const revision = useRef(0)
  const reloadTimer = useRef(null)
  const { isGrooming, groomResult, triggerGrooming } = useMemoryGroomer(false)
  const notify = (text, error = false) => {
    if (mounted.current) setNotice({ text, error })
  }
  const loadData = useCallback(async () => {
    if (!mounted.current) return
    const current = ++revision.current
    setRefreshing(true)
    try {
      const [traits, skills, archives, memories, diskSkills] = await Promise.all([
        getRelationship('owner'),
        getAllLearnedSkills(),
        getAllChatArchives(),
        getAllMemory(),
        webApi.getSkills()
      ])
      if (!mounted.current || current !== revision.current) return
      setData({
        traits,
        skills: Array.isArray(skills) ? skills : [],
        archives: Array.isArray(archives) ? archives : [],
        memories: Array.isArray(memories) ? memories : [],
        diskSkills: Array.isArray(diskSkills) ? diskSkills : []
      })
      setLoadError('')
    } catch (failure) {
      if (mounted.current && current === revision.current)
        setLoadError(failure.message || 'Data Neural Core belum dapat dimuat.')
    } finally {
      if (mounted.current && current === revision.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    loadData()
    window.addEventListener('relationship-updated', loadData)
    return () => {
      mounted.current = false
      window.removeEventListener('relationship-updated', loadData)
      clearTimeout(reloadTimer.current)
    }
  }, [loadData])
  const changeTab = (tab) => {
    setNotice(null)
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', tab)
      return next
    })
  }
  const graphData = useMemo(() => buildMemoryGraph(data), [data])
  const working = exporting || restoring || resetting || isGrooming
  const download = async () => {
    if (working) return
    setExporting(true)
    setNotice(null)
    try {
      const dump = window.api?.exportDatabase
        ? await window.api.exportDatabase()
        : await exportDatabaseDump()
      if (!dump || dump.success === false)
        throw new Error(dump?.error || 'Cadangan database belum dapat dibuat.')
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `mark-full-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('File cadangan JSON telah disiapkan untuk diunduh.')
    } catch (failure) {
      notify(failure.message, true)
    } finally {
      if (mounted.current) setExporting(false)
    }
  }
  const selectRestore = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setNotice(null)
    try {
      const dump = JSON.parse(await file.text())
      if (!dump || typeof dump !== 'object')
        throw new Error('Isi file bukan cadangan JSON yang valid.')
      setRestoreError('')
      setRestoreFile({ name: file.name, dump })
    } catch {
      notify('File tidak dapat dibaca. Pilih cadangan berformat JSON yang valid.', true)
    }
  }
  const restore = async () => {
    if (working || !restoreFile) return
    setRestoring(true)
    setRestoreError('')
    try {
      const result = window.api?.restoreDatabase
        ? await window.api.restoreDatabase(restoreFile.dump, true)
        : await restoreDatabaseDump(restoreFile.dump, true)
      if (result?.success === false) throw new Error(result.error || 'Data belum dapat dipulihkan.')
      notify('Data berhasil dipulihkan. Halaman akan dimuat ulang.')
      setRestoreFile(null)
      reloadTimer.current = setTimeout(() => window.location.reload(), 1500)
    } catch (failure) {
      setRestoreError(failure.message)
    } finally {
      if (mounted.current) setRestoring(false)
    }
  }
  const reset = async () => {
    if (working) return false
    setResetting(true)
    try {
      const result = await resetAiDatabase()
      if (result?.success === false) throw new Error(result.error || 'Data belum dapat direset.')
      setSelectedNode(null)
      setSelectedSkill(null)
      reloadTimer.current = setTimeout(() => window.location.reload(), 1500)
      return true
    } catch (failure) {
      notify(failure.message, true)
      return false
    } finally {
      if (mounted.current) setResetting(false)
    }
  }
  const removeSkill = async (skill) => {
    const result = await deleteLearnedSkill(skill.id)
    if (result?.success === false) throw new Error(result.error || 'Skill belum dapat dihapus.')
    await loadData()
    notify('Skill telah dihapus.')
  }
  const removeNode = async (node) => {
    let result
    if (node.kind === 'memory') result = await deleteMemory(node.recordId)
    else if (node.kind === 'archive') result = await deleteChatArchive(node.recordId)
    else if (node.kind === 'skill') result = await deleteLearnedSkill(node.recordId)
    else throw new Error('Data ini dikelola melalui halaman Skills.')
    if (result?.success === false) throw new Error(result.error || 'Data belum dapat dihapus.')
    await loadData()
    notify('Data telah dihapus.')
  }
  const groom = async () => {
    if (working) return
    const result = await triggerGrooming(true)
    if (!result) {
      notify('Memori belum dapat diperiksa. Coba lagi.', true)
      return
    }
    await loadData()
    notify('Pemeriksaan memori selesai.')
  }
  const sections = [
    {
      tab: 'personality',
      title: 'Karakter Mark',
      icon: Brain,
      description: data.traits
        ? describePersonality(data.traits)
        : 'Lihat perkembangan sikap dan karakter Mark.',
      meta: `${data.traits?.evalCount || 0} evaluasi`
    },
    {
      tab: 'memory',
      title: 'Memori dan pengetahuan',
      icon: Network,
      description: 'Telusuri ingatan dan arsip percakapan dalam daftar atau peta hubungan.',
      meta: `${data.memories.length} ingatan · ${data.archives.length} arsip`
    },
    {
      tab: 'skills',
      title: 'Skill yang dipelajari',
      icon: GraduationCap,
      description: 'Buka panduan yang disimpan Mark setelah menyelesaikan tugas.',
      meta: `${data.skills.length} skill dipelajari`
    }
  ]
  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={17} />
          Kembali
        </Link>
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-white">Neural Core</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              Lihat perkembangan karakter, memori, dan pengetahuan Mark.
            </p>
          </div>
          <button
            type="button"
            disabled={refreshing || working}
            onClick={loadData}
            className="btn btn-ghost w-fit shrink-0 rounded-full"
          >
            <RefreshCw size={16} className={refreshing ? 'motion-safe:animate-spin' : ''} />
            Muat ulang
          </button>
        </header>
        <nav
          aria-label="Bagian Neural Core"
          className="mt-7 flex flex-wrap gap-2 border-b border-white/10 pb-5"
        >
          {Object.entries(tabs).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => changeTab(id)}
              className={`rounded-full px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${activeTab === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {notice && (
          <div
            role={notice.error ? 'alert' : 'status'}
            className={`mt-6 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm leading-relaxed ${notice.error ? 'border-error/20 bg-error/5 text-error' : 'border-white/10 text-white/70'}`}
          >
            <p>{notice.text}</p>
            <button
              type="button"
              aria-label="Tutup pemberitahuan"
              onClick={() => setNotice(null)}
              className="shrink-0 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {loadError ? (
          <div role="alert" className="py-10 text-sm">
            <p className="text-error">{loadError}</p>
            <button type="button" onClick={loadData} className="btn btn-ghost mt-3 rounded-full">
              Coba lagi
            </button>
          </div>
        ) : loading ? (
          <p role="status" className="py-12 text-sm text-white/45">
            Memuat data Neural Core...
          </p>
        ) : (
          <div className="pt-8">
            {activeTab === 'overview' && (
              <section aria-label="Ringkasan Neural Core">
                <div className="grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-2">
                  {sections.map((section) => (
                    <button
                      key={section.tab}
                      type="button"
                      onClick={() => changeTab(section.tab)}
                      className="flex min-w-0 items-start gap-4 rounded-lg px-4 py-5 text-left hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 text-primary">
                        <section.icon size={24} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">
                          {section.title}
                        </span>
                        <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/55">
                          {section.description}
                        </span>
                        <span className="mt-3 block text-xs text-white/40">{section.meta}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-9 flex flex-col justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-sm font-medium text-white/75">
                      Cadangan dan pengelolaan data
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-white/40">
                      Unduh cadangan, pulihkan database, atau reset data Mark.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeTab('data')}
                    className="btn btn-ghost w-fit shrink-0 rounded-full"
                  >
                    Kelola data
                    <ArrowRight size={15} />
                  </button>
                </div>
              </section>
            )}
            {activeTab === 'personality' && <EmotionalCortexLobe traits={data.traits} />}
            {activeTab === 'memory' && (
              <SynapticMemoryLobe
                graphData={graphData}
                onSelectNode={setSelectedNode}
                groomResult={groomResult}
                isGrooming={isGrooming}
                onGroom={groom}
              />
            )}
            {activeTab === 'skills' && (
              <ProceduralMatrixLobe
                learnedSkills={data.skills}
                skillSearch={skillSearch}
                setSkillSearch={setSkillSearch}
                onSelectSkill={setSelectedSkill}
              />
            )}
            {activeTab === 'data' && (
              <section aria-labelledby="neural-data-title">
                <h2 id="neural-data-title" className="text-base font-medium text-white/90">
                  Kelola data Mark
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">
                  Buat cadangan sebelum memindahkan atau mengganti database.
                </p>
                <div className="mt-7 divide-y divide-white/10">
                  {[
                    {
                      title: 'Unduh cadangan',
                      description:
                        'Simpan salinan database Mark sebagai file JSON untuk cadangan atau pemindahan perangkat.',
                      label: exporting ? 'Menyiapkan cadangan...' : 'Unduh JSON',
                      icon: Download,
                      onClick: download
                    },
                    {
                      title: 'Pulihkan dari cadangan',
                      description:
                        'Ganti database saat ini dengan isi file cadangan JSON. Anda akan diminta mengonfirmasi sebelum data diganti.',
                      label: restoring ? 'Memulihkan...' : 'Pilih file JSON',
                      icon: Upload,
                      onClick: () => fileInput.current?.click()
                    },
                    {
                      title: 'Reset data Mark',
                      description:
                        'Hapus memori, percakapan, skill yang dipelajari, serta riwayat tugas dan perkembangan karakter. Konfigurasi sistem tetap disimpan.',
                      label: 'Reset data',
                      icon: Trash2,
                      onClick: () => setResetOpen(true),
                      danger: true
                    }
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex flex-col justify-between gap-4 py-6 first:pt-0 sm:flex-row sm:items-center"
                    >
                      <div className="max-w-xl">
                        <h3
                          className={`text-sm font-medium ${item.danger ? 'text-error' : 'text-white/85'}`}
                        >
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/50">
                          {item.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={working}
                        onClick={item.onClick}
                        className={`btn w-fit shrink-0 rounded-full ${item.danger ? 'btn-ghost text-error' : 'btn-ghost'}`}
                      >
                        <item.icon size={16} />
                        {item.label}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="File cadangan JSON"
        className="hidden"
        onChange={selectRestore}
      />
      {selectedSkill && (
        <ProceduralSkillModal
          key={selectedSkill.id}
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onDeleteSkill={removeSkill}
        />
      )}
      {selectedNode && (
        <NodeDissectionModal
          key={selectedNode.id}
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onDeleteNode={removeNode}
        />
      )}
      {resetOpen && (
        <ResetAiModal
          onClose={() => setResetOpen(false)}
          onConfirm={reset}
          isResetting={resetting}
        />
      )}
      {restoreFile && (
        <NeuralDialog
          title="Pulihkan database?"
          onClose={() => setRestoreFile(null)}
          busy={restoring}
          footer={
            <>
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreFile(null)}
                className="btn btn-ghost rounded-full"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={restore}
                className="btn rounded-full border-error/30 bg-error/10 text-error"
              >
                {restoring ? 'Memulihkan...' : 'Pulihkan data'}
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-white/65">
            Isi database saat ini akan diganti dengan cadangan{' '}
            <strong className="break-all text-white/85">{restoreFile.name}</strong>. Pastikan data
            yang masih diperlukan sudah dicadangkan.
          </p>
          {restoreError && (
            <p role="alert" className="mt-4 text-sm text-error">
              {restoreError}
            </p>
          )}
        </NeuralDialog>
      )}
    </main>
  )
}
