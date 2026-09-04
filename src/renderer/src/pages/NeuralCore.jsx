import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getRelationship,
  getAllLearnedSkills,
  deleteLearnedSkill,
  getAllChatArchives,
  getAllMemory,
  getAllDocuments,
  deleteMemory,
  deleteChatArchive,
  resetAiDatabase,
  exportDatabaseDump,
  restoreDatabaseDump
} from '../api/db'
import { useConfirm } from '../hooks/useConfirm'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import ConfirmModal from '../components/core/ConfirmModal'
import { EmotionalCortexLobe } from '../components/neural-core/EmotionalCortexLobe'
import { SynapticMemoryLobe } from '../components/neural-core/SynapticMemoryLobe'
import { ProceduralMatrixLobe } from '../components/neural-core/ProceduralMatrixLobe'
import { ProceduralSkillModal } from '../components/neural-core/ProceduralSkillModal'
import { NodeDissectionModal } from '../components/neural-core/NodeDissectionModal'
import { ResetAiModal } from '../components/neural-core/ResetAiModal'
import {
  FaBrain,
  FaNetworkWired,
  FaGraduationCap,
  FaFire,
  FaLayerGroup
} from 'react-icons/fa'

const NeuralCore = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'overview'
  const [activeTab, setActiveTab] = useState(
    initialTab === 'tri-lobe' || initialTab === 'overview'
      ? 'overview'
      : initialTab === 'synaptic' || initialTab === 'memory'
        ? 'memory'
        : initialTab === 'emotional' || initialTab === 'personality'
          ? 'personality'
          : initialTab === 'procedural' || initialTab === 'skills'
            ? 'skills'
            : 'overview'
  )

  // Data States
  const [traits, setTraits] = useState(null)
  const [learnedSkills, setLearnedSkills] = useState([])
  const [skillSearch, setSkillSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [isResettingAi, setIsResettingAi] = useState(false)
  const [isExportingDb, setIsExportingDb] = useState(false)
  const [isRestoringDb, setIsRestoringDb] = useState(false)
  const fileInputRef = useRef(null)
  const [toastMessage, setToastMessage] = useState(null)

  const showToast = (message) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Memory Graph States
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [selectedNode, setSelectedNode] = useState(null)
  const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 500 })
  const graphContainerRef = useRef(null)
  const fgRef = useRef()

  const { isGrooming, groomResult, triggerGrooming } = useMemoryGroomer(false)
  const { confirm, ModalComponent } = useConfirm()
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, node: null })

  // Sinkronkan URL param saat tab berubah
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
  }

  // Load Seluruh Data Otak
  const loadBrainData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Karakter & Emosi
      const rel = await getRelationship('owner')
      setTraits(rel)

      // 2. Keahlian Mandiri (Learned Skills)
      const skills = await getAllLearnedSkills()
      setLearnedSkills(skills || [])

      // 3. Peta Memori (Chat, RAG, Dokumen)
      const archives = await getAllChatArchives()
      const explicitMemories = await getAllMemory()
      const documents = await getAllDocuments()

      const nodes = []
      const links = []

      // 0. Node Pusat Otak (Warna Klasik Cyber: Neon Green)
      const coreNodeId = 'core'
      nodes.push({ id: coreNodeId, name: 'Pusat Otak Mark', group: 0, val: 25, color: '#00ff66' })

      // 1. Kategori Utama Memori (Sub-Cores: Cyan, Pink, Orange, Purple)
      nodes.push({
        id: 'archives-root',
        name: 'Riwayat Obrolan',
        group: 1,
        val: 15,
        color: '#00e5ff'
      })
      nodes.push({
        id: 'vector-root',
        name: 'Basis Pengetahuan',
        group: 1,
        val: 15,
        color: '#ff00aa'
      })
      nodes.push({ id: 'doc-root', name: 'Gudang Dokumen', group: 1, val: 15, color: '#ffaa00' })
      nodes.push({
        id: 'skills-root',
        name: 'Keahlian Mandiri',
        group: 1,
        val: 15,
        color: '#a855f7'
      })

      links.push({ source: coreNodeId, target: 'archives-root', color: 'rgba(255,255,255,0.3)' })
      links.push({ source: coreNodeId, target: 'vector-root', color: 'rgba(255,255,255,0.3)' })
      links.push({ source: coreNodeId, target: 'doc-root', color: 'rgba(255,255,255,0.3)' })
      links.push({ source: coreNodeId, target: 'skills-root', color: 'rgba(255,255,255,0.3)' })

      // 2 & 3. Data Riwayat Obrolan
      const topics = [...new Set(archives.map((a) => a.topic || 'Umum'))]
      topics.forEach((topic) => {
        nodes.push({ id: `topic-${topic}`, name: topic, group: 2, val: 10, color: '#00e5ff' })
        links.push({
          source: 'archives-root',
          target: `topic-${topic}`,
          color: 'rgba(255,255,255,0.1)'
        })
      })

      archives.forEach((arc) => {
        const topicId = `topic-${arc.topic || 'Umum'}`
        nodes.push({
          id: `arc-${arc.id}`,
          name: arc.summary ? arc.summary.substring(0, 30) + '...' : 'Arsip Obrolan',
          fullText: arc.summary,
          date: new Date(arc.timestamp).toLocaleDateString('id-ID'),
          group: 3,
          val: 4,
          color: '#a0a0a0',
          typeLabel: 'Arsip Obrolan'
        })
        links.push({ source: topicId, target: `arc-${arc.id}`, color: 'rgba(255,255,255,0.1)' })
      })

      // 2 & 3. Data Memori Tersimpan
      const memoryTypes = [...new Set(explicitMemories.map((m) => m.type || 'Lainnya'))]
      memoryTypes.forEach((type) => {
        nodes.push({
          id: `type-${type}`,
          name: type.toUpperCase(),
          group: 2,
          val: 10,
          color: '#ff00aa'
        })
        links.push({
          source: 'vector-root',
          target: `type-${type}`,
          color: 'rgba(255,255,255,0.1)'
        })
      })

      explicitMemories.forEach((mem) => {
        const typeId = `type-${mem.type || 'Lainnya'}`
        nodes.push({
          id: `mem-${mem.id}`,
          name: mem.summary
            ? mem.summary
            : mem.memory
              ? mem.memory.substring(0, 30) + '...'
              : 'Memori Tersimpan',
          fullText: mem.memory,
          date: 'Memori RAG',
          group: 3,
          val: 5,
          color: '#e0e0e0',
          typeLabel: 'Memori Tersimpan'
        })
        links.push({ source: typeId, target: `mem-${mem.id}`, color: 'rgba(255,255,255,0.1)' })
      })

      // 2 & 3. Data Dokumen
      const docNames = [...new Set(documents.map((d) => d.docName || 'Dokumen Tanpa Judul'))]
      docNames.forEach((docName) => {
        nodes.push({
          id: `docGroup-${docName}`,
          name: docName,
          group: 2,
          val: 12,
          color: '#ffaa00'
        })
        links.push({
          source: 'doc-root',
          target: `docGroup-${docName}`,
          color: 'rgba(255,255,255,0.1)'
        })
      })

      documents.forEach((doc) => {
        const docGroupId = `docGroup-${doc.docName || 'Dokumen Tanpa Judul'}`
        nodes.push({
          id: `doc-${doc.id}`,
          name: `Bagian ${doc.chunkIndex}`,
          fullText: doc.content,
          date: doc.timestamp ? new Date(doc.timestamp).toLocaleDateString('id-ID') : 'Dokumen',
          group: 3,
          val: 4,
          color: '#d0b080',
          typeLabel: 'Potongan Dokumen'
        })
        links.push({ source: docGroupId, target: `doc-${doc.id}`, color: 'rgba(255,255,255,0.1)' })
      })

      // 2 & 3. Data Keahlian Mandiri
      skills.forEach((skill) => {
        nodes.push({
          id: `skill-${skill.id}`,
          name: `/${skill.name}`,
          fullText: skill.content,
          description: skill.description,
          date: new Date(skill.updatedAt || Date.now()).toLocaleDateString('id-ID'),
          group: 3,
          val: 5,
          color: '#c084fc',
          typeLabel: 'Keahlian Mandiri'
        })
        links.push({
          source: 'skills-root',
          target: `skill-${skill.id}`,
          color: 'rgba(255,255,255,0.1)'
        })
      })

      setGraphData({ nodes, links })
    } catch (err) {
      console.error('[NeuralCore] Error loading brain data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBrainData()
  }, [loadBrainData])

  // Resize canvas graph
  useEffect(() => {
    const updateSize = () => {
      if (graphContainerRef.current) {
        setGraphDimensions({
          width: graphContainerRef.current.clientWidth,
          height: graphContainerRef.current.clientHeight
        })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    const timer = setTimeout(updateSize, 300)
    return () => {
      window.removeEventListener('resize', updateSize)
      clearTimeout(timer)
    }
  }, [activeTab])

  // Reset Total AI (2-step Modal Handler)
  const handleExecuteResetAi = async () => {
    setIsResettingAi(true)
    try {
      const res = await resetAiDatabase()
      setSelectedNode(null)
      setSelectedSkill(null)
      await loadBrainData()
      showToast('Seluruh data memori, sesi percakapan, dan sifat Mark berhasil direset ke kondisi awal!')
      setTimeout(() => {
        window.location.reload()
      }, 1500)
      return res?.success !== false
    } catch (err) {
      console.error('[NeuralCore] Gagal mereset total AI:', err)
      showToast('Gagal mereset AI: ' + err.message)
      return false
    } finally {
      setIsResettingAi(false)
    }
  }

  // Backup Database (JSON)
  const handleExportDatabase = async () => {
    try {
      setIsExportingDb(true)
      let exportData
      if (window.api && window.api.exportDatabase) {
        exportData = await window.api.exportDatabase()
      } else {
        exportData = await exportDatabaseDump()
      }

      if (!exportData) {
        throw new Error('Data export database kosong.')
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mark-full-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Database berhasil diekspor ke file JSON!')
    } catch (err) {
      console.error('[NeuralCore] Gagal export database:', err)
      showToast('Gagal export database: ' + err.message)
    } finally {
      setIsExportingDb(false)
    }
  }

  // Restore Database (JSON)
  const handleFileRestoreSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const result = await confirm({
      title: 'Restore Database?',
      message:
        'Data saat ini akan ditimpa dengan data backup dari file JSON yang kamu pilih. Lanjutkan?',
      isError: true,
      confirmText: 'Ya, Restore Sekarang'
    })

    if (!result.isConfirmed) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsRestoringDb(true)
    try {
      const text = await file.text()
      const dumpData = JSON.parse(text)

      if (window.api && window.api.restoreDatabase) {
        await window.api.restoreDatabase(dumpData, true)
      } else {
        await restoreDatabaseDump(dumpData, true)
      }

      showToast('Database MARK berhasil dipulihkan!')
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error('[NeuralCore] Gagal restore database:', err)
      showToast('Gagal restore database: ' + err.message)
    } finally {
      setIsRestoringDb(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Hapus Skill Action
  const handleDeleteSkill = async (skill) => {
    const result = await confirm({
      title: 'Hapus Keahlian Mandiri?',
      message: `Apakah kamu yakin ingin menghapus keahlian "/${skill.name}" dari memori Mark?`,
      isError: true,
      confirmText: 'Hapus Keahlian'
    })

    if (result.isConfirmed) {
      await deleteLearnedSkill(skill.id)
      if (selectedSkill?.id === skill.id) setSelectedSkill(null)
      await loadBrainData()
    }
  }

  // Hapus Titik Memori Action
  const executeDeleteNode = async () => {
    const node = confirmModal.node || selectedNode
    if (!node) return
    setConfirmModal({ isOpen: false, node: null })

    try {
      if (node.typeLabel === 'Memori Tersimpan' || node.typeLabel === 'Explicit Memory') {
        const id = parseInt(String(node.id).split('-')[1])
        await deleteMemory(id)
      } else if (node.typeLabel === 'Arsip Obrolan' || node.typeLabel === 'Chat Archive') {
        const id = parseInt(String(node.id).split('-')[1])
        await deleteChatArchive(id)
      } else if (node.typeLabel === 'Keahlian Mandiri' || node.typeLabel === 'Learned Skill') {
        const id = String(node.id).replace('skill-', '')
        await deleteLearnedSkill(id)
      }
      setSelectedNode(null)
      await loadBrainData()
    } catch (err) {
      console.error('Gagal menghapus data memori:', err)
    }
  }

  return (
    <div className="h-screen w-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif] flex flex-col select-none">
      {/* ── BACKGROUND AMBIENCE (Tenang & Halus) ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(var(--p)/0.04)_0%,transparent_60%)] pointer-events-none" />

      {/* ── 1. TOP HEADER ── */}
      <header className="h-16 px-6 border-b border-white/5 bg-base-200/70 backdrop-blur-xl flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn btn-ghost btn-sm btn-circle shrink-0"
            style={{ WebkitAppRegion: 'no-drag' }}
            title="Kembali ke Dashboard Utama"
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
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-base-content flex items-center gap-2">
                <FaBrain className="text-primary" /> Pusat Otak Mark
              </h1>
            </div>
            <p className="text-[10px] font-mono text-base-content/50 tracking-tight">
              STATUS SIFAT, JARINGAN MEMORI, DAN KEAHLIAN MANDIRI
            </p>
          </div>
        </div>

        {/* Ringkasan Sensor */}
        <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1 bg-base-300/60 border border-white/5 rounded-xl flex items-center gap-2 text-base-content/70">
            <span className="text-[10px] text-base-content/40">TITIK MEMORI:</span>
            <span className="font-semibold text-primary">{graphData.nodes.length}</span>
          </div>
          <div className="px-3 py-1 bg-base-300/60 border border-white/5 rounded-xl flex items-center gap-2 text-base-content/70">
            <span className="text-[10px] text-base-content/40">KEAHLIAN:</span>
            <span className="font-semibold text-primary">{learnedSkills.length}</span>
          </div>
        </div>

        {/* Mode Switcher Buttons (Palet Bersih & Seragam) */}
        <div className="flex items-center gap-1.5 p-1 bg-base-300/60 border border-white/5 rounded-xl">
          <button
            type="button"
            onClick={() => handleTabChange('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-200'
            }`}
          >
            <FaLayerGroup size={11} /> Semua Bagian
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('personality')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'personality'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-200'
            }`}
          >
            <FaFire size={11} /> Karakter & Emosi
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('memory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'memory'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-200'
            }`}
          >
            <FaNetworkWired size={11} /> Peta Memori
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('skills')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'skills'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-200'
            }`}
          >
            <FaGraduationCap size={11} /> Keahlian Mandiri
          </button>
        </div>
      </header>

      {/* ── 2. MAIN VIEWPORT ── */}
      <main className="flex-1 min-h-0 relative z-10 p-4 md:p-6 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="loading loading-spinner loading-lg text-primary" />
            <p className="font-mono text-xs text-base-content/50 tracking-widest uppercase">
              Memuat Data Pikiran Mark...
            </p>
          </div>
        ) : (
          <>
            {/* MODE 1: RINGKASAN SEMUA BAGIAN */}
            {activeTab === 'overview' && (
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-y-auto lg:overflow-hidden custom-scrollbar">
                <EmotionalCortexLobe
                  traits={traits}
                  onNavigateToFull={() => handleTabChange('personality')}
                  onResetAi={() => setIsResetModalOpen(true)}
                  onExportDatabase={handleExportDatabase}
                  onRestoreDatabase={() => fileInputRef.current?.click()}
                  isExportingDb={isExportingDb}
                  isRestoringDb={isRestoringDb}
                />
                <SynapticMemoryLobe
                  graphData={graphData}
                  graphDimensions={graphDimensions}
                  graphContainerRef={graphContainerRef}
                  fgRef={fgRef}
                  groomResult={groomResult}
                  isGrooming={isGrooming}
                  triggerGrooming={triggerGrooming}
                  loadBrainData={loadBrainData}
                  onSelectNode={(node) => setSelectedNode(node)}
                  onNavigateToFull={() => handleTabChange('memory')}
                />
                <ProceduralMatrixLobe
                  learnedSkills={learnedSkills}
                  skillSearch={skillSearch}
                  setSkillSearch={setSkillSearch}
                  onSelectSkill={(skill) => setSelectedSkill(skill)}
                  onDeleteSkill={handleDeleteSkill}
                  onNavigateToFull={() => handleTabChange('skills')}
                />
              </div>
            )}

            {/* MODE 2: KARAKTER & EMOSI PENUH */}
            {activeTab === 'personality' && (
              <EmotionalCortexLobe
                traits={traits}
                isFullView={true}
                onResetAi={() => setIsResetModalOpen(true)}
                onExportDatabase={handleExportDatabase}
                onRestoreDatabase={() => fileInputRef.current?.click()}
                isExportingDb={isExportingDb}
                isRestoringDb={isRestoringDb}
              />
            )}

            {/* MODE 3: PETA MEMORI PENUH */}
            {activeTab === 'memory' && (
              <SynapticMemoryLobe
                graphData={graphData}
                graphDimensions={graphDimensions}
                graphContainerRef={graphContainerRef}
                fgRef={fgRef}
                groomResult={groomResult}
                isGrooming={isGrooming}
                triggerGrooming={triggerGrooming}
                loadBrainData={loadBrainData}
                onSelectNode={(node) => setSelectedNode(node)}
                isFullView={true}
              />
            )}

            {/* MODE 4: GUDANG KEAHLIAN PENUH */}
            {activeTab === 'skills' && (
              <ProceduralMatrixLobe
                learnedSkills={learnedSkills}
                skillSearch={skillSearch}
                setSkillSearch={setSkillSearch}
                onSelectSkill={(skill) => setSelectedSkill(skill)}
                onDeleteSkill={handleDeleteSkill}
                isFullView={true}
              />
            )}
          </>
        )}
      </main>

      {/* ── 3. MODALS & HIDDEN INPUTS ── */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileRestoreSelect}
        accept=".json"
        className="hidden"
      />

      <ProceduralSkillModal skill={selectedSkill} onClose={() => setSelectedSkill(null)} />

      <NodeDissectionModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onDeleteNode={(node) => setConfirmModal({ isOpen: true, node })}
      />

      <ResetAiModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleExecuteResetAi}
        isResetting={isResettingAi}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="Hapus Data Memori?"
        message={`Apakah kamu yakin ingin menghapus data memori ini secara permanen dari ingatan Mark?\n"${confirmModal.node?.name || ''}"`}
        onConfirm={executeDeleteNode}
        onCancel={() => setConfirmModal({ isOpen: false, node: null })}
        confirmText="Hapus Permanen"
        cancelText="Batal"
        isError={true}
      />
      <ModalComponent />

      {/* ── TOAST NOTIFIKASI FEEDBACK ── */}
      {toastMessage && (
        <div className="toast toast-top toast-end z-[9999] animate-fade-in pointer-events-none">
          <div className="alert alert-success shadow-2xl rounded-2xl border border-success/30 flex items-center gap-3 py-3 px-4 backdrop-blur-md bg-success/20 text-success-content">
            <span className="text-xs font-mono font-medium">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default NeuralCore
