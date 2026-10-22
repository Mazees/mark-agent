import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { FaGoogle } from 'react-icons/fa'

export default function Addons() {
  const [query, setQuery] = useState('')
  const matchesGoogle = 'google workspace drive calendar gmail email agenda'.includes(
    query.trim().toLowerCase()
  )

  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <div className="max-w-5xl mx-auto px-5 py-7 sm:px-8 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-10"
        >
          <ArrowLeft size={17} /> Kembali
        </Link>
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">Add-ons</h1>
            <p className="mt-3 text-sm text-white/50 leading-relaxed">
              Hubungkan layanan yang kamu pakai dengan Mark.
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
            />
            <input
              aria-label="Cari addon"
              placeholder="Cari addon..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full h-10 rounded-full border border-white/15 bg-transparent pl-10 pr-4 text-sm outline-none focus:border-primary/60"
            />
          </label>
        </header>
        <section aria-labelledby="available-addons" className="mt-12">
          <h2 id="available-addons" className="text-sm font-medium text-white/75 mb-5">
            Tersedia
          </h2>
          {matchesGoogle ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
              <Link
                to="/addons/google-workspace"
                className="flex items-center gap-4 min-w-0 px-5 py-5 rounded-lg hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10">
                  <FaGoogle size={25} className="text-[#4285f4]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">Google Workspace</span>
                  <span className="block mt-1.5 text-sm text-white/50">
                    Drive, Calendar, dan Gmail
                  </span>
                </span>
              </Link>
            </div>
          ) : (
            <p role="status" className="py-8 text-sm text-white/45">
              Tidak ada addon yang cocok dengan “{query}”.
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
