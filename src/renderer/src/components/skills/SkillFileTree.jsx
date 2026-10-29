import PropTypes from 'prop-types'
import { ChevronRight, FileText, Folder, Pencil, Trash2 } from 'lucide-react'

export default function SkillFileTree({
  nodes,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  disabled,
  level = 0
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const folder = node.type === 'folder'
        const open = !!expanded[node.path]
        const selected = selectedPath === node.path
        const main = node.path === 'SKILL.md'
        return (
          <li key={node.path}>
            <div
              className={`group flex min-w-0 items-center rounded-lg ${selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}
              style={{ paddingLeft: Math.min(level * 12, 72) }}
            >
              <button
                type="button"
                className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'text-white' : 'text-white/60'}`}
                onClick={() => (folder ? onToggle(node.path) : onSelect(node.path))}
                disabled={disabled}
                aria-expanded={folder ? open : undefined}
                aria-current={selected ? 'page' : undefined}
                title={node.path}
              >
                {folder ? (
                  <ChevronRight
                    size={13}
                    className={`shrink-0 ${open ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="w-[13px] shrink-0" />
                )}
                {folder ? (
                  <Folder size={15} className="shrink-0 text-white/45" aria-hidden="true" />
                ) : (
                  <FileText
                    size={15}
                    className={`shrink-0 ${main ? 'text-primary' : 'text-white/45'}`}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{node.name}</span>
              </button>
              {!main && (
                <div className="flex shrink-0 pr-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRename(node)}
                    aria-label={`Ubah nama ${node.name}`}
                    title="Ubah nama"
                    className="rounded-md p-2 text-white/45 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onDelete(node)}
                    aria-label={`Hapus ${node.name}`}
                    title="Hapus"
                    className="rounded-md p-2 text-white/45 hover:text-error focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            {folder && open && (
              <SkillFileTree
                nodes={node.children || []}
                selectedPath={selectedPath}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                disabled={disabled}
                level={level + 1}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
SkillFileTree.propTypes = {
  nodes: PropTypes.array.isRequired,
  selectedPath: PropTypes.string,
  expanded: PropTypes.object.isRequired,
  onToggle: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  level: PropTypes.number
}
