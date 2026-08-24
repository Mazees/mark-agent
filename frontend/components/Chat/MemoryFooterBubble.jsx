import React from 'react'
import { Database, PlusCircle, Edit3, Trash2 } from 'lucide-react'

export const MemoryFooterBubble = ({
  isMemorySaved = false,
  isMemoryUpdated = false,
  isMemoryDeleted = false
}) => {
  if (!isMemorySaved && !isMemoryUpdated && !isMemoryDeleted) return null

  return (
    <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] font-medium opacity-80 select-none">
      <Database className="w-3 h-3 text-secondary" />
      {isMemorySaved && (
        <span className="text-success flex items-center gap-1">
          <PlusCircle className="w-2.5 h-2.5" />
          Memori baru tersimpan
        </span>
      )}
      {isMemoryUpdated && (
        <span className="text-info flex items-center gap-1">
          <Edit3 className="w-2.5 h-2.5" />
          Memori diperbarui
        </span>
      )}
      {isMemoryDeleted && (
        <span className="text-error flex items-center gap-1">
          <Trash2 className="w-2.5 h-2.5" />
          Memori dihapus
        </span>
      )}
    </div>
  )
}
