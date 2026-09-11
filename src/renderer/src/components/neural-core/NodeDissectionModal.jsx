import React from 'react'
import { FaTimes, FaTrash } from 'react-icons/fa'

export const NodeDissectionModal = ({ node, onClose, onDeleteNode }) => {
  if (!node) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-base-200 border border-white/10 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
              node.typeLabel === 'Explicit Memory'
                ? 'bg-secondary/20 text-secondary border border-secondary/30'
                : node.typeLabel === 'Document Chunk'
                ? 'bg-warning/20 text-warning border border-warning/30'
                : node.typeLabel === 'Learned Skill'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-primary/20 text-primary border border-primary/30'
            }`}
          >
            {node.typeLabel || 'Data Memori'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-base-content/40 hover:text-base-content cursor-pointer transition-colors"
          >
            <FaTimes size={14} />
          </button>
        </div>

        <p className="text-xs font-mono text-base-content/50 mb-2">{node.date}</p>
        <div className="p-3.5 bg-base-300/60 border border-white/5 rounded-xl text-sm font-sans text-base-content/90 max-h-60 overflow-y-auto custom-scrollbar mb-4 leading-relaxed whitespace-pre-wrap">
          {node.fullText}
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] font-mono text-base-content/40">ID: {node.id}</span>
          {(node.typeLabel === 'Explicit Memory' ||
            node.typeLabel === 'Chat Archive' ||
            node.typeLabel === 'Learned Skill') && (
            <button
              type="button"
              onClick={() => onDeleteNode(node)}
              className="btn btn-xs btn-error btn-outline font-mono flex items-center gap-1.5"
            >
              <FaTrash size={11} /> Hapus Data Memori
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default NodeDissectionModal
