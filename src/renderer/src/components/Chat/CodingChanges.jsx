/* eslint-disable react/prop-types */
import { lazy, Suspense } from 'react'
import {
  FileDiff,
  FileText,
  Undo2,
  ChevronDown,
  GitBranch,
  CircleCheck,
  CircleX,
  CircleDashed,
  X
} from 'lucide-react'

const DiffEditor = lazy(() => import('./CodingDiff.jsx'))
const checkLabels = {
  passed: 'Lolos',
  failed: 'Gagal',
  not_checked: 'Belum diperiksa',
  not_applicable: 'Tidak berlaku',
  running: 'Berjalan'
}

export default function CodingChanges({
  scope,
  onScopeChange,
  runs,
  run,
  onRunChange,
  files,
  diff,
  onOpenFile,
  onCloseDiff,
  onUndo,
  loading,
  busy,
  sessionBusy,
  project,
  workspaceDiff,
  onWorktree,
  selectionMissing
}) {
  const checks = run?.checks || []
  const failed = checks.filter((check) => check.status === 'failed').length
  const canUndo = scope === 'latest' && files.some((file) => file.undoAvailable && !file.undone)
  const running = ['running', 'waiting'].includes(run?.status)
  const noGit = scope === 'workspace' && workspaceDiff?.available === false
  const activeWorktree = project?.worktree?.active
  return (
    <div
      className="flex-1 min-h-0 overflow-auto custom-scrollbar"
      aria-label="Tinjauan perubahan kode"
    >
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <header>
          <h2 className="text-base font-semibold text-white/90">Tinjau perubahan kode</h2>
          <p className="mt-1.5 text-xs text-white/60 leading-relaxed max-w-xl">
            Lihat berkas yang diubah, bandingkan isinya, dan periksa hasil pengujiannya.
          </p>
        </header>
        {selectionMissing && (
          <p role="alert" className="text-xs text-error">
            Riwayat giliran yang dipilih tidak tersedia.
          </p>
        )}

        <div className="space-y-3">
          <div
            className="inline-flex max-w-full gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1"
            role="group"
            aria-label="Cakupan perubahan"
          >
            {[
              ['latest', 'Giliran dipilih'],
              ['workspace', 'Seluruh workspace']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => onScopeChange(value)}
                className={`px-3 py-2 text-xs rounded-md transition-colors motion-reduce:transition-none ${scope === value ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-white/55">
            {scope === 'latest'
              ? 'Perubahan workspace selama giliran yang dipilih, termasuk edit bersamaan.'
              : workspaceDiff?.baselineLabel || 'Memuat dasar pembanding workspace...'}
          </p>
          {scope === 'latest' && runs.length > 1 && (
            <label className="flex flex-wrap gap-2 items-center text-xs text-white/60">
              Pekerjaan
              <select
                aria-label="Pilih giliran atau pekerjaan Minibot"
                className="select select-sm bg-base-200 border-white/10 min-w-0 max-w-full text-xs flex-1"
                value={run?.id || ''}
                onChange={(event) => onRunChange(event.target.value)}
              >
                {runs.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    {item.agentName || 'Mark'} · {index === 0 ? 'Terbaru · ' : ''}
                    {new Date(item.createdAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}{' '}
                    · {item.files.length} berkas
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <section
          className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
          aria-labelledby="coding-files-title"
        >
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-white/10">
            <h3 id="coding-files-title" className="text-xs font-medium text-white/80">
              Berkas{' '}
              {files.length > 0 && <span className="ml-1 text-white/55">({files.length})</span>}
            </h3>
            {canUndo && (
              <button
                type="button"
                disabled={busy || running}
                onClick={() => onUndo()}
                title={
                  running
                    ? 'Tunggu pekerjaan Mark selesai'
                    : 'Kembalikan berkas ke keadaan sebelum pekerjaan ini'
                }
                className="inline-flex gap-1.5 items-center text-xs text-white/65 hover:text-white disabled:opacity-40"
              >
                <Undo2 size={13} aria-hidden="true" />
                Urungkan edit
              </button>
            )}
          </div>
          {loading ? (
            <p role="status" className="px-5 py-12 text-xs text-white/60">
              Memuat daftar perubahan...
            </p>
          ) : !files.length ? (
            <div className="px-5 py-10 sm:py-12 text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/60">
                <FileDiff size={23} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h3 className="text-sm font-medium text-white/85">
                {noGit ? 'Diff workspace tidak tersedia' : 'Belum ada perubahan kode'}
              </h3>
              <p className="text-xs text-white/60 leading-6 mt-2 max-w-sm mx-auto">
                {noGit
                  ? workspaceDiff.notice
                  : scope === 'latest'
                    ? run?.captureError ||
                      'Perubahan bersih akan tersedia setelah giliran berakhir. Pilih berkas untuk meninjau perbedaannya.'
                    : 'Berkas proyek belum memiliki perubahan lokal yang terdeteksi oleh Git.'}
              </p>
              {!noGit && scope === 'latest' && (
                <p className="text-[11px] text-white/55 mt-5">
                  Pilih berkas untuk melihat kode sebelum dan sesudah diedit.
                </p>
              )}
              {noGit && (
                <button
                  type="button"
                  onClick={() => onScopeChange('latest')}
                  className="mt-4 text-xs text-primary hover:underline"
                >
                  Lihat giliran
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {files.map((file) => {
                const label = file.relativePath || file.path
                const state = file.undone
                  ? 'Dipulihkan'
                  : file.deleted || file.status?.includes('D')
                    ? 'Dihapus'
                    : file.added || file.status === '??'
                      ? 'Baru'
                      : 'Diubah'
                return (
                  <li
                    key={file.path}
                    className={`flex items-center gap-2 px-3 sm:px-4 ${diff?.path === file.path ? 'bg-primary/[0.07]' : 'hover:bg-white/[0.03]'}`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenFile(file)}
                      aria-pressed={diff?.path === file.path}
                      className="flex items-center gap-3 min-w-0 flex-1 py-3 text-left"
                    >
                      <FileText size={16} className="shrink-0 text-white/55" aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-all text-xs text-white/80">
                        {label}
                      </span>
                      <span
                        className={`text-[10px] shrink-0 ${state === 'Dihapus' ? 'text-error' : state === 'Baru' ? 'text-primary' : 'text-white/55'}`}
                      >
                        {state}
                      </span>
                    </button>
                    {scope === 'latest' && file.undoAvailable && !file.undone && (
                      <button
                        type="button"
                        aria-label={`Urungkan edit ${label}`}
                        disabled={busy || running}
                        onClick={() => onUndo(file.path)}
                        className="p-2 text-white/55 hover:text-white disabled:opacity-40"
                      >
                        <Undo2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {diff && (
          <section
            className="border border-white/10 rounded-xl overflow-hidden"
            aria-label="Perbandingan berkas"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
              <p className="flex-1 min-w-0 text-xs text-white/70 break-all">
                {files.find((file) => file.path === diff.path)?.relativePath || diff.path}
              </p>
              <button
                type="button"
                aria-label="Tutup perbandingan"
                onClick={onCloseDiff}
                className="p-1 text-white/60 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>
            {diff.notice ? (
              <p className="p-4 text-xs text-white/65">{diff.notice}</p>
            ) : (
              <div className="h-80 sm:h-96">
                <Suspense
                  fallback={
                    <p className="p-4 text-xs text-white/60" role="status">
                      Memuat perbandingan kode...
                    </p>
                  }
                >
                  <DiffEditor
                    original={diff.before}
                    modified={diff.after}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      renderSideBySide: false,
                      automaticLayout: true
                    }}
                  />
                </Suspense>
              </div>
            )}
          </section>
        )}

        {(files.length > 0 || checks.length > 0) && (
          <section
            className="border border-white/10 rounded-xl overflow-hidden"
            aria-labelledby="coding-checks-title"
          >
            <div className="px-4 py-3 border-b border-white/10">
              <h3 id="coding-checks-title" className="text-xs font-medium text-white/80">
                Hasil pemeriksaan Mark
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                Hasil build atau pengujian yang dijalankan untuk pekerjaan ini.
              </p>
            </div>
            {!checks.length ? (
              <div className="flex gap-3 p-4">
                <CircleDashed
                  size={17}
                  className="shrink-0 text-white/55 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-white/75">Belum diperiksa</p>
                  <p className="mt-1 text-xs text-white/55 leading-relaxed">
                    Belum ada hasil build atau pengujian yang tercatat. Anda bisa meminta Mark
                    memeriksa perubahan ini.
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-4">
                <p className={`pt-3 text-xs ${failed ? 'text-error' : 'text-white/65'}`}>
                  {failed
                    ? `${failed} pemeriksaan gagal`
                    : `${checks.filter((check) => check.status === 'passed').length} dari ${checks.length} pemeriksaan lolos`}
                </p>
                {checks.map((check) => {
                  const Icon =
                    check.status === 'failed'
                      ? CircleX
                      : check.status === 'passed'
                        ? CircleCheck
                        : CircleDashed
                  return (
                    <details
                      key={check.id}
                      className="py-3 border-b last:border-b-0 border-white/5"
                    >
                      <summary className="flex items-start gap-2 cursor-pointer text-xs list-none">
                        <Icon
                          size={15}
                          aria-hidden="true"
                          className={`mt-0.5 shrink-0 ${check.status === 'failed' ? 'text-error' : check.status === 'passed' ? 'text-primary' : 'text-white/60'}`}
                        />
                        <span className="flex-1 min-w-0 break-all text-white/75">
                          {check.command ||
                            (check.kind === 'syntax' ? 'Pemeriksaan sintaks' : check.kind)}
                        </span>
                        <span className="text-[10px] text-white/60 shrink-0">
                          {checkLabels[check.status] || check.status}
                        </span>
                      </summary>
                      <pre className="mt-3 p-3 rounded-lg bg-black/20 whitespace-pre-wrap break-all font-mono text-xs text-white/65 max-h-52 overflow-auto custom-scrollbar">
                        {check.output || 'Tidak ada output tambahan.'}
                      </pre>
                    </details>
                  )
                })}
              </div>
            )}
          </section>
        )}

        <details className="group border-t border-white/10 pt-4">
          <summary className="flex items-center gap-2 text-xs text-white/60 hover:text-white/80 cursor-pointer list-none">
            <GitBranch size={15} aria-hidden="true" />
            <span className="flex-1">Pengaturan lanjutan</span>
            {activeWorktree && <span className="text-[10px] text-primary">Worktree aktif</span>}
            <ChevronDown size={14} aria-hidden="true" className="group-open:rotate-180" />
          </summary>
          <div className="pt-4 space-y-3">
            <div>
              <h3 className="text-xs font-medium text-white/80">
                {activeWorktree ? 'Folder kerja terpisah aktif' : 'Kerjakan di folder terpisah'}
              </h3>
              <p className="mt-1.5 text-xs leading-6 text-white/60">
                {activeWorktree
                  ? 'Perubahan dikerjakan di worktree. Bawa hasilnya ke proyek utama setelah pekerjaan dan terminal selesai. Mark akan memeriksa konflik sebelum menyalin hasil.'
                  : 'Git worktree menyediakan folder kerja terpisah sehingga proyek utama tidak langsung diubah. Folder dimulai dari commit terakhir; perubahan lokal dan dependensi tidak ikut disalin.'}
              </p>
            </div>
            {activeWorktree && (
              <p className="text-[11px] break-all text-white/55">{project.worktree.root}</p>
            )}
            {!workspaceDiff?.git && !activeWorktree && (
              <p className="text-xs text-white/60">Tersedia untuk proyek yang menggunakan Git.</p>
            )}
            <button
              type="button"
              disabled={busy || sessionBusy || loading || (!workspaceDiff?.git && !activeWorktree)}
              onClick={onWorktree}
              className="btn btn-sm btn-outline border-white/15 text-xs text-white/80 hover:bg-white/5 disabled:opacity-40"
            >
              {activeWorktree ? 'Bawa hasil ke proyek utama' : 'Buat folder kerja terpisah'}
            </button>
          </div>
        </details>
      </div>
    </div>
  )
}
