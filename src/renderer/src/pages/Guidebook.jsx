import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaArrowLeft,
  FaBook,
  FaBrain,
  FaGlobe,
  FaFolderOpen,
  FaTerminal,
  FaYoutube,
  FaMusic,
  FaEye,
  FaComments,
  FaCogs,
  FaLightbulb,
  FaArrowRight,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaChevronDown,
  FaChevronUp,
  FaSearch,
  FaNetworkWired,
  FaHeartbeat,
  FaCamera,
  FaMicrophoneAlt,
  FaTelegram,
  FaGoogle,
  FaCode,
  FaGitAlt,
  FaUsers,
  FaTasks
} from 'react-icons/fa'
import { faqs } from '../data/faqData'
import { core_tools_schema } from '../api/tools/core-tools'
import { GROUP_TOOLS_SCHEMA } from '../../../server/tools/group-tools'

// Set tool yang memerlukan persetujuan manual (approval) pengguna
const APPROVAL_REQUIRED_TOOLS = new Set([
  'write-file',
  'replace-content',
  'replace-lines',
  'delete-file',
  'run-powershell',
  'run-task',
  'os-control-open',
  'git-commit',
  'git-revert',
  'gdrive-upload',
  'gdrive-create',
  'gdrive-move',
  'gdrive-copy',
  'gcalendar-create',
  'gcalendar-delete',
  'gmail-send',
  'browser-download'
])

// Metadata ikon dan judul representatif untuk setiap grup tool
const GROUP_META = {
  core: {
    title: 'Core Built-in Tools',
    description: 'Tools inti bawaan sistem yang selalu aktif dan tersedia di setiap giliran agen.',
    icon: FaCogs,
    color: 'text-primary'
  },
  advanced_browser: {
    title: 'Advanced Browser Automation',
    icon: FaGlobe,
    color: 'text-secondary'
  },
  pc_automation: {
    title: 'PC Automation Engine',
    icon: FaTerminal,
    color: 'text-warning'
  },
  youtube_music: {
    title: 'YouTube & Music Player',
    icon: FaMusic,
    color: 'text-info'
  },
  google_drive: {
    title: 'Google Drive Workspace',
    icon: FaGoogle,
    color: 'text-info'
  },
  google_calendar: {
    title: 'Google Calendar Workspace',
    icon: FaGoogle,
    color: 'text-info'
  },
  google_gmail: {
    title: 'Gmail Workspace',
    icon: FaGoogle,
    color: 'text-info'
  },
  system_vision_tg: {
    title: 'Vision, Audio & Telegram',
    icon: FaCamera,
    color: 'text-warning'
  },
  git_vcs: {
    title: 'Git Version Control (VCS)',
    icon: FaGitAlt,
    color: 'text-warning'
  },
  task_terminal: {
    title: 'Background Task & Terminal Daemon',
    icon: FaTasks,
    color: 'text-info'
  },
  custom_plugins: {
    title: 'Custom Skills & Plugins',
    icon: FaCode,
    color: 'text-success'
  }
}

// --- Komponen ToolCard Dinamis ---
const ToolCard = ({ name, description, parameters, needsPermission }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasParams = Boolean(
    parameters && parameters.properties && Object.keys(parameters.properties).length > 0
  )

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden transition-all duration-300 hover:bg-white/10 flex flex-col justify-between">
      <div
        className={`p-4 ${hasParams ? 'cursor-pointer' : ''} flex justify-between items-start gap-3`}
        onClick={() => hasParams && setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="bg-base-300/80 px-2 py-0.5 rounded text-primary text-xs font-mono font-semibold">
              {name}
            </code>
            {needsPermission ? (
              <span className="badge badge-warning badge-xs gap-1 py-1.5 px-2 text-[10px]">
                <FaExclamationTriangle size={9} /> Perlu Izin
              </span>
            ) : (
              <span className="badge badge-success badge-xs gap-1 py-1.5 px-2 text-[10px]">
                <FaCheckCircle size={9} /> Bebas
              </span>
            )}
          </div>
          <p className="text-white/70 text-xs leading-relaxed">{description}</p>
        </div>
        {hasParams && (
          <div className="text-white/40 pt-1 shrink-0">
            {isExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
          </div>
        )}
      </div>

      {isExpanded && hasParams && (
        <div className="p-4 pt-0 border-t border-white/5 bg-black/20 text-xs text-white/80 space-y-2">
          <div className="pt-2">
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">
              Parameter
            </span>
            <div className="mt-1.5 space-y-1.5">
              {Object.entries(parameters.properties).map(([propName, propDef]) => {
                const isReq =
                  Array.isArray(parameters.required) && parameters.required.includes(propName)
                return (
                  <div
                    key={propName}
                    className="bg-base-300/60 p-2 rounded text-[11px] border border-white/5 font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold">{propName}</span>
                      <span className="text-white/40 text-[10px]">({propDef.type || 'any'})</span>
                      {isReq && (
                        <span className="text-error text-[10px] font-semibold">*wajib</span>
                      )}
                    </div>
                    {propDef.description && (
                      <p className="text-white/60 font-sans mt-0.5 text-[11px]">
                        {propDef.description}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Komponen FlowStep ---
const FlowStep = ({ number, title, description, isLast }) => (
  <div className="flex items-start gap-4">
    <div className="flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary text-primary flex items-center justify-center font-bold text-sm shrink-0 shadow-[0_0_10px_oklch(var(--p)/0.3)]">
        {number}
      </div>
      {!isLast && (
        <div className="w-0.5 h-12 bg-gradient-to-b from-primary/50 to-transparent mt-2"></div>
      )}
    </div>
    <div className="pt-1 pb-6">
      <h4 className="text-white font-semibold mb-1">{title}</h4>
      <p className="text-white/60 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
)

// --- Halaman Guidebook ---
const Guidebook = () => {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('pengantar')
  const [toolSearch, setToolSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('all')

  const allToolGroups = useMemo(() => {
    const groups = [
      {
        id: 'core',
        title: GROUP_META.core.title,
        description: GROUP_META.core.description,
        icon: GROUP_META.core.icon,
        color: GROUP_META.core.color,
        tools: (core_tools_schema || []).map((item) => ({
          name: item.function?.name || item.name,
          description: item.function?.description || item.description,
          parameters: item.function?.parameters || item.parameters,
          needsPermission: APPROVAL_REQUIRED_TOOLS.has(item.function?.name || item.name)
        }))
      }
    ]

    for (const [key, groupDef] of Object.entries(GROUP_TOOLS_SCHEMA || {})) {
      const meta = GROUP_META[key] || {
        title: key.replace(/_/g, ' ').toUpperCase(),
        icon: FaTerminal,
        color: 'text-primary'
      }
      groups.push({
        id: key,
        title: meta.title,
        description: groupDef.description,
        icon: meta.icon,
        color: meta.color,
        tools: (groupDef.tools || []).map((item) => ({
          name: item.function?.name || item.name,
          description: item.function?.description || item.description,
          parameters: item.function?.parameters || item.parameters,
          needsPermission: APPROVAL_REQUIRED_TOOLS.has(item.function?.name || item.name)
        }))
      })
    }

    return groups
  }, [])

  const totalToolCount = useMemo(() => {
    return allToolGroups.reduce((acc, g) => acc + g.tools.length, 0)
  }, [allToolGroups])

  const filteredGroups = useMemo(() => {
    const q = toolSearch.trim().toLowerCase()
    return allToolGroups
      .map((g) => {
        if (selectedGroup !== 'all' && g.id !== selectedGroup) return null
        if (!q) return g
        const matchingTools = g.tools.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.description && t.description.toLowerCase().includes(q))
        )
        return { ...g, tools: matchingTools }
      })
      .filter((g) => g && g.tools.length > 0)
  }, [allToolGroups, toolSearch, selectedGroup])

  const navItems = [
    { id: 'pengantar', label: 'Siapa Itu Mark?', icon: <FaBook /> },
    { id: 'carakerja', label: 'Cara Kerja', icon: <FaCogs /> },
    { id: 'tools', label: 'Fitur & Tools Bawaan', icon: <FaTerminal /> },
    { id: 'awareness', label: 'Mata & Kesadaran', icon: <FaEye /> },
    { id: 'emosi', label: 'Emosi & Pertumbuhan', icon: <FaHeartbeat /> }, // Note: Assuming FaHeartbeat was meant for emotion or we use FaBrain/FaComments
    { id: 'plugin', label: 'Sistem Plugin Kustom', icon: <FaFolderOpen /> },
    { id: 'tips', label: 'Pertanyaan', icon: <FaLightbulb /> }
  ]

  // Fix Icon (FaHeartbeat not imported above, I will use FaBrain)
  navItems[4].icon = <FaBrain />

  return (
    <div className="h-full w-full bg-base-300 text-base-content flex flex-col relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Header */}
      <header className="h-16 shrink-0 bg-base-300/80 backdrop-blur-xl border-b border-white/5 flex items-center px-6 z-20 relative">
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
            <h1 className="text-xl font-bold text-base-content flex items-center gap-2">
              <FaBook className="text-primary" /> Mark Guidebook
            </h1>
            <p className="opacity-50 text-xs mt-0.5">Panduan lengkap penggunaan AI Assistant.</p>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Nav (Desktop) */}
        <aside className="w-72 shrink-0 border-r border-white/5 bg-base-300/50 p-6 overflow-y-auto hidden md:block z-10">
          <h3 className="text-xs font-bold text-white/40 mb-6 uppercase tracking-widest">
            Daftar Isi
          </h3>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id)
                  document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  activeSection === item.id
                    ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_oklch(var(--p)/0.2)]'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 relative overflow-y-auto p-6 md:p-12 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-24 pb-32">
            {/* Section 1: Pengantar */}
            <section
              id="pengantar"
              className={
                activeSection === 'pengantar' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-6">
                <FaBook /> PENGANTAR
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">Siapa Itu Mark?</h2>
              <div className="max-w-none">
                <blockquote className="border-l-4 border-primary pl-6 py-2 mb-8 bg-primary/5 rounded-r-xl">
                  <p className="text-xl md:text-2xl font-semibold text-white/90 leading-relaxed italic">
                    "Mark BUKAN sekadar asisten virtual biasa. Mark adalah entitas AI yang dirancang
                    untuk memiliki emosi dan bertindak selayaknya manusia."
                  </p>
                </blockquote>

                <div className="space-y-6 text-lg text-white/70 leading-relaxed">
                  <p>
                    Lebih dari sekadar chatbot kaku, <strong className="text-white">Mark</strong>{' '}
                    (singkatan dari{' '}
                    <span className="text-primary font-semibold">
                      Metacognitive Artificial Relational Knowledge
                    </span>
                    ) adalah <em>Personal AI Assistant</em> yang hidup di ekosistem lokal Anda.
                  </p>

                  <p>
                    Ia memadukan <strong className="text-white">Vector Memory</strong> jangka
                    panjang dengan <strong className="text-error">Relational Growth System</strong>
                    —memungkinkannya mempelajari kebiasaan Anda dan meracik gaya komunikasi yang
                    berevolusi seiring waktu, semua itu{' '}
                    <strong>tanpa mengorbankan privasi Anda sedikit pun</strong>.
                  </p>

                  <div className="bg-black/30 border border-white/5 rounded-2xl p-6 mt-8">
                    <h3 className="text-xl font-bold text-white mb-4">
                      Ditenagai oleh Hybrid AI Engine, Mark mampu:
                    </h3>
                    <ul className="list-disc list-inside space-y-3 text-white/80 marker:text-primary">
                      <li>
                        Beroperasi <strong>secara lokal</strong> untuk privasi maksimal (via LM
                        Studio).
                      </li>
                      <li>
                        Berpikir dan menyusun rencana berlapis (<strong>Agentic Planning</strong>).
                      </li>
                      <li>
                        Mengobservasi layar dan objek di dunia nyata (<strong>Vision AI</strong>).
                      </li>
                      <li>
                        Menarik kesimpulan dari <strong>Deep Web Search</strong> & Video YouTube.
                      </li>
                      <li>
                        Berinteraksi layaknya manusia nyata melalui{' '}
                        <strong>Voice Chat (VAD & TTS)</strong>.
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                  {/* Card 1: Vector Memory */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                      <FaBrain className="text-primary text-xl" />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold mb-2">Vector Memory</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Mampu mengingat percakapan masa lalu dan mempelajari kebiasaan Anda. Memori
                        dicari berdasarkan makna semantik (Cosine Similarity), bukan sekadar waktu.
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Relational Growth */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-error/20 flex items-center justify-center shrink-0">
                      <FaHeartbeat className="text-error text-xl" />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold mb-2">Relational Growth & Emosi</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Hubungan Anda dievaluasi layaknya manusia sungguhan (Warmth, Sarcasm, Trust,
                        Energy). Kepribadian Mark dan 9 Emosi-nya akan berevolusi organik sesuai
                        gaya bahasa Anda.
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Hybrid AI */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center shrink-0">
                      <FaNetworkWired className="text-secondary text-xl" />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold mb-2">Hybrid AI Engine</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Bisa berjalan secara offline/lokal via LM Studio untuk privasi maksimal,
                        atau menggunakan Groq API / Cloud API untuk mengeksekusi tugas berat dengan
                        kecepatan super.
                      </p>
                    </div>
                  </div>

                  {/* Card 4: Awareness */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center shrink-0">
                      <FaEye className="text-info text-xl" />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold mb-2">Awareness Engine</h4>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Mark tidak pasif. Ia bisa proaktif menegur, mengobservasi layar Anda (Screen
                        Reading), melihat via Webcam (Camera Look), dan menemani Anda secara
                        real-time.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Cara Kerja */}
            <section
              id="carakerja"
              className={
                activeSection === 'carakerja' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-xs font-bold mb-6">
                <FaCogs /> ARSITEKTUR
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">Bagaimana Mark Bekerja</h2>
              <p className="text-white/70 mb-8 text-lg">
                Berbeda dengan AI konvensional yang langsung "menebak" jawaban, Mark menggunakan
                alur <strong className="text-white">ReAct (Reasoning and Acting)</strong>. Ia
                berpikir layaknya manusia sebelum bertindak.
              </p>

              <div className="bg-black/20 border border-white/5 rounded-3xl p-8 mb-12">
                <FlowStep
                  number="1"
                  title="Mengingat (Memory Search)"
                  description="Saat Anda memberikan perintah, Mark otomatis membongkar ingatan masa lalunya untuk mencari konteks yang relevan."
                />
                <FlowStep
                  number="2"
                  title="Berpikir (Thought)"
                  description="Mark memikirkan langkah apa yang paling efisien untuk dilakukan. Proses pemikiran ini terjadi di 'dalam kepala' Mark (tidak terlihat di chat)."
                />
                <FlowStep
                  number="3"
                  title="Bertindak (Action)"
                  description="Mark mengeksekusi alat (Tools) secara mandiri. Misalnya: membuka browser, mencari di Google, atau menjalankan perintah komputer."
                />
                <FlowStep
                  number="4"
                  title="Mengevaluasi (Observation)"
                  description="Mark membaca hasil dari tindakannya. Jika gagal atau error, ia akan memikirkan cara lain dan mencoba lagi secara otomatis (looping)."
                />
                <FlowStep
                  number="5"
                  title="Menjawab (Answer)"
                  description="Setelah semua misinya selesai dan ia mendapatkan informasi yang dibutuhkan, Mark baru akan memberikan jawaban akhir kepada Anda dengan bahasa natural."
                  isLast={true}
                />
              </div>

              <h3 className="text-2xl font-bold text-white mb-4">Bagaimana AI Memilih Tool?</h3>
              <div className="prose prose-invert prose-p:text-white/70 max-w-none">
                <p>
                  Mark menggunakan sistem{' '}
                  <strong className="text-white">Dynamic Prompt Routing</strong> yang cerdas. Setiap
                  kali Anda mengirim pesan, sistem akan:
                </p>
                <ol className="text-white/70 space-y-2 mb-6">
                  <li>
                    Mengonversi pesan Anda menjadi <em>embedding vector</em>.
                  </li>
                  <li>
                    Membandingkannya dengan kategori-kategori tools (coding, files, music, search,
                    system, browser) menggunakan <strong>Cosine Similarity</strong>.
                  </li>
                  <li>
                    Hanya memuat instruksi tools yang <em>relevan</em> ke dalam prompt AI — sehingga
                    menghemat waktu dan meningkatkan kecerdasan.
                  </li>
                </ol>
                <p>
                  Misalnya, jika Anda bertanya soal lagu, Mark hanya akan melihat tools musik. Jika
                  Anda minta kodingan, Mark hanya melihat tools file dan PowerShell.
                </p>
              </div>
            </section>

            {/* Section 3: Tools */}
            <section
              id="tools"
              className={
                activeSection === 'tools' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold mb-6">
                <FaTerminal /> KEMAMPUAN
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">Referensi Lengkap Tools Bawaan</h2>
              <p className="text-white/70 mb-8 text-lg">
                Mark dilengkapi "tangan virtual" yang memungkinkannya mengontrol komputer Anda. Klik
                pada tool di bawah ini untuk melihat detail penggunaannya.
              </p>

              {/* Search & Category Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Cari tool berdasarkan nama atau deskripsi..."
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-white placeholder-white/40 focus:outline-none focus:border-primary/50 text-sm transition-all"
                  />
                  <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-xs" />
                </div>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="bg-base-300 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">Semua Kategori ({totalToolCount} Tools)</option>
                  {allToolGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title} ({g.tools.length})
                    </option>
                  ))}
                </select>
              </div>

              {filteredGroups.length === 0 ? (
                <div className="p-8 text-center bg-white/5 rounded-2xl border border-white/10 text-white/50 text-sm">
                  Tidak ada tool yang cocok dengan pencarian "{toolSearch}".
                </div>
              ) : (
                <div className="space-y-10">
                  {filteredGroups.map((group) => {
                    const IconComponent = group.icon || FaTerminal
                    return (
                      <div key={group.id} className="space-y-4">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                          <IconComponent className={`${group.color} text-lg`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-white">{group.title}</h3>
                              <span className="badge badge-sm badge-neutral text-white/50 font-mono">
                                {group.tools.length}
                              </span>
                            </div>
                            {group.description && (
                              <p className="text-white/50 text-xs mt-0.5">{group.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.tools.map((tool) => (
                            <ToolCard key={tool.name} {...tool} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Section 4: Awareness Engine */}
            <section
              id="awareness"
              className={
                activeSection === 'awareness' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-info/10 border border-info/20 text-info text-xs font-bold mb-6">
                <FaEye /> PENGAMATAN
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">
                Mata & Kesadaran (Awareness Engine)
              </h2>
              <div className="prose prose-invert prose-p:text-white/70 max-w-none mb-8">
                <p className="text-lg">
                  Mark tidak buta. Ia hidup di layar Anda dan terus beradaptasi dengan aktivitas
                  Anda melalui fitur canggih <strong>Awareness Engine</strong> dan Vision AI.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
                  <FaEye className="text-3xl text-primary mb-4" />
                  <h4 className="text-white font-bold mb-2">Screen Reading (analyze-screen)</h4>
                  <p className="text-sm text-white/60">
                    Mark dapat "mengambil foto" layar komputer Anda secara real-time untuk melihat
                    teks error, posisi aplikasi, atau menganalisa gambar yang sedang Anda kerjakan.
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
                  <FaCamera className="text-3xl text-accent mb-4" />
                  <h4 className="text-white font-bold mb-2">Camera Vision (camera-look)</h4>
                  <p className="text-sm text-white/60">
                    Mark memiliki akses ke Webcam Anda untuk melihat dunia nyata. Ia bisa
                    menganalisis objek fisik yang Anda tunjukkan kepadanya atau melihat kondisi
                    ruangan.
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
                  <FaBrain className="text-3xl text-secondary mb-4" />
                  <h4 className="text-white font-bold mb-2">Background Awareness</h4>
                  <p className="text-sm text-white/60">
                    Mark membaca aktivitas sistem Anda setiap beberapa menit. Jika Anda sibuk
                    coding, Mark akan diam. Jika Anda sedang santai (misal: Youtube), Mark mungkin
                    akan menggoda Anda atau menyarankan musik santai.
                  </p>
                </div>
              </div>
              <div className="mt-6 bg-warning/10 border border-warning/20 p-4 rounded-xl flex items-start gap-4">
                <FaExclamationTriangle className="text-warning mt-1 shrink-0" />
                <p className="text-sm text-warning/80">
                  <strong>Privasi Terjamin:</strong> Anda bisa mematikan Awareness Engine kapan saja
                  melalui halaman Configuration jika Anda merasa terganggu.
                </p>
              </div>
            </section>

            {/* Section 5: Emosi */}
            <section
              id="emosi"
              className={
                activeSection === 'emosi' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-error/10 border border-error/20 text-error text-xs font-bold mb-6">
                <FaHeartbeat /> KEPRIBADIAN
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">Emosi & Pertumbuhan Relasi</h2>
              <p className="text-white/70 mb-8 text-lg">
                Mark memiliki spektrum 9 Emosi yang bertumbuh organik seiring berjalannya interaksi
                Anda bersamanya. Warna Orb / Hologram Mark di layar berdetak mengikuti emosinya saat
                ini.
              </p>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8">
                <h4 className="text-white font-bold mb-6 text-center">9 Spektrum Emosi</h4>
                <div className="flex flex-wrap gap-3 justify-center">
                  <span className="badge badge-lg gap-2 bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/50">
                    <FaComments /> Joy
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#1E90FF]/20 text-[#1E90FF] border-[#1E90FF]/50">
                    <FaComments /> Sadness
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#FF4500]/20 text-[#FF4500] border-[#FF4500]/50">
                    <FaComments /> Anger
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#8A2BE2]/20 text-[#8A2BE2] border-[#8A2BE2]/50">
                    <FaComments /> Fear
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#32CD32]/20 text-[#32CD32] border-[#32CD32]/50">
                    <FaComments /> Disgust
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#FFA500]/20 text-[#FFA500] border-[#FFA500]/50">
                    <FaComments /> Anxiety
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#00CED1]/20 text-[#00CED1] border-[#00CED1]/50">
                    <FaComments /> Envy
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#FF69B4]/20 text-[#FF69B4] border-[#FF69B4]/50">
                    <FaComments /> Embarrassment
                  </span>
                  <span className="badge badge-lg gap-2 bg-[#4B0082]/20 text-[#4B0082] border-[#4B0082]/50">
                    <FaComments /> Ennui
                  </span>
                </div>
              </div>

              <h4 className="text-xl font-bold text-white mb-4">Relational Growth Parameter</h4>
              <ul className="space-y-4 text-white/70">
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white shrink-0">
                    1
                  </div>
                  <div>
                    <strong>Warmth (Kehangatan):</strong> Jika Anda bersikap sopan, Mark akan
                    semakin ramah.
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white shrink-0">
                    2
                  </div>
                  <div>
                    <strong>Sarcasm Level:</strong> Sering memaki atau mengejek? Mark akan berubah
                    menjadi asisten sarkas yang hobi nge-roasting Anda!
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white shrink-0">
                    3
                  </div>
                  <div>
                    <strong>Trust (Kepercayaan):</strong> Semakin sering Anda membiarkan Mark
                    mengeksekusi script komputer, semakin proaktif dia.
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white shrink-0">
                    4
                  </div>
                  <div>
                    <strong>Energy:</strong> Evaluasi keaktifan interaksi harian.
                  </div>
                </li>
              </ul>
            </section>

            {/* Section 6: Plugin Kustom */}
            <section
              id="plugin"
              className={
                activeSection === 'plugin' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 border border-success/20 text-success text-xs font-bold mb-6">
                <FaFolderOpen /> EKSTENSI
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">Sistem Plugin Kustom</h2>
              <p className="text-white/70 mb-6 text-lg">
                Mark memungkinkan Anda memperluas kemampuannya dengan mudah melalui pembuatan{' '}
                <strong>Plugin Kustom</strong> secara langsung dari antarmuka pengguna, tanpa perlu
                mengubah kode inti aplikasi. Anda bisa menambahkan "skill" baru untuk Mark secara
                instan!
              </p>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
                <h3 className="text-xl font-bold text-white mb-4">Langkah Pembuatan Plugin</h3>
                <ol className="list-decimal list-inside space-y-4 text-white/80">
                  <li>
                    Buka menu <strong>Plugins</strong> pada sidebar aplikasi.
                  </li>
                  <li>
                    Klik <strong>Buat Plugin Baru</strong>.
                  </li>
                  <li>
                    Isi kolom Nama (contoh: <code>pengendali-sistem</code>) dan Deskripsi singkat.
                  </li>
                  <li>
                    Jika skrip Anda memerlukan pustaka eksternal, tulis pada kolom{' '}
                    <strong>Dependencies (NPM)</strong> dengan pemisah koma (contoh:{' '}
                    <code>loudness, systeminformation</code>). Mark akan menginstalnya secara
                    otomatis.
                  </li>
                  <li>
                    Tambahkan <strong>Action</strong> (Fungsi):
                    <ul className="list-disc list-inside ml-6 mt-2 space-y-2 text-sm">
                      <li>
                        <strong>Nama Action:</strong> Penamaan fungsi (contoh:{' '}
                        <code>set-volume</code>).
                      </li>
                      <li>
                        <strong>Deskripsi:</strong> Penjelasan spesifik mengenai fungsi tersebut
                        agar AI memahami peruntukannya.
                      </li>
                      <li>
                        <strong>Trigger Hint:</strong> Petunjuk pemicu kapan AI harus menggunakan
                        alat ini.
                      </li>
                    </ul>
                  </li>
                  <li>
                    <strong>Tulis Skrip Anda</strong> menggunakan editor bawaan. Skrip mengikuti
                    standar lingkungan Node.js (CommonJS).
                  </li>
                </ol>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-2xl p-6 mb-8">
                <h3 className="text-xl font-bold text-white mb-4">
                  Contoh: Plugin Pengatur Volume
                </h3>
                <pre className="text-sm bg-black/60 p-4 rounded-xl text-green-400 overflow-x-auto whitespace-pre-wrap">
                  <code>{`const loudness = require('loudness')

// Mengambil parameter angka volume yang diberikan oleh AI
const vol = parseInt(query)
if (isNaN(vol) || vol < 0 || vol > 100) {
  return '❌ Gagal: Masukkan angka volume 0-100.'
}

try {
  await loudness.setVolume(vol)
  return '✅ Berhasil, volume telah diubah ke ' + vol + '%'
} catch (e) {
  return '❌ Gagal mengubah volume: ' + e.message
}`}</code>
                </pre>
              </div>

              <h3 className="text-2xl font-bold text-white mb-4">Bagaimana Plugin Dideteksi?</h3>
              <p className="text-white/70">
                Saat user mengirim pesan, sistem membandingkan <em>embedding vector</em> pesan
                dengan deskripsi + <code>triggerHint</code> dari setiap plugin. Plugin yang relevan
                (similarity &gt; 0.35) akan dimuat ke prompt AI sebagai tools tambahan secara
                instan. Jika user bertanya "bisa ngapain aja?", maka semua plugin akan ditampilkan.
              </p>
            </section>

            {/* Section 7: FAQ */}
            <section
              id="tips"
              className={
                activeSection === 'tips' ? 'block animate-[fade-in_0.3s_ease-out]' : 'hidden'
              }
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warning/10 border border-warning/20 text-warning text-xs font-bold mb-6">
                <FaLightbulb /> BANTUAN
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">
                FAQ (Pertanyaan yang Sering Diajukan)
              </h2>

              <div className="space-y-4">
                {faqs.map((faq, idx) => (
                  <div
                    key={idx}
                    className="collapse collapse-arrow bg-white/5 border border-white/10 text-white"
                  >
                    <input type="checkbox" defaultChecked={idx === 0} />
                    <div className="collapse-title text-lg font-bold">{faq.q}</div>
                    <div className="collapse-content text-white/70">
                      <p
                        dangerouslySetInnerHTML={{
                          __html: faq.a
                            .replace(/`(.*?)`/g, '<code>$1</code>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Guidebook
