import React, { useState, useEffect, useRef } from 'react'
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

// --- Komponen ToolCard ---
const ToolCard = ({ name, description, needsPermission, queryFormat, howItWorks, example }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden transition-all duration-300 hover:bg-white/10">
      <div
        className="p-4 cursor-pointer flex justify-between items-center gap-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center gap-3">
            <code className="bg-base-300/50 px-2 py-1 rounded text-primary text-sm font-mono">
              {name}
            </code>
            {needsPermission ? (
              <span className="badge badge-warning badge-sm gap-1">
                <FaExclamationTriangle size={10} /> Perlu Izin
              </span>
            ) : (
              <span className="badge badge-success badge-sm gap-1">
                <FaCheckCircle size={10} /> Bebas
              </span>
            )}
          </div>
          <p className="text-white/70 text-sm">{description}</p>
        </div>
        <div className="text-white/50">{isExpanded ? <FaChevronUp /> : <FaChevronDown />}</div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-white/5 bg-black/20 text-sm text-white/80 space-y-3">
          <div>
            <strong className="text-white">Format Query:</strong>
            <div className="bg-base-300/50 p-2 rounded mt-1 font-mono text-xs text-primary/80">
              {queryFormat}
            </div>
          </div>
          <div>
            <strong className="text-white">Cara Kerja:</strong>
            <p className="mt-1 leading-relaxed">{howItWorks}</p>
          </div>
          {example && (
            <div>
              <strong className="text-white">Contoh:</strong>
              <div className="bg-base-300/50 p-2 rounded mt-1 text-white/60 italic">{example}</div>
            </div>
          )}
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
            <p className="opacity-50 text-xs mt-0.5">
              Panduan lengkap penggunaan AI Assistant.
            </p>
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

              <div className="space-y-8">
                {/* Kategori Multi-Agent Orchestration */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaUsers className="text-primary" /> Multi-Agent Orchestration (Sub-Agents)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ToolCard
                      name="spawn_subagent"
                      description="Meluncurkan sub-agent otonom di latar belakang untuk tugas paralel."
                      needsPermission={false}
                      queryFormat='{"name": "...", "role": "...", "goal": "...", "toolGroups": ["..."]}'
                      howItWorks="Membuat sesi sub-agent terisolasi dengan siklus ReAct mandiri dan sesi browser Chromium terpisah."
                    />
                    <ToolCard
                      name="wait_subagents"
                      description="Menunggu sub-agent menyelesaikan tugasnya dan mengumpulkan hasil."
                      needsPermission={false}
                      queryFormat="id1,id2,id3 atau (kosong)"
                      howItWorks="Menghentikan sementara Lead Agent hingga sub-agent yang ditugaskan mengirimkan laporan akhir."
                    />
                    <ToolCard
                      name="send_message"
                      description="Mengirim instruksi lanjutan atau arahan ke sub-agent aktif."
                      needsPermission={false}
                      queryFormat="subagentId||isi pesan"
                      howItWorks="Menyuntikkan pesan langsung ke dalam konteks observasi sub-agent yang sedang berjalan."
                    />
                    <ToolCard
                      name="list_subagents"
                      description="Melihat status seluruh sub-agent yang sedang aktif atau selesai."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Mengembalikan daftar sub-agent, ID, role, jumlah turn, dan status terkini."
                    />
                    <ToolCard
                      name="kill_subagent"
                      description="Menghentikan paksa sub-agent yang sedang berjalan."
                      needsPermission={false}
                      queryFormat="subagentId"
                      howItWorks="Memutus eksekusi ReAct sub-agent dan otomatis menutup jendela browser terisolasinya."
                    />
                  </div>
                </div>

                {/* Kategori Memory */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaSearch className="text-primary" /> Memory & Ingatan
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="memory-search"
                      description="Mencari informasi dari ingatan jangka panjang (catatan dan pembelajaran teknis)."
                      needsPermission={false}
                      queryFormat="Kata kunci (misal: 'password wifi', 'nama ibu')"
                      howItWorks="Menggunakan Vector Similarity (pencarian makna semantik, bukan waktu) untuk mencari memori yang paling cocok."
                      example="Mark, coba cari solusi error koneksi database kemarin."
                    />
                  </div>
                </div>

                {/* Kategori Browser */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaGlobe className="text-secondary" /> Browser Automation
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="browser-navigate"
                      description="Membuka URL di browser fisik Mark secara mandiri."
                      needsPermission={false}
                      queryFormat="URL lengkap (misal: https://google.com)"
                      howItWorks="Membuka jendela browser tersembunyi, memuat halaman, dan memindai semua elemen yang bisa diklik."
                    />
                    <ToolCard
                      name="browser-read"
                      description="Memindai ulang (re-scan) DOM halaman yang sedang terbuka."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Menjalankan ulang DOM Parser setelah menunggu AJAX atau scroll, berguna untuk mendapatkan elemen terbaru."
                    />
                    <ToolCard
                      name="browser-click"
                      description="Mengklik elemen di halaman web berdasarkan ID."
                      needsPermission={false}
                      queryFormat="ID Angka (misal: 3)"
                      howItWorks="Menemukan tombol di layar, lalu mengkliknya secara otomatis dengan animasi SVG Cursor."
                    />
                    <ToolCard
                      name="browser-type"
                      description="Mengetik teks ke dalam form atau kolom pencarian."
                      needsPermission={false}
                      queryFormat="ID||teks (misal: 5||Cara membuat kue)"
                      howItWorks="Mengetik langsung ke dalam input box di halaman web dengan native event dispatcher."
                    />
                    <ToolCard
                      name="browser-scroll"
                      description="Scroll halaman ke atas atau ke bawah."
                      needsPermission={false}
                      queryFormat="up atau down"
                      howItWorks="Melakukan scroll sejauh 600px lalu re-scan elemen DOM."
                    />
                    <ToolCard
                      name="browser-ask-user"
                      description="Minta bantuan Anda secara manual jika mentok (seperti form Login atau CAPTCHA)."
                      needsPermission={false}
                      queryFormat="Pesan bantuan (misal: 'Tolong isi captcha ini')"
                      howItWorks="Memunculkan browser ke layar Anda dan menunggu Anda menyelesaikan tugas manual, setelah itu Mark akan melanjutkan otomatisasi."
                    />
                    <ToolCard
                      name="browser-close"
                      description="Menutup browser fisik Mark."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Menghemat RAM dengan menutup jendela browser rahasia Mark setelah misinya selesai."
                    />
                  </div>
                </div>

                {/* Kategori PC Automation */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaTerminal className="text-warning" /> PC Automation Engine
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ToolCard
                      name="os-control-open"
                      description="Membuka session kontrol Mark di komputer Anda."
                      needsPermission={true}
                      queryFormat="(kosong)"
                      howItWorks="Mengunci sesi kontrol sementara, mengaktifkan pengunci mouse dan floating banner keamanan, serta meminta izin konfirmasi dari pengguna sebelum mengambil alih PC."
                    />
                    <ToolCard
                      name="os-control-close"
                      description="Menutup session kontrol Mark di komputer Anda."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Menutup sesi kontrol otomatisasi PC, menghentikan pengunci mouse, serta menghilangkan floating banner keamanan di layar."
                    />
                    <ToolCard
                      name="os-read"
                      description="Membaca elemen GUI aplikasi Windows aktif via UIAutomation/OCR."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Mengambil Accessibility Tree dan mengubah elemen tombol/input menjadi JSON teks ber-ID untuk hemat 90% token."
                    />
                    <ToolCard
                      name="os-click"
                      description="Klik mouse pada elemen GUI desktop."
                      needsPermission={false}
                      queryFormat="id atau x||y"
                      howItWorks="Mengklik elemen berdasarkan nomor ID dari os-read atau koordinat layar absolut."
                    />
                    <ToolCard
                      name="os-type"
                      description="Ketik teks ke input aplikasi Windows."
                      needsPermission={false}
                      queryFormat="id||teks"
                      howItWorks="Fokus ke elemen ID lalu mengetik string teks secara otomatis."
                    />
                    <ToolCard
                      name="os-key"
                      description="Tekan kombinasi tombol keyboard shortcut."
                      needsPermission={false}
                      queryFormat="ctrl+s, alt+tab, win+e"
                      howItWorks="Mengirim kombinasi tombol (shortcut berbahaya di-blacklist dan butuh approval)."
                    />
                    <ToolCard
                      name="os-scroll"
                      description="Scroll mouse wheel di aplikasi aktif."
                      needsPermission={false}
                      queryFormat="down||5"
                      howItWorks="Menggulir layar ke atas atau bawah dengan jumlah tick tertentu."
                    />
                    <ToolCard
                      name="os-open"
                      description="Membuka aplikasi Windows dari Start Menu/Path."
                      needsPermission={false}
                      queryFormat="notepad, calc, winword, etc"
                      howItWorks="Membuka process aplikasi Windows baru (memerlukan persetujuan user)."
                    />
                    <ToolCard
                      name="os-list-windows"
                      description="Melihat daftar semua window aplikasi yang terbuka."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Mengembalikan judul dan PID seluruh aplikasi yang sedang aktif."
                    />
                    <ToolCard
                      name="os-focus-window"
                      description="Membawa window aplikasi ke depan layar."
                      needsPermission={false}
                      queryFormat="judul window"
                      howItWorks="Fokus dan restore window aplikasi yang minimised berdasarkan judulnya."
                    />
                  </div>
                </div>

                {/* Kategori Autonomous Coding & Precision Editing */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaCode className="text-success" /> Autonomous Coding & Precision Editing
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ToolCard
                      name="replace-content"
                      description="Menyunting kode dengan pencocokan teks presisi dan auto-lint syntax check."
                      needsPermission={true}
                      queryFormat="filePath||targetContent||replacementContent"
                      howItWorks="Mencari substring targetContent secara unik di berkas, menggantinya dengan replacementContent, dan otomatis memvalidasi sintaks (Self-Healing)."
                    />
                    <ToolCard
                      name="file-outline"
                      description="Mengekstrak struktur ringkas (fungsi, class, method) dari berkas kode."
                      needsPermission={false}
                      queryFormat="filePath (misal: src/main/index.js)"
                      howItWorks="Menganalisis definisi fungsi dan class tanpa memuat seluruh baris file untuk menghemat token secara masif."
                    />
                    <ToolCard
                      name="find-files"
                      description="Mencari berkas/folder di proyek menggunakan filter pola glob kilat."
                      needsPermission={false}
                      queryFormat="folderPath||*.jsx atau .||*.js"
                      howItWorks="Memindai struktur proyek secara instan dan otomatis melompati node_modules, .git, dist, dan build."
                    />
                    <ToolCard
                      name="grep-search"
                      description="Pencarian teks/kata kunci super cepat berbasis AST filesystem traversal."
                      needsPermission={false}
                      queryFormat="folderPath||keyword atau .||keyword"
                      howItWorks="Mencari referensi fungsi atau teks di seluruh proyek dalam waktu ~10ms tanpa membebani CPU."
                    />
                    <ToolCard
                      name="read-file"
                      description="Membaca isi berkas teks/kode secara lengkap."
                      needsPermission={false}
                      queryFormat="filePath (misal: package.json)"
                      howItWorks="Membaca isi file dari disk dan otomatis menyesuaikan dengan Workspace Root aktif."
                    />
                    <ToolCard
                      name="write-file"
                      description="Membuat berkas baru di workspace (disertai validasi sintaks)."
                      needsPermission={true}
                      queryFormat="filePath||isi teks"
                      howItWorks="Menulis berkas baru ke disk dan menjalankan Self-Healing hook untuk memastikan kode bebas error sintaks."
                    />
                    <ToolCard
                      name="replace-lines"
                      description="Mengganti baris kode tertentu berdasarkan nomor baris awal dan akhir."
                      needsPermission={true}
                      queryFormat="filePath||startLine||endLine||kodeBaru"
                      howItWorks="Mengganti baris spesifik pada berkas target tanpa merusak bagian kode lainnya."
                    />
                    <ToolCard
                      name="delete-file"
                      description="Menghapus berkas dari direktori proyek secara permanen."
                      needsPermission={true}
                      queryFormat="filePath"
                      howItWorks="Menghapus file dari disk setelah mendapatkan persetujuan pengguna."
                    />
                    <ToolCard
                      name="list-dir"
                      description="Melihat daftar berkas dan subdirektori pada path tertentu."
                      needsPermission={false}
                      queryFormat="folderPath atau ."
                      howItWorks="Membaca isi folder dan menampilkan ukuran serta status direktori."
                    />
                  </div>
                </div>

                {/* Kategori Git Version Control */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaGitAlt className="text-warning" /> Git Version Control (VCS)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ToolCard
                      name="git-status"
                      description="Melihat status repository Git, branch aktif, dan daftar berkas termodifikasi."
                      needsPermission={false}
                      queryFormat="folderPath atau ."
                      howItWorks="Menjalankan pemeriksaan git status untuk mengetahui kondisi working tree dan staged files."
                    />
                    <ToolCard
                      name="git-diff"
                      description="Melihat perbedaan baris kode (diff) yang baru saja diubah."
                      needsPermission={false}
                      queryFormat="folderPath atau ."
                      howItWorks="Menghasilkan visualisasi git diff untuk memverifikasi perubahan sebelum di-commit."
                    />
                    <ToolCard
                      name="git-commit"
                      description="Melakukan stage semua perubahan dan membuat commit pesan otomatis."
                      needsPermission={true}
                      queryFormat="folderPath||pesan commit atau .||pesan commit"
                      howItWorks="Menjalankan git add . dan git commit -m secara otonom setelah disetujui."
                    />
                    <ToolCard
                      name="git-revert"
                      description="Mengembalikan berkas ke kondisi commit terakhir (revert / checkout)."
                      needsPermission={true}
                      queryFormat="folderPath||filePath atau .||filePath"
                      howItWorks="Membatalkan perubahan pada file jika terjadi error fatal atau kesalahan koding."
                    />
                  </div>
                </div>

                {/* Kategori Background Task & Terminal Daemon */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaTasks className="text-info" /> Background Task & Terminal Daemon
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ToolCard
                      name="run-task"
                      description="Menjalankan proses terminal/server latar belakang secara non-blocking."
                      needsPermission={true}
                      queryFormat="perintah||cwd (misal: npm run dev||.)"
                      howItWorks="Meluncurkan background task daemon sehingga AI dapat terus bekerja tanpa terhenti oleh server yang berjalan terus."
                    />
                    <ToolCard
                      name="read-task-output"
                      description="Membaca log output terminal terbaru dari background task aktif."
                      needsPermission={false}
                      queryFormat="taskId (misal: task_1)"
                      howItWorks="Mengambil buffer stdout/stderr proses untuk memeriksa apakah server siap atau ada compile error."
                    />
                    <ToolCard
                      name="kill-task"
                      description="Menghentikan proses terminal latar belakang."
                      needsPermission={false}
                      queryFormat="taskId (misal: task_1)"
                      howItWorks="Mematikan proses terminal background dan membersihkan task dari daftar aktif."
                    />
                    <ToolCard
                      name="list-tasks"
                      description="Melihat seluruh background task yang sedang berjalan beserta status & PID."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Mengembalikan daftar task ID, command yang dijalankan, dan waktu mulai proses."
                    />
                  </div>
                </div>

                {/* Kategori System & Powershell */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaTerminal className="text-error" /> System Control
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="run-powershell"
                      description="Menjalankan perintah PowerShell / CMD."
                      needsPermission={true}
                      queryFormat="Perintah mentah (misal: npm install, dir, ping)"
                      howItWorks="Mark akan mengetikkan perintah ini ke terminal sistem. Perintah berbahaya (seperti rm, shutdown) wajib di-acc."
                      example="Coba cek penggunaan RAM komputer gue sekarang."
                    />
                  </div>
                </div>

                {/* Kategori Google Workspace */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaGoogle className="text-info" /> Google Workspace
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="gdrive-info"
                      description="Cek kapasitas/storage sisa Google Drive."
                      needsPermission={false}
                      queryFormat="all"
                      howItWorks="Mengambil informasi kapasitas penyimpanan Google Drive Anda."
                    />
                    <ToolCard
                      name="gdrive-search"
                      description="Cari file di Google Drive."
                      needsPermission={false}
                      queryFormat="kata kunci||start-end"
                      howItWorks="Mencari file/dokumen berdasarkan kata kunci (contoh query: 'dokumen||10-20' untuk paging)."
                    />
                    <ToolCard
                      name="gdrive-list"
                      description="List file di folder Drive."
                      needsPermission={false}
                      queryFormat="folderId||start-end"
                      howItWorks="Melihat isi folder tertentu di Google Drive."
                    />
                    <ToolCard
                      name="gdrive-read"
                      description="Ekstrak isi teks dari Google Docs, Sheets, atau TXT."
                      needsPermission={false}
                      queryFormat="fileId"
                      howItWorks="Membaca dan mengekstrak isi teks dokumen Google Drive."
                    />
                    <ToolCard
                      name="gdrive-upload"
                      description="Upload file teks ke Google Drive."
                      needsPermission={true}
                      queryFormat="nama_file||isi_teks"
                      howItWorks="Mengunggah file teks baru ke Google Drive Anda. Membutuhkan persetujuan."
                    />
                    <ToolCard
                      name="gdrive-create"
                      description="Membuat dokumen/folder baru."
                      needsPermission={true}
                      queryFormat="nama_file||doc/sheet/folder"
                      howItWorks="Membuat entitas baru (Docs, Sheets, atau Folder) di Google Drive."
                    />
                    <ToolCard
                      name="gdrive-move"
                      description="Memindahkan file di Google Drive."
                      needsPermission={true}
                      queryFormat="fileId||folderId"
                      howItWorks="Memindahkan file ke dalam folder tertentu."
                    />
                    <ToolCard
                      name="gdrive-copy"
                      description="Menduplikasi file di Google Drive."
                      needsPermission={true}
                      queryFormat="fileId||nama_baru"
                      howItWorks="Menyalin file dengan nama baru."
                    />

                    <ToolCard
                      name="gcalendar-list"
                      description="Lihat jadwal atau acara di Google Calendar."
                      needsPermission={false}
                      queryFormat="start-end||YYYY-MM-DDTHH:mm:ssZ"
                      howItWorks="Melihat jadwal mendatang. Query contoh: '10-20||2023-10-01T00:00:00Z'."
                    />
                    <ToolCard
                      name="gcalendar-create"
                      description="Membuat jadwal acara baru."
                      needsPermission={true}
                      queryFormat="Judul||Deskripsi||Waktu_Mulai(ISO)||Waktu_Selesai(ISO)"
                      howItWorks="Menambahkan jadwal ke Google Calendar Anda. Membutuhkan persetujuan."
                    />
                    <ToolCard
                      name="gcalendar-delete"
                      description="Menghapus jadwal/acara."
                      needsPermission={true}
                      queryFormat="eventId"
                      howItWorks="Menghapus event dari kalender Anda. Membutuhkan persetujuan."
                    />

                    <ToolCard
                      name="gmail-search"
                      description="Mencari email masuk."
                      needsPermission={false}
                      queryFormat="query_gmail||start-end"
                      howItWorks="Mencari email menggunakan standar query Gmail (misal: 'is:unread||10-20')."
                    />
                    <ToolCard
                      name="gmail-list"
                      description="Membaca email masuk (Inbox)."
                      needsPermission={false}
                      queryFormat="start-end"
                      howItWorks="Melihat list email terbaru di kotak masuk Anda."
                    />
                    <ToolCard
                      name="gmail-read"
                      description="Membaca isi pesan email tertentu."
                      needsPermission={false}
                      queryFormat="messageId"
                      howItWorks="Membaca isi teks dari sebuah email secara penuh."
                    />
                    <ToolCard
                      name="gmail-send"
                      description="Mengirim email baru."
                      needsPermission={true}
                      queryFormat="email_tujuan||Subjek||Isi_pesan"
                      howItWorks="Mengirim email ke tujuan yang ditentukan. Membutuhkan persetujuan Anda."
                    />
                    <ToolCard
                      name="gmail-mark-read"
                      description="Menandai email sebagai sudah dibaca."
                      needsPermission={false}
                      queryFormat="messageId"
                      howItWorks="Menghilangkan status unread pada sebuah pesan."
                    />
                  </div>
                </div>

                {/* Kategori YouTube & Media */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaYoutube className="text-error" /> YouTube & Media
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="yt-search"
                      description="Mencari video di YouTube."
                      needsPermission={false}
                      queryFormat="Kata kunci pencarian"
                      howItWorks="Menghasilkan daftar video relevan dengan judul, channel, dan durasi."
                    />
                    <ToolCard
                      name="yt-summary"
                      description="Merangkum isi video YouTube dari transkrip."
                      needsPermission={false}
                      queryFormat="URL Video YouTube"
                      howItWorks="Mark menarik subtitle otomatis video dan membaca keseluruhan isinya untuk merangkum poin penting tanpa harus menonton."
                    />
                  </div>
                </div>

                {/* Kategori Music */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaMusic className="text-info" /> YouTube Music Player
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="music-play"
                      description="Mencari dan memutar lagu secara otomatis."
                      needsPermission={false}
                      queryFormat="Judul Lagu / Artis"
                      howItWorks="Mencari di database YT Music dan otomatis memutar audio dari background proses."
                      example="Putar lagunya Nadin Amizah dong."
                    />
                    <ToolCard
                      name="music-search"
                      description="Mencari lagu tanpa memutarnya."
                      needsPermission={false}
                      queryFormat="Judul Lagu / Artis"
                      howItWorks="Menampilkan daftar 5 lagu teratas hasil pencarian YT Music."
                    />
                    <ToolCard
                      name="music-toggle"
                      description="Pause atau Lanjutkan (Resume) lagu."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Mengontrol pemutar lagu latar belakang."
                    />
                    <ToolCard
                      name="music-next"
                      description="Pindah ke lagu selanjutnya."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Skip trek saat ini."
                    />
                    <ToolCard
                      name="music-prev"
                      description="Kembali ke lagu sebelumnya."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Mengulang trek sebelumnya."
                    />
                  </div>
                </div>

                {/* Kategori Vision */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaCamera className="text-warning" /> Vision & Kamera
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="analyze-screen"
                      description="Mengambil screenshot layar dan menganalisisnya."
                      needsPermission={false}
                      queryFormat="Prompt spesifik (misal: 'Baca teks error di layar')"
                      howItWorks="Membaca piksel dari monitor Anda secara real-time dan diproses oleh Vision AI multi-modal."
                    />
                    <ToolCard
                      name="camera-look"
                      description="Mengaktifkan webcam untuk melihat dunia nyata."
                      needsPermission={false}
                      queryFormat="Prompt spesifik"
                      howItWorks="Menarik frame dari webcam untuk melihat ekspresi Anda atau benda fisik yang ditunjukkan. Kamera bisa dinonaktifkan di pengaturan."
                    />
                  </div>
                </div>

                {/* Kategori Communication */}
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <FaTelegram className="text-info" /> Komunikasi & Suara
                  </h3>
                  <div className="space-y-3">
                    <ToolCard
                      name="speak"
                      description="Mengucapkan teks secara lisan (Text-to-Speech)."
                      needsPermission={false}
                      queryFormat="Teks yang akan diucapkan"
                      howItWorks="Mensintesis suara Mark lewat speaker menggunakan teknologi Edge-TTS yang natural."
                    />
                    <ToolCard
                      name="tg-send"
                      description="Mengirim pesan Telegram ke User ID tertentu."
                      needsPermission={false}
                      queryFormat="ChatID||Isi Pesan"
                      howItWorks="Chat ID Telegram tujuan (contoh: 123456789)."
                    />
                    <ToolCard
                      name="screenshot-to-tg"
                      description="Mengambil screenshot dan mengirimnya ke chat Telegram."
                      needsPermission={false}
                      queryFormat="(kosong)"
                      howItWorks="Hanya bisa dipanggil saat user chatting dengan Mark lewat Telegram."
                    />
                  </div>
                </div>

              </div>
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
