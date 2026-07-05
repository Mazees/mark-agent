import Editor from '@monaco-editor/react'
import Swal from 'sweetalert2'
import { driver } from 'driver.js'
import { FaTimes, FaExclamationTriangle, FaChevronLeft } from 'react-icons/fa'
import 'driver.js/dist/driver.css'
import { useEffect, useState } from 'react'

export default function Plugins() {
  const [plugins, setPlugins] = useState([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    actions: [{ name: '', description: '', triggerHint: '', code: '' }],
    isEdit: false
  })
  const [formStatus, setFormStatus] = useState(null)
  const [syntaxErrors, setSyntaxErrors] = useState([])

  useEffect(() => {
    const errors = []
    formData.actions.forEach((act, index) => {
      if (act.code) {
        try {
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
          new AsyncFunction('query', act.code)
          errors[index] = null
        } catch (err) {
          errors[index] = err.message
        }
      } else {
        errors[index] = null
      }
    })
    setSyntaxErrors(errors)
  }, [formData.actions])

  const updateAction = (index, field, value) => {
    const newActions = [...formData.actions]
    newActions[index][field] = value
    setFormData({ ...formData, actions: newActions })
  }

  const addAction = () => {
    setFormData({
      ...formData,
      actions: [...formData.actions, { name: '', description: '', triggerHint: '', code: '' }]
    })
  }

  const removeAction = (index) => {
    if (formData.actions.length <= 1) return
    Swal.fire({
      title: 'Yakin mau hapus action ini?',
      text: "Code yang ada di action ini bakal hilang!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff5f56',
      cancelButtonColor: '#4b5563',
      confirmButtonText: 'Ya, Hapus!',
      cancelButtonText: 'Batal',
      background: '#1d232a',
      color: '#a6adbb',
      customClass: {
        popup: 'rounded-2xl border border-white/5',
        confirmButton: 'rounded-xl',
        cancelButton: 'rounded-xl'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const newActions = formData.actions.filter((_, i) => i !== index)
        setFormData({ ...formData, actions: newActions })
      }
    })
  }

  const loadData = async () => {
    const data = await window.api.getPlugins()
    setPlugins(data || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenFolder = async () => {
    await window.api.openPluginFolder()
  }

  const handleReload = async () => {
    await window.api.reloadPlugins()
    loadData()
  }

  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      nextBtnText: 'Lanjut',
      prevBtnText: 'Kembali',
      doneBtnText: 'Siap Ngoding!',
      steps: [
        {
          element: '#btn-tambah-plugin',
          popover: {
            title: '1. Buat Plugin',
            description: 'Klik tombol ini untuk membuat fungsi/plugin baru. Fitur baru yang kamu tulis di sini bakal otomatis dipahami oleh Mark.',
            side: 'bottom',
            align: 'start'
          }
        },
        {
          element: '#btn-buka-folder',
          popover: {
            title: '2. Folder Fisik',
            description: 'Plugin yang kamu buat disimpan dalam file .js sungguhan. Kamu bisa klik ini untuk ngedit file-filenya pakai VS Code secara manual.',
            side: 'bottom'
          }
        },
        {
          element: '#btn-reload-plugin',
          popover: {
            title: '3. Reload Plugin',
            description: 'Kalau kamu abis ngedit file plugin secara manual lewat VS Code, tekan tombol ini supaya Mark memuat ulang versi terbarunya.',
            side: 'bottom'
          }
        }
      ]
    })
    driverObj.drive()
  }

  const openCreateForm = () => {
    setFormData({
      name: '',
      description: '',
      dependencies: '',
      actions: [{ name: '', description: '', triggerHint: '', code: '' }],
      isEdit: false
    })
    setFormStatus(null)
    setIsFormOpen(true)
  }

  const openEditForm = (plugin) => {
    setFormData({
      name: plugin.name,
      description: plugin.description,
      dependencies: plugin.dependencies ? plugin.dependencies.join(', ') : '',
      actions: plugin.actions.map((act) => ({
        name: act.name,
        description: act.description,
        triggerHint: act.triggerHint,
        code: act.code || '// Kode tidak ditemukan\nreturn "Hello";'
      })),
      isEdit: true
    })
    setFormStatus(null)
    setIsFormOpen(true)
  }

  return (
    <div className="h-screen bg-[var(--base-300)] text-white overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="p-8 w-full max-w-5xl mx-auto pb-40 mt-12">
          <style>{`
            .editor-container {
              /* container styles if needed */
            }
          `}</style>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => window.history.back()} 
                className="btn btn-ghost btn-sm btn-circle"
              >
                <FaChevronLeft size={16} />
              </button>
              <div>
                <h1 className="text-3xl font-bold">Plugin Manager</h1>
                <p className="opacity-70 mt-1">Buat dan kelola custom skill lokal buat Mark</p>
              </div>
            </div>
        <div className="flex gap-2">
          <button onClick={startTour} className="btn btn-ghost btn-circle" title="Tutorial Plugin">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button id="btn-tambah-plugin" onClick={openCreateForm} className="btn btn-primary">
            + Tambah Plugin
          </button>
          <button
            id="btn-buka-folder"
            onClick={handleOpenFolder}
            className="btn btn-outline border-base-content/20 hover:border-primary hover:bg-primary/10 hover:text-primary"
          >
            Buka Folder
          </button>
          <button id="btn-reload-plugin" onClick={handleReload} className="btn btn-primary">
            Reload
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-base-100 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-base-content/10">
            <div className="p-6 border-b border-base-content/10 flex justify-between items-center bg-base-200/50">
              <h2 className="text-2xl font-bold">
                {formData.isEdit ? 'Edit Plugin' : 'Buat Plugin Baru'}
              </h2>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setIsFormOpen(false)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {formStatus && (
                <div
                  className={`alert mb-6 py-3 shadow-sm ${formStatus.success ? 'alert-success' : 'alert-error'}`}
                >
                  {formStatus.message}
                </div>
              )}

              <div className="grid grid-cols-1 gap-6">
                <div className="flex gap-4 p-4 bg-base-200/30 rounded-xl border border-base-content/10">
                  <div className="form-control flex-1">
                    <label className="label font-semibold">
                      <span className="label-text">Nama Plugin</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full bg-base-200/50 focus:bg-base-100 transition-colors"
                      placeholder="Cth: Kalkulator"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={formData.isEdit}
                    />
                    {formData.isEdit && (
                      <span className="text-xs opacity-50 mt-1">
                        Nama plugin tidak bisa diubah saat edit
                      </span>
                    )}
                  </div>
                  <div className="form-control flex-1">
                    <label className="label font-semibold">
                      <span className="label-text">Deskripsi Plugin</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full bg-base-200/50 focus:bg-base-100 transition-colors"
                      placeholder="Cth: Kumpulan alat matematika"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-control w-full p-4 bg-base-200/30 rounded-xl border border-base-content/10">
                  <label className="label font-semibold">
                    <span className="label-text">Dependencies (Library NPM)</span>
                    <span className="label-text-alt opacity-70">Opsional</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full bg-base-200/50 focus:bg-base-100 transition-colors"
                    placeholder="Cth: axios, cheerio, moment"
                    value={formData.dependencies}
                    onChange={(e) => setFormData({ ...formData, dependencies: e.target.value })}
                  />
                  <span className="text-xs opacity-50 mt-2">
                    Pisahkan dengan koma. Library akan otomatis di-install (npm install) saat
                    disimpan.
                  </span>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <h3 className="text-lg font-bold">Daftar Actions</h3>
                  <button className="btn btn-sm btn-outline btn-accent" onClick={addAction}>
                    + Tambah Action
                  </button>
                </div>

                {formData.actions.map((act, idx) => (
                  <div
                    key={idx}
                    className="relative p-6 bg-base-200/30 rounded-xl border border-base-content/10 grid grid-cols-1 md:grid-cols-2 gap-6 group"
                  >
                    {formData.actions.length > 1 && (
                      <button
                        className="btn btn-xs btn-error btn-outline transition-all absolute top-5 right-5 transition-opacity z-20"
                        onClick={() => removeAction(idx)}
                        title="Hapus Action"
                      >
                        DELETE
                      </button>
                    )}

                    <div className="space-y-4">
                      <div className="form-control w-full">
                        <label className="label font-semibold">
                          <span className="label-text">
                            Deskripsi Action <span className="opacity-50 text-xs">#{idx + 1}</span>
                          </span>
                        </label>
                        <input
                          type="text"
                          className="input input-bordered w-full bg-base-200/50"
                          placeholder="Cth: Menjumlahkan dua angka"
                          value={act.description}
                          onChange={(e) => updateAction(idx, 'description', e.target.value)}
                        />
                      </div>
                      <div className="form-control w-full">
                        <label className="label font-semibold">
                          <span className="label-text">
                            Trigger Hint{' '}
                            <span className="opacity-50 font-normal">(Kapan AI Pakai Ini?)</span>
                          </span>
                        </label>
                        <input
                          type="text"
                          className="input input-bordered w-full bg-base-200/50"
                          placeholder="Cth: user ingin menambah angka"
                          value={act.triggerHint}
                          onChange={(e) => updateAction(idx, 'triggerHint', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-control w-full h-full flex flex-col">
                      <label className="label font-semibold flex justify-between items-end pb-1">
                        <span className="label-text flex items-center gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                          </svg>
                          Kode Node.js
                        </span>
                      </label>
                      <div className="relative mt-2 flex-1 rounded-xl overflow-hidden border border-neutral/50 bg-[#1e1e1e] shadow-inner focus-within:ring-2 focus-within:ring-primary/50 transition-all">
                        <div className="absolute top-0 left-0 w-full h-8 bg-[#2d2d2d] border-b border-white/5 flex items-center px-4 gap-1.5 z-10 shadow-sm">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                          <span className="ml-2 text-xs font-mono text-white/40">
                            {act.name ? act.name : 'action'}.js
                          </span>
                          {syntaxErrors[idx] && (
                            <span
                              className="ml-auto text-[10px] text-error font-bold max-w-[150px] truncate"
                              title={syntaxErrors[idx]}
                            >
                              <FaExclamationTriangle className="inline mr-1" /> Error
                            </span>
                          )}
                        </div>

                        <div className="w-full h-full min-h-[200px] pt-10 pb-4 bg-[#1e1e1e] flex flex-col">
                          <div
                            className="px-4 pb-1 text-sm font-mono flex items-center flex-wrap"
                            style={{
                              fontFamily:
                                'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
                            }}
                          >
                            <span className="text-[#c678dd]">async function</span>
                            <input
                              type="text"
                              className="bg-transparent outline-none border-b border-dashed border-[#56b6c2]/50 focus:border-[#56b6c2] text-[#61afef] px-1 mx-2 w-32 focus:w-48 transition-all placeholder-[#61afef]/30"
                              placeholder="nama-action"
                              spellCheck="false"
                              value={act.name}
                              onChange={(e) => updateAction(idx, 'name', e.target.value)}
                            />
                            <span className="text-[#abb2bf]">(</span>
                            <span className="text-[#e06c75]">{`{ query }`}</span>
                            <span className="text-[#abb2bf]">) {`{`}</span>
                          </div>

                          <div className="flex-1 overflow-auto relative">
                            <Editor
                              height="150px"
                              defaultLanguage="javascript"
                              theme="vs-dark"
                              value={act.code}
                              onChange={(value) => updateAction(idx, 'code', value || '')}
                              options={{
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 14,
                                fontFamily: 'Consolas, Monaco, monospace',
                                padding: { top: 16, bottom: 16 },
                                overviewRulerLanes: 0,
                                hideCursorInOverviewRuler: true,
                                scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                                lineNumbers: 'off',
                                glyphMargin: false,
                                folding: false,
                                lineDecorationsWidth: 0,
                                lineNumbersMinChars: 0
                              }}
                              className="border-l border-white/10 ml-4"
                            />
                          </div>

                          <div
                            className="px-4 pt-1 text-sm font-mono text-[#abb2bf]"
                            style={{
                              fontFamily:
                                'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
                            }}
                          >
                            {`}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-action mt-8 pt-4 border-t border-base-content/10">
                <button
                  className="btn btn-ghost"
                  onClick={() => setIsFormOpen(false)}
                  disabled={formStatus?.loading}
                >
                  Batal
                </button>
                <button
                  className="btn btn-primary px-8"
                  disabled={formStatus?.loading}
                  onClick={async () => {
                    setFormStatus({
                      loading: true,
                      message: 'Menyimpan dan menginstall library (jika ada)...'
                    })
                    if (!formData.name)
                      return setFormStatus({ success: false, message: 'Nama Plugin wajib diisi' })
                    for (let i = 0; i < formData.actions.length; i++) {
                      if (!formData.actions[i].name || !formData.actions[i].code) {
                        return setFormStatus({
                          success: false,
                          message: `Nama & Kode Action #${i + 1} wajib diisi`
                        })
                      }
                      if (syntaxErrors[i]) {
                        return setFormStatus({
                          success: false,
                          message: `Ada error syntax di Action #${i + 1} bro!`
                        })
                      }
                    }

                    const res = await window.api.createPlugin(formData)
                    if (res.success) {
                      setFormStatus({
                        success: true,
                        message: 'Plugin berhasil dibuat! Me-reload...'
                      })
                      setFormData({
                        name: '',
                        description: '',
                        actions: [{ name: '', description: '', triggerHint: '', code: '' }]
                      })
                      loadData()
                      setTimeout(() => setIsFormOpen(false), 1500)
                    } else {
                      setFormStatus({ success: false, message: res.error })
                    }
                  }}
                >
                  {formStatus?.loading ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    'Simpan Plugin'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {plugins.length === 0 && !isFormOpen ? (
        <div className="alert alert-info shadow-lg border border-info/20 bg-info/10 text-info">
          Belum ada plugin yang terinstall. Buka folder atau klik Tambah Plugin.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map((pl, i) => (
            <div
              key={i}
              className="card bg-base-200/50 shadow-xl border border-base-content/10 backdrop-blur-md flex flex-col"
            >
              <div className="card-body flex flex-col h-full">
                <h2 className="card-title text-primary">
                  {pl.name}{' '}
                  <span className="text-xs opacity-50 bg-base-300 px-2 py-1 rounded-full">
                    v{pl.version || '1.0.0'}
                  </span>
                </h2>
                <p className="text-sm opacity-80 flex-1">{pl.description}</p>
                <div className="mt-4">
                  <span className="text-xs font-bold uppercase opacity-50">Available Actions:</span>
                  <ul className="list-disc ml-4 text-xs mt-1 space-y-1">
                    {pl.actions?.map((act) => (
                      <li key={act.name}>
                        <span className="font-mono text-accent bg-accent/10 px-1 rounded">
                          {act.name}
                        </span>{' '}
                        <span className="opacity-70">- {act.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2 w-full mt-6 pt-4 border-t border-base-content/10">
                  <button
                    className="btn btn-sm btn-outline flex-1"
                    onClick={() => window.api.openSpecificFolder(pl.folderPath)}
                  >
                    Buka Folder
                  </button>
                  <button
                    className="btn btn-sm btn-primary flex-1"
                    onClick={() => openEditForm(pl)}
                  >
                    Edit Plugin
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
