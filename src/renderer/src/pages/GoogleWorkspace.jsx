import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Files, Mail, Plus } from 'lucide-react'
import { FaGoogle } from 'react-icons/fa'

const features = [
  {
    icon: Files,
    name: 'Google Drive',
    description: 'Cari, baca, dan kelola file yang kamu perlukan.'
  },
  {
    icon: CalendarDays,
    name: 'Google Calendar',
    description: 'Lihat agenda dan buat jadwal melalui percakapan.'
  },
  { icon: Mail, name: 'Gmail', description: 'Cari email, baca pesan, dan bantu kirim balasan.' }
]
const examples = [
  'Ringkas email masuk terbaru dan tandai yang perlu aku tindak lanjuti.',
  'Cari dokumen proyek di Google Drive dan rangkum isinya.',
  'Lihat agenda besok dan bantu cari waktu yang kosong.'
]

export default function GoogleWorkspace() {
  const navigate = useNavigate()
  const draft = (composerDraft) => navigate('/chat', { state: { composerDraft } })
  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <nav aria-label="Breadcrumb" className="flex items-center gap-3 px-5 py-6 text-sm sm:px-8">
        <Link
          to="/addons"
          aria-label="Kembali ke Add-ons"
          title="Kembali ke Add-ons"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link to="/addons" className="text-white/50 hover:text-white">
          Add-ons
        </Link>
        <ChevronRight size={15} className="text-white/35" />
        <span className="text-white/85">Google Workspace</span>
      </nav>
      <div className="max-w-4xl mx-auto px-5 pt-5 pb-12 sm:px-8 sm:pt-8">
        <header>
          <div className="h-16 w-16 rounded-2xl border border-white/10 flex items-center justify-center mb-5">
            <FaGoogle size={34} className="text-[#4285f4]" aria-hidden="true" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <h1 className="text-2xl font-semibold text-white">Google Workspace</h1>
              <p className="text-sm text-white/45 mt-2">Oleh MARK</p>
            </div>
            <button
              type="button"
              onClick={() => draft('/setup-google-workspace ')}
              className="btn bg-white text-neutral-900 border-white hover:bg-white/90 rounded-full self-start sm:self-center px-5"
            >
              <Plus size={17} /> Install
            </button>
          </div>
        </header>
        <section
          aria-label="Contoh penggunaan"
          className="my-8 rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-950/70 via-base-200 to-teal-950/50 px-4 py-7 sm:px-10 sm:py-9"
        >
          <div className="max-w-xl mx-auto space-y-3">
            {examples.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => draft(text)}
                className="w-full flex items-center gap-4 rounded-2xl bg-base-300/90 px-4 py-4 text-left text-sm text-white/85 leading-relaxed hover:bg-base-300"
              >
                <span className="flex-1">{text}</span>
                <ArrowRight size={17} className="shrink-0 text-white/60" />
              </button>
            ))}
          </div>
        </section>
        <p className="text-sm text-white/65 leading-relaxed">
          Hubungkan Drive, Calendar, dan Gmail agar Mark bisa membantu pekerjaanmu langsung dari
          chat. Install membuka panduan setup OAuth bersama Mark; login dan izin akun tetap kamu
          tentukan.
        </p>
        <section aria-labelledby="google-services" className="mt-9">
          <h2
            id="google-services"
            className="text-base font-medium text-white/90 pb-3 border-b border-white/10"
          >
            Layanan <span className="text-white/40">3</span>
          </h2>
          <div className="divide-y divide-white/5">
            {features.map(({ icon: Icon, name, description }) => (
              <div key={name} className="flex gap-4 py-5">
                <Icon size={20} className="shrink-0 mt-0.5 text-white/50" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-medium text-white/85">{name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/50">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="addon-info" className="mt-7">
          <h2
            id="addon-info"
            className="text-base font-medium text-white/90 pb-3 border-b border-white/10"
          >
            Informasi
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 py-5 text-sm">
            <dt className="text-white/40">Kemampuan</dt>
            <dd className="text-white/75">Baca dan tulis</dd>
            <dt className="text-white/40">Pengembang</dt>
            <dd className="text-white/75">Mazees</dd>
            <dt className="text-white/40">Koneksi</dt>
            <dd className="text-white/75">OAuth akun Google</dd>
          </dl>
        </section>
      </div>
    </main>
  )
}
