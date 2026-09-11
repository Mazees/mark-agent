import React from 'react'
import {
  FaGraduationCap,
  FaSearch,
  FaEye,
  FaTrash,
  FaBookOpen,
  FaChevronRight
} from 'react-icons/fa'

export const ProceduralMatrixLobe = ({
  learnedSkills = [],
  skillSearch = '',
  setSkillSearch,
  onSelectSkill,
  onDeleteSkill,
  isFullView = false,
  onNavigateToFull
}) => {
  const filteredSkills = learnedSkills.filter(
    (s) =>
      s.name?.toLowerCase().includes(skillSearch.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(skillSearch.toLowerCase()))
  )

  if (isFullView) {
    return (
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden max-w-6xl mx-auto w-full pb-8">
        {/* Header Vault Toolbar */}
        <div className="p-4 bg-base-200/60 border border-white/5 rounded-2xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md shadow-lg">
          <div>
            <h2 className="text-sm font-bold font-mono text-base-content flex items-center gap-2 uppercase tracking-wider">
              <FaGraduationCap className="text-primary" /> Learned Skill
            </h2>
            <p className="text-xs text-base-content/60 mt-0.5">
              Skill yang dipelajari dan dirumuskan sendiri oleh Mark saat menyelesaikan tugas
              sebelumnya.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 text-xs" />
            <input
              type="text"
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              placeholder="Cari keahlian atau panduan..."
              className="w-full bg-base-300/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-base-content placeholder:text-base-content/30 outline-none focus:border-primary/50 font-mono"
            />
          </div>
        </div>

        {/* Skills Card Grid */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {filteredSkills.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-base-200/40 border border-white/5 rounded-2xl">
              <FaGraduationCap className="text-4xl text-base-content/20 mb-3" />
              <h3 className="text-sm font-bold font-mono text-base-content/80">
                Belum Ada Keahlian Baru
              </h3>
              <p className="text-xs text-base-content/50 max-w-md mt-1 leading-relaxed">
                Mark akan secara otomatis mencatat keahlian baru ke daftar ini ketika berhasil
                menyelesaikan tugas teknis yang berulang atau rumit.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-5 bg-base-200/50 hover:bg-base-200/80 border border-white/5 hover:border-primary/30 rounded-2xl backdrop-blur-md transition-all flex flex-col justify-between group shadow-md"
                >
                  <div className="flex flex-col gap-3 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-base-content flex items-center gap-1.5 uppercase">
                        {skill.name}
                      </span>
                    </div>
                    <p className="text-xs text-base-content/70 leading-relaxed line-clamp-3">
                      {skill.description || 'Tidak ada deskripsi singkat.'}
                    </p>
                    <span className="text-[10px] font-mono text-base-content/40">
                      {new Date(skill.updatedAt || Date.now()).toLocaleDateString('id-ID', {
                        dateStyle: 'medium'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => onSelectSkill(skill)}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FaEye size={12} /> Buka Panduan
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSkill(skill)}
                      className="p-2 text-base-content/40 hover:text-error hover:bg-error/10 rounded-xl transition-all cursor-pointer"
                      title="Hapus Skill"
                    >
                      <FaTrash size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Embedded Column
  return (
    <div className="lg:col-span-3 bg-base-200/50 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-bold font-mono text-base-content">
          <FaGraduationCap className="text-primary" /> Skill Yang Di Pelajari
        </div>
        {onNavigateToFull && (
          <button
            type="button"
            onClick={onNavigateToFull}
            className="text-[10px] font-mono text-base-content/50 hover:text-base-content flex items-center gap-1 cursor-pointer transition-colors"
          >
            Lihat Semua <FaChevronRight size={8} />
          </button>
        )}
      </div>

      {/* Search Mini */}
      <div className="relative mb-3">
        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 text-xs" />
        <input
          type="text"
          value={skillSearch}
          onChange={(e) => setSkillSearch(e.target.value)}
          placeholder="Cari keahlian..."
          className="w-full bg-base-300/60 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-base-content placeholder:text-base-content/30 outline-none focus:border-primary/50 font-mono"
        />
      </div>

      {/* Skills List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {filteredSkills.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-base-content/40 text-xs">
            <FaBookOpen className="text-2xl mb-2 text-base-content/20" />
            <p>Belum ada keahlian yang dipelajari.</p>
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="p-2.5 bg-base-300/40 hover:bg-base-300/70 border border-white/5 hover:border-primary/20 rounded-xl transition-all flex flex-col gap-1 group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold uppercase text-xs text-base-content/90">
                  {skill.name}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onSelectSkill(skill)}
                    className="p-1 text-base-content/60 hover:text-primary transition-colors"
                    title="Buka Detail Panduan"
                  >
                    <FaEye size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSkill(skill)}
                    className="p-1 text-base-content/40 hover:text-error transition-colors"
                    title="Hapus"
                  >
                    <FaTrash size={10} />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-base-content/60 line-clamp-2 leading-tight">
                {skill.description}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ProceduralMatrixLobe
