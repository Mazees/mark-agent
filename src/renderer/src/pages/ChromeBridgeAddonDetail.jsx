import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Code2,
  Copy,
  FolderOpen,
  Globe2,
  LifeBuoy,
  MousePointer2,
  Plus,
  RefreshCw,
  Unplug
} from 'lucide-react'
import AddonDetail from './AddonDetail'
import { getAddon } from '../api/addonRegistry'
import { webApi } from '../api/web-bridge'
import { addonStatusLabels } from '../api/addonStatus'

const explanations = {
  'not-installed': 'Pasang paket bawaan Mark, lalu tambahkan ekstensi ke Chrome.',
  'waiting-extension': 'Bridge aktif. Buka Chrome dan muat ekstensi dari folder di bawah.',
  'select-tab':
    'Ekstensi sudah terhubung. Buka popup Mark Agent Bridge pada tab yang ingin Anda gunakan.',
  connected:
    'Mark dapat bekerja pada tab yang Anda pilih. Berpindah tab tidak mengubah pilihan ini.',
  paused: 'Kendali dijeda dari ekstensi. Tekan Lanjutkan di popup untuk melanjutkan.',
  disconnected: 'Bridge belum aktif. Gunakan Hubungkan ulang untuk mencoba lagi.',
  error: 'Bridge belum dapat dijalankan. Periksa keterangan berikut, lalu coba lagi.'
}

const features = [
  {
    icon: Globe2,
    name: 'Membaca halaman',
    description:
      'Membaca artikel, mengenali tautan dan tombol, serta mengambil informasi dari halaman seperti daftar produk atau data dalam tabel.'
  },
  {
    icon: MousePointer2,
    name: 'Mengisi dan berinteraksi',
    description:
      'Membuka alamat situs, mengeklik tombol, mengisi formulir dan editor teks, serta menggulir halaman pada tab yang dipilih.'
  },
  {
    icon: Code2,
    name: 'JavaScript dan tangkapan layar',
    description:
      'Menjalankan JavaScript untuk tugas pada halaman dan menampilkan tangkapan layar tab tersebut di percakapan Mark.'
  },
  {
    icon: LifeBuoy,
    name: 'Bantuan saat diperlukan',
    description:
      'Meminta bantuan untuk login, CAPTCHA, atau langkah manual. Halaman tetap dapat digunakan selama panel bantuan terbuka.'
  }
]
export default function ChromeBridgeAddonDetail() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const dialog = useRef(null)
  const refresh = useCallback(async () => {
    try {
      setStatus(await webApi.chromeBridgeRequest())
    } catch (failure) {
      setError(failure.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsubscribe = webApi.onChromeBridgeStatus(setStatus)
    window.addEventListener('focus', refresh)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!confirmation) return
    const current = dialog.current
    if (!current) return
    current.showModal()
    return () => {
      if (current.open) current.close()
    }
  }, [confirmation])

  const run = async (operation, values) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await webApi.chromeBridgeRequest(operation, values)
      setStatus(next)
      window.dispatchEvent(new Event('mark-addon-status-changed'))
      if (operation === 'install')
        setNotice(
          'Paket siap. Muat folder ekstensi ke Chrome; jika sudah terpasang, tekan Muat ulang di chrome://extensions.'
        )
      if (operation === 'uninstall')
        setNotice(
          'Add-on telah dihapus. Hapus juga ekstensi Mark Agent Bridge melalui chrome://extensions di Chrome.'
        )
    } catch (failure) {
      if (failure.code === 'LEGACY_PLUGIN_EXISTS') setConfirmation('replace')
      else setError(failure.message)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const copyLocation = async () => {
    try {
      await navigator.clipboard.writeText(status.extensionDirectory)
      setNotice('Lokasi folder ekstensi disalin.')
    } catch {
      setError('Lokasi belum bisa disalin. Pilih teks lokasi di bawah, lalu salin secara manual.')
    }
  }
  const installed = !!status?.installed
  const updateAvailable = installed && status.version !== status.availableVersion

  const actions = !status
    ? [{ label: 'Memeriksa...', disabled: true }]
    : [
        ...(!installed || updateAvailable
          ? [
              {
                key: 'install',
                label: busy ? 'Memasang...' : updateAvailable ? 'Perbarui' : 'Install',
                icon: Plus,
                kind: 'install',
                disabled: busy,
                onClick: () => (status.legacyPlugin ? setConfirmation('replace') : run('install'))
              }
            ]
          : []),
        ...(installed
          ? [
              {
                key: 'reconnect',
                label: 'Hubungkan ulang',
                icon: RefreshCw,
                kind: 'ghost',
                disabled: busy,
                onClick: () => run('reconnect')
              },
              {
                key: 'uninstall',
                label: 'Uninstall',
                icon: Unplug,
                kind: 'danger',
                disabled: busy,
                onClick: () => setConfirmation('uninstall')
              }
            ]
          : [])
      ]
  return (
    <AddonDetail
      addon={getAddon('chrome-bridge')}
      status={status?.status || 'checking'}
      actions={actions}
      feedback={
        <>
          {(error || status?.error) && (
            <p role="alert" className="text-sm text-error">
              {error || status.error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm leading-relaxed text-primary">
              {notice}
            </p>
          )}
        </>
      }
    >
      <p className="text-sm leading-relaxed text-white/65">
        Chrome Bridge menghubungkan Mark ke tab di Google Chrome Anda. Mark dapat membaca halaman,
        mengisi formulir, dan menjalankan tugas di situs yang sudah Anda buka. Pilih tab melalui
        ekstensi <strong className="font-medium text-white/85">Mark Agent Bridge</strong> untuk
        mulai menggunakannya. Sesi login yang sudah aktif di Chrome tetap dapat digunakan.
      </p>
      <section aria-labelledby="chrome-bridge-capabilities" className="mt-9">
        <h2
          id="chrome-bridge-capabilities"
          className="border-b border-white/10 pb-3 text-base font-medium text-white/90"
        >
          Kemampuan <span className="text-white/40">4</span>
        </h2>
        <div className="divide-y divide-white/5">
          {features.map(({ icon: Icon, name, description }) => (
            <div key={name} className="flex gap-4 py-5">
              <Icon size={20} className="mt-0.5 shrink-0 text-white/50" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-medium text-white/85">{name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/50">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="chrome-bridge-info" className="mt-7">
        <h2
          id="chrome-bridge-info"
          className="border-b border-white/10 pb-3 text-base font-medium text-white/90"
        >
          Informasi
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 py-5 text-sm">
          <dt className="text-white/40">Status</dt>
          <dd id="chrome-bridge-connection" className="text-white/75" role="status">
            {addonStatusLabels[status?.status || 'checking']}
          </dd>
          <dt className="text-white/40">Ekstensi</dt>
          <dd className="text-white/75">Mark Agent Bridge</dd>
          <dt className="text-white/40">Pengembang</dt>
          <dd className="text-white/75">MARK</dd>
          <dt className="text-white/40">Koneksi</dt>
          <dd className="text-white/75">Lokal · 127.0.0.1:8765</dd>
          {installed && (
            <>
              <dt className="text-white/40">Versi paket</dt>
              <dd className="text-white/75">{status.version}</dd>
              <dt className="text-white/40">Versi ekstensi</dt>
              <dd className="text-white/75">{status.extensionVersion || 'Belum terhubung'}</dd>
            </>
          )}
        </dl>
        <p className="text-sm leading-relaxed text-white/50">{explanations[status?.status]}</p>
        {status?.controlledTab && (
          <div className="mt-4 min-w-0 text-sm">
            <p className="break-words text-white/80">
              {status.controlledTab.title || 'Tab pilihan'}
            </p>
            <p className="mt-1 break-all text-xs text-white/40">{status.controlledTab.url}</p>
          </div>
        )}
      </section>

      {installed && (
        <section aria-labelledby="chrome-bridge-setup">
          <h2
            id="chrome-bridge-setup"
            className="text-base font-medium text-white/90 pb-3 border-b border-white/10"
          >
            Tambahkan ke Chrome
          </h2>
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-white/65">
            <li>
              Buka <span className="font-mono text-xs text-white/80">chrome://extensions</span> di
              Google Chrome.
            </li>
            <li>
              Aktifkan <strong className="font-medium text-white/80">Developer mode</strong>, lalu
              pilih <strong className="font-medium text-white/80">Load unpacked</strong>.
            </li>
            <li>Pilih lokasi folder ekstensi yang ditampilkan di bawah.</li>
            <li>
              Buka menu Extensions di toolbar Chrome dan sematkan Mark Agent Bridge agar mudah
              ditemukan. Buka halaman yang ingin dikendalikan, klik ikon Mark, lalu pilih{' '}
              <strong className="font-medium text-white/80">Hubungkan tab ini</strong>.
            </li>
            <li>
              Pastikan status berubah menjadi Terhubung, lalu kirim permintaan ke Mark. Misalnya:
              “Pakai Chrome saya, baca halaman ini dan rangkum isinya.”
            </li>
          </ol>
          <label className="mt-6 block text-xs text-white/50" htmlFor="chrome-extension-location">
            Lokasi folder ekstensi
          </label>
          <input
            id="chrome-extension-location"
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.02] p-3 font-mono text-xs text-white/65 focus:outline-primary"
            readOnly
            value={status.extensionDirectory}
            onFocus={(event) => event.target.select()}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost btn-sm rounded-full"
              onClick={() => run('open-folder')}
              disabled={busy}
            >
              <FolderOpen size={15} />
              Buka folder ekstensi
            </button>
            <button className="btn btn-ghost btn-sm rounded-full" onClick={copyLocation}>
              <Copy size={15} />
              Salin lokasi
            </button>
          </div>
          <p className="mt-4  text-xs leading-relaxed text-white/50">
            Setelah Chrome dimulai ulang, pilih tab kembali. Pembaruan paket mengikuti rilis Mark
            dan memakai folder yang sama; muat ulang ekstensi di Chrome setelah memperbarui.
          </p>
        </section>
      )}

      {!installed && (
        <section className="text-sm leading-relaxed text-white/65">
          <h2 className="text-base font-medium text-white/90 pb-3 border-b border-white/10 mb-4">
            Sebelum mulai
          </h2>
          <p>
            Gunakan Google Chrome versi 116 atau lebih baru di Windows. Pilih Install untuk memasang
            paket yang disertakan bersama Mark. Setelah pemasangan selesai, halaman ini akan
            menampilkan folder ekstensi dan langkah untuk menambahkannya ke Chrome. Tidak diperlukan
            unduhan atau pemasangan paket tambahan.
          </p>
        </section>
      )}

      <section className="text-sm" aria-labelledby="chrome-bridge-control">
        <h2
          id="chrome-bridge-control"
          className="text-base font-medium text-white/90 pb-3 border-b border-white/10"
        >
          Tombol pada ekstensi
        </h2>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed text-white/65">
          <div>
            <dt className="font-medium text-white/80">Hubungkan tab ini</dt>
            <dd>
              Mengizinkan Mark bekerja pada tab yang sedang Anda buka. Untuk memilih tab lain, buka
              tab tersebut dan tekan tombol ini kembali. Berpindah tab atau jendela tidak langsung
              mengalihkan kendali Mark.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">Jeda / Lanjutkan</dt>
            <dd>
              Membatalkan permintaan yang masih berjalan dan menghentikan akses Mark sementara. Tab
              tetap terpilih. Tekan Lanjutkan untuk mengaktifkan kembali kendali Mark.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">Putuskan</dt>
            <dd>
              Mengakhiri kendali Mark pada tab yang dipilih. Halaman tetap terbuka dan ekstensi
              tetap terpasang. Pilih Hubungkan tab ini untuk menggunakannya kembali.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">Hubungkan ulang</dt>
            <dd>
              Menyambungkan kembali ekstensi jika koneksi ke Mark terputus. Tidak perlu memuat ulang
              ekstensi atau memilih tab kembali selama Chrome belum ditutup.
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="text-sm leading-relaxed text-white/65"
        aria-labelledby="chrome-bridge-tab-rules"
      >
        <h2
          id="chrome-bridge-tab-rules"
          className="text-base font-medium text-white/90 pb-3 border-b border-white/10 mb-4"
        >
          Penggunaan tab
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Mark bekerja pada satu tab dalam satu waktu. Membuka alamat lain pada tab tersebut tidak
            mengubah pilihan tab.
          </li>
          <li>
            Menutup tab pilihan akan melepas kendali. Setelah Chrome ditutup dan dibuka kembali,
            pilih tab lagi melalui popup ekstensi.
          </li>
          <li>
            Gunakan halaman dengan alamat HTTP atau HTTPS. Halaman internal seperti
            chrome://settings, halaman ekstensi, serta halaman yang dibatasi Chrome tidak dapat
            dikendalikan.
          </li>
          <li>
            Mark dan Chrome perlu tetap berjalan. Koneksi antara ekstensi dan Mark berlangsung
            secara lokal di komputer ini melalui 127.0.0.1:8765.
          </li>
          <li>
            Sebutkan “Chrome saya” dalam permintaan Anda. Permintaan browser umum tetap memakai
            browser bawaan Mark.
          </li>
        </ul>
      </section>

      <details className=" border-t border-white/10 pt-5">
        <summary className="cursor-pointer text-sm font-medium text-white/80 focus-visible:outline-primary">
          Arti status koneksi
        </summary>
        <dl className="mt-4 space-y-3 text-sm leading-relaxed text-white/65">
          {Object.entries(explanations).map(([key, description]) => (
            <div key={key} className="grid gap-1 sm:grid-cols-[170px_1fr] sm:gap-4">
              <dt className="text-white/75">{addonStatusLabels[key]}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className=" border-t border-white/10 pt-5">
        <summary className="cursor-pointer text-sm font-medium text-white/80 focus-visible:outline-primary">
          Jika koneksi atau aksi bermasalah
        </summary>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed text-white/65">
          <div>
            <dt className="font-medium text-white/80">Masih menunggu ekstensi</dt>
            <dd>
              Pastikan Mark berjalan dan Mark Agent Bridge aktif di chrome://extensions. Gunakan
              folder yang ditampilkan halaman ini, lalu tekan Hubungkan ulang di popup. Jika ada
              ekstensi bridge lama yang masih aktif, nonaktifkan terlebih dahulu.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">Port 8765 sedang dipakai</dt>
            <dd>
              Tutup bridge lama atau aplikasi yang memakai port tersebut, lalu tekan Hubungkan ulang
              di halaman ini. Mark tidak menghentikan proses lain secara otomatis.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">Tab belum terpilih atau tidak didukung</dt>
            <dd>
              Buka halaman HTTP/HTTPS yang ingin dikerjakan, lalu pilih Hubungkan tab ini dari
              popup. Periksa judul dan domain yang muncul agar sesuai dengan tab yang Anda pilih.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">
              JavaScript atau screenshot gagal karena debugger
            </dt>
            <dd>
              Periksa apakah tab sedang dipakai alat debugging atau ekstensi lain. Hentikan sesi
              tersebut jika ingin melanjutkan; Mark tidak melepas debugger pihak lain.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-white/80">Aksi melewati batas waktu</dt>
            <dd>
              Periksa halaman sebelum meminta pengulangan. Aksi mungkin sudah sempat berjalan; Mark
              tidak mengulang klik, pengisian, atau JavaScript secara otomatis.
            </dd>
          </div>
        </dl>
      </details>

      <details className=" border-t border-white/10 pt-5">
        <summary className="cursor-pointer text-sm font-medium text-white/80 focus-visible:outline-primary">
          Pembaruan, plugin lama, dan uninstall
        </summary>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/65">
          <p>
            Paket Chrome Bridge disertakan dalam rilis Mark. Jika versi baru tersedia, tekan
            Perbarui di halaman ini. Lokasi folder ekstensi tetap sama; buka chrome://extensions dan
            tekan Muat ulang pada Mark Agent Bridge setelah pembaruan.
          </p>
          <p>
            Jika plugin chrome-use lama ditemukan, Mark meminta konfirmasi sebelum menggantinya dan
            mencadangkan seluruh folder. Kegagalan pemasangan mengembalikan versi sebelumnya.
            Cadangan tersimpan di{' '}
            <span className="break-all font-mono text-xs">
              %USERPROFILE%\.config\mark-agent\addons\chrome-bridge\backups
            </span>
            .
          </p>
          <p>
            Kelola paket ini melalui Add-ons. Uninstall menghentikan bridge, membatalkan permintaan,
            mencabut token koneksi, dan menghapus paket yang dikelola. Hapus juga Mark Agent Bridge
            melalui chrome://extensions. Cadangan plugin lama tetap tersedia.
          </p>
        </div>
      </details>

      {confirmation && (
        <dialog
          ref={dialog}
          className="modal"
          aria-labelledby="chrome-bridge-confirm-title"
          onCancel={() => setConfirmation(null)}
          onClose={() => setConfirmation(null)}
        >
          <div className="modal-box border border-white/10 bg-base-200">
            <h2 id="chrome-bridge-confirm-title" className="text-lg font-semibold">
              {confirmation === 'replace'
                ? 'Ganti plugin chrome-use lama?'
                : 'Lepas Chrome Bridge?'}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              {confirmation === 'replace'
                ? 'Seluruh folder plugin lama akan dicadangkan ke folder backups add-on sebelum diganti. Jika pemasangan gagal, versi sebelumnya dikembalikan. Folder sumber ekstensi lama tetap dipertahankan.'
                : 'Bridge dihentikan, permintaan aktif dibatalkan, dan paket plugin beserta tokennya dihapus. Ekstensi perlu Anda hapus sendiri melalui chrome://extensions. Cadangan plugin lama tetap disimpan.'}
            </p>
            <div className="modal-action">
              <button className="btn rounded-full" autoFocus onClick={() => setConfirmation(null)}>
                Batal
              </button>
              <button
                className={`btn rounded-full ${confirmation === 'replace' ? 'btn-primary' : 'border-error bg-error text-white hover:bg-error/90'}`}
                onClick={() => {
                  const operation = confirmation === 'replace' ? 'install' : 'uninstall'
                  setConfirmation(null)
                  run(operation, { replaceExisting: operation === 'install' })
                }}
              >
                {confirmation === 'replace' ? 'Cadangkan dan ganti' : 'Uninstall'}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button aria-label="Tutup konfirmasi">Tutup</button>
          </form>
        </dialog>
      )}
    </AddonDetail>
  )
}
