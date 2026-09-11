import React from 'react'

/**
 * <FollowUp label="..." query="..." />
 * Komponen chip saran pertanyaan lanjutan
 */
export const FollowUp = React.memo(({ label, query, children, onClick }) => {
  const displayLabel = label || children || query
  if (!displayLabel) return null

  return (
    <button
      type="button"
      onClick={() => onClick && onClick(query || displayLabel)}
      className="px-2.5 py-1 rounded-lg text-xs bg-white/5 hover:bg-primary/20 text-white/90 hover:text-primary border border-white/10 hover:border-primary/40 transition-all cursor-pointer text-left font-sans shadow-sm active:scale-95"
      title={query || displayLabel}
    >
      {displayLabel}
    </button>
  )
})

/**
 * <Suggestion label="..." query="..." />
 * Komponen chip saran aksi/eksplorasi alternatif
 */
export const Suggestion = React.memo(({ label, query, children, onClick }) => {
  const displayLabel = label || children || query
  if (!displayLabel) return null

  return (
    <button
      type="button"
      onClick={() => onClick && onClick(query || displayLabel)}
      className="px-2.5 py-1 rounded-lg text-xs bg-white/5 hover:bg-primary/20 text-white/90 hover:text-primary border border-white/10 hover:border-primary/40 transition-all cursor-pointer text-left font-sans shadow-sm active:scale-95"
      title={query || displayLabel}
    >
      {displayLabel}
    </button>
  )
})

/**
 * <Elicitation label="..." query="..." />
 * Komponen opsi jawaban/klarifikasi di dalam ElicitationsGroup
 */
export const Elicitation = React.memo(({ label, query, children, onClick }) => {
  const displayLabel = label || children || query
  if (!displayLabel) return null

  return (
    <button
      type="button"
      onClick={() => onClick && onClick(query || displayLabel)}
      className="px-3 py-1.5 rounded-lg text-xs bg-primary/10 hover:bg-primary/25 text-primary border border-primary/30 hover:border-primary/60 transition-all cursor-pointer text-left font-sans shadow-sm active:scale-95 font-medium"
      title={query || displayLabel}
    >
      {displayLabel}
    </button>
  )
})

/**
 * <ElicitationsGroup message="..."> ... </ElicitationsGroup>
 * Kontainer grup klarifikasi ketika percakapan butuh percabangan pilihan
 */
export const ElicitationsGroup = React.memo(({ message, children }) => {
  if (!children) return null

  return (
    <div className="mt-2 pt-2.5 border-t border-white/10 flex flex-col gap-2 animate-fade-in bg-base-300/40 p-2.5 rounded-xl border border-white/5">
      {message && (
        <span className="text-xs font-semibold text-primary">
          {message}
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  )
})
