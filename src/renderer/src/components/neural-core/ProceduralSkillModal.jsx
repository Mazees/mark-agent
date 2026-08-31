import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FaGraduationCap, FaTimes } from 'react-icons/fa'

export const ProceduralSkillModal = ({ skill, onClose }) => {
  if (!skill) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-3xl max-h-[85vh] bg-base-200 border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-base-300/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FaGraduationCap size={15} />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm text-base-content">/{skill.name}</h3>
              <p className="text-[11px] text-base-content/50">{skill.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-base-300 hover:bg-base-100 flex items-center justify-center text-base-content/50 hover:text-base-content transition-all cursor-pointer"
          >
            <FaTimes size={13} />
          </button>
        </div>

        {/* Markdown Body */}
        <div className="flex-1 overflow-y-auto p-6 font-sans text-sm text-base-content/90 custom-scrollbar leading-relaxed prose prose-invert max-w-none prose-pre:bg-base-300 prose-pre:border prose-pre:border-white/10 prose-headings:font-mono prose-headings:text-base-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {skill.content || '*Tidak ada konten instruksi Markdown.*'}
          </ReactMarkdown>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-base-300/60 flex items-center justify-between text-xs font-mono text-base-content/50">
          <span>Status: Keahlian aktif dan siap digunakan oleh Mark</span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost bg-base-100/50 hover:bg-base-100 rounded-xl font-mono"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProceduralSkillModal
