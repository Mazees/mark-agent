import { useState, useEffect } from 'react'
import { getAllMemory, getAllConfig, saveConfiguration, deleteMemory, db } from '../api/db'

const Configuration = () => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    temperature: 0,
    context: 10
  })
  const [memories, setMemories] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(true)

  useEffect(() => {
    loadConfig()
    loadMemories()
  }, [])

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) setConfig(data[0])
  }

  const loadMemories = async () => {
    setLoadingMemory(true)
    const data = await getAllMemory()
    setMemories(data)
    setLoadingMemory(false)
  }

  const handleDeleteMemory = async (mem) => {
    await deleteMemory({ id: mem.id })
    setMemories((prev) => prev.filter((m) => m.id !== mem.id))
  }

  const handleClearAllChat = () => {
    document.getElementById('confirm_clear_chat').showModal()
  }

  const confirmClearChat = async () => {
    await db.sessions.clear()
    document.getElementById('confirm_clear_chat').close()
  }

  const handleExportChat = async () => {
    const sessions = await db.sessions.toArray()
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-chat-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const groupedMemories = memories.reduce((acc, mem) => {
    const type = mem.type || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(mem)
    return acc
  }, {})

  const typeBadgeColor = {
    profile: 'badge-primary',
    preference: 'badge-secondary',
    skill: 'badge-accent',
    project: 'badge-info',
    transaction: 'badge-warning',
    goal: 'badge-success',
    relationship: 'badge-error',
    fact: 'badge-neutral',
    other: 'badge-ghost'
  }

  return (
    <div className="w-full h-full overflow-y-auto no-scrollbar">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold">Setup Mark!</h1>
          <p className="opacity-50 text-sm mt-1">Atur perilaku Mark sesuai kebutuhanmu.</p>
        </div>

        {/* ── AI Engine & Tools ── */}
        <section className="space-y-5">
          <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
            AI Engine & Tools
          </h2>

          {/* Model Selector */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Model Selector</p>
            <input
              type="text"
              placeholder="Contoh: google/gemma-3-4b"
              className="input input-bordered w-full"
              value={config.model}
              onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
            />
            <p className="text-xs opacity-40">
              Nama model yang aktif di LM Studio. Pastikan sudah ter-load.
            </p>
          </div>

          {/* System Persona */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Gaya Bicara dan Kepribadian</p>
            <textarea
              className="textarea textarea-bordered w-full h-28 leading-relaxed"
              placeholder="Deskripsikan kepribadian Mark..."
              value={config.personality}
              onChange={(e) => setConfig((prev) => ({ ...prev, personality: e.target.value }))}
            />
            <p className="text-xs opacity-40">
              Tentukan gaya bicara dan karakter Mark di system prompt.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Temperature</p>
              <span className="font-mono text-sm text-primary font-bold">{config.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              className="range range-primary range-xs w-full"
              onChange={(e) => setConfig((prev) => ({ ...prev, temperature: e.target.value }))}
            />
            <div className="flex justify-between px-2.5 mt-2 text-xs">
              <span>0</span>
              <span>0.2</span>
              <span>0.4</span>
              <span>0.6</span>
              <span>0.8</span>
              <span>1.0</span>
            </div>
            <p className="text-xs opacity-40">
              Semakin tinggi temperature, semakin kreatif dan variatif jawaban Mark, tapi bisa jadi
              kurang
            </p>
          </div>

          {/* Context Window */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Context Window</p>
              <span className="font-mono text-sm text-primary font-bold">{config.context}</span>
            </div>
            <input
              type="range"
              min="5"
              max="25"
              value={config.context}
              className="range range-primary range-xs w-full"
              onChange={(e) => setConfig((prev) => ({ ...prev, context: e.target.value }))}
            />
            <div className="flex justify-between px-2.5 mt-2 text-xs">
              <span>5</span>
              <span>10</span>
              <span>15</span>
              <span>20</span>
              <span>25</span>
            </div>
            <p className="text-xs opacity-40">
              Jumlah pesan yang dikirim ke AI sebagai konteks. Makin banyak = makin pintar tapi
              makin berat.
            </p>
          </div>
        </section>

        <div className="divider"></div>

        {/* ── Memory & Data ── */}
        <section className="space-y-5">
          <h2 className="text-base font-bold uppercase tracking-wider opacity-70">Memory & Data</h2>

          {/* Chat History */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Chat History</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-soft btn-error btn-sm" onClick={handleClearAllChat}>
                Hapus Semua Chat
              </button>
              <button className="btn btn-soft btn-info btn-sm" onClick={handleExportChat}>
                Export Chat ke JSON
              </button>
            </div>
          </div>

          {/* Memory & Knowledge Base */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Memory & Knowledge Base</p>
              <span className="badge badge-sm badge-outline badge-primary">
                {memories.length} item
              </span>
            </div>

            {loadingMemory ? (
              <div className="flex justify-center py-10">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-10 opacity-30">
                <p className="text-sm">Belum ada memori tersimpan.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-100 overflow-y-auto no-scrollbar">
                {Object.entries(groupedMemories)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([type, mems]) => (
                    <div key={type} className="collapse collapse-arrow bg-base-200 rounded-xl">
                      <input type="checkbox" />
                      <div className="collapse-title text-sm font-semibold min-h-0 py-3">
                        <span
                          className={`badge badge-xs mr-2 ${typeBadgeColor[type] || 'badge-ghost'}`}
                        >
                          {type}
                        </span>
                        <span className="opacity-40 text-xs">({mems.length})</span>
                      </div>
                      <div className="collapse-content space-y-1.5 px-4 pb-3">
                        {mems.map((mem) => (
                          <div
                            key={mem.id}
                            className="flex items-start justify-between gap-3 bg-base-300 rounded-lg p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-primary truncate">{mem.key}</p>
                              <p className="text-xs opacity-60 mt-0.5 line-clamp-2">{mem.memory}</p>
                            </div>
                            <button
                              className="btn btn-ghost btn-xs text-error shrink-0"
                              onClick={() => handleDeleteMemory(mem)}
                              title="Hapus memori ini"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            onClick={async () => {
              saveConfiguration(config)
            }}
            className="btn btn-primary px-8"
          >
            Simpan Pengaturan
          </button>
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Chat */}
      <dialog id="confirm_clear_chat" className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg text-error">Hapus Semua Chat?</h3>
          <p className="py-4 text-sm opacity-60">
            Semua riwayat sesi chat akan dihapus permanen dan tidak bisa dikembalikan.
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost btn-sm">Batal</button>
            </form>
            <button className="btn btn-error btn-sm" onClick={confirmClearChat}>
              Ya, Hapus Semua
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  )
}

export default Configuration
