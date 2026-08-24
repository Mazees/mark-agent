import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ingestDocument } from '../api/ragPipeline'
import { getAllDocuments, deleteDocumentByName } from '../api/db'
import { deleteDocumentFromOrama } from '../api/oramaStore'
import { useConfirm } from '../hooks/useConfirm'

const Knowledge = () => {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { confirm, ModalComponent } = useConfirm()

  const [toastMessage, setToastMessage] = useState(null)

  const showToast = (message) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const loadData = useCallback(async () => {
    try {
      const allDocs = await getAllDocuments()
      const uniqueDocs = Array.from(new Set(allDocs.map((d) => d.docName))).map((name) => {
        const chunks = allDocs.filter((d) => d.docName === name)
        return {
          name,
          chunks: chunks.length,
          timestamp: chunks[0]?.timestamp || 0
        }
      })
      setDocuments(uniqueDocs.sort((a, b) => b.timestamp - a.timestamp))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      await ingestDocument(file, (progress) => {
        setUploadProgress(progress)
      })
      await loadData()
      showToast('Dokumen berhasil di-ingest!')
    } catch (error) {
      console.error(error)
      await confirm({
        title: 'Gagal Ingest',
        message: error.message,
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (e.target) e.target.value = ''
    }
  }

  const handleDeleteDocument = async (docName) => {
    const result = await confirm({
      title: 'Hapus Dokumen?',
      message: `Yakin ingin menghapus dokumen "${docName}"? Mark tidak akan bisa mengingat informasi dari dokumen ini lagi.`,
      isError: true,
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    })

    if (!result.isConfirmed) return

    try {
      const allDocs = await getAllDocuments()
      const chunks = allDocs.filter((d) => d.docName === docName)

      for (const chunk of chunks) {
        await deleteDocumentByName(docName)
        if (chunk.oramaId) {
          await deleteDocumentFromOrama(chunk.oramaId)
        }
      }

      await loadData()
      showToast('Dokumen berhasil dihapus')
    } catch (error) {
      console.error(error)
      await confirm({
        title: 'Oops...',
        message: 'Gagal menghapus dokumen',
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
    }
  }

  return (
    <div className="h-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-32 space-y-8">
          {/* Page Header */}
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
              <h1 className="text-2xl font-bold">Document Knowledge</h1>
              <p className="opacity-50 text-sm mt-1">
                Inject dokumen lokal untuk dipelajari oleh Mark AI.
              </p>
            </div>
          </div>

          <section className="space-y-5">
            <div className="card bg-base-100/50 backdrop-blur-xl border border-base-content/10 shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-base font-bold uppercase tracking-wider opacity-70">
                  Upload Dokumen Baru
                </h2>
                <p className="text-sm opacity-50 mb-2">
                  Pilih file PDF, TXT, MD, atau DOCX. Mark akan membaca dan memprosesnya menjadi
                  bagian dari ingatannya (RAG).
                </p>

                <div className="form-control">
                  <input
                    type="file"
                    className="file-input file-input-bordered file-input-primary w-full"
                    accept=".pdf,.txt,.md,.docx"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </div>

                {isUploading && (
                  <div className="w-full mt-4">
                    <progress
                      className="progress progress-primary w-full"
                      value={uploadProgress}
                      max="100"
                    ></progress>
                    <p className="text-xs text-center mt-2 opacity-50">
                      Memproses: {uploadProgress}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                Dokumen Tersimpan
              </h2>
              <span className="badge badge-sm badge-outline badge-primary">
                {documents.length} dokumen
              </span>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
              {documents.length === 0 ? (
                <div className="text-center py-10 opacity-30 bg-base-200/30 rounded-xl border border-base-content/5">
                  <p className="text-sm">Belum ada dokumen yang di-inject.</p>
                </div>
              ) : (
                documents.map((doc, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-base-200/50 backdrop-blur-sm p-4 rounded-xl hover:bg-base-300 transition-colors border border-base-content/5 gap-3"
                  >
                    <div className="truncate pr-2">
                      <p className="font-semibold truncate text-sm" title={doc.name}>
                        {doc.name}
                      </p>
                      <div className="flex gap-2 mt-1 items-center">
                        <span className="badge badge-xs badge-secondary">{doc.chunks} chunks</span>
                        <span className="text-xs opacity-40">
                          Diunggah {new Date(doc.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-outline btn-error btn-sm shrink-0"
                      onClick={() => handleDeleteDocument(doc.name)}
                    >
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
      <ModalComponent />
      
      {toastMessage && (
        <div className="toast toast-top toast-end z-[9999]">
          <div className="alert alert-success shadow-lg rounded-xl flex items-center gap-2">
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Knowledge
