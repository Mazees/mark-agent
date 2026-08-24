import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Trash2, ArrowLeft, Terminal, Folder, File as FileIcon, Plus, FolderPlus, Edit2, ChevronRight, ChevronDown, Heading1, Heading2, Bold, Italic, CheckSquare, Code, Link, Quote, List } from 'lucide-react'
import Editor from '@monaco-editor/react'

const FileTreeNode = ({ node, level = 0, selectedPath, onSelect, onRename, onDelete, expandedFolders, toggleFolder }) => {
  const isSelected = selectedPath === node.path
  const isExpanded = expandedFolders[node.path]
  
  return (
    <div className="select-none">
      <div 
        className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer hover:bg-white/10 transition-colors group ${isSelected ? 'bg-primary/20 text-primary' : 'text-gray-300'}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (node.type === 'folder') {
            toggleFolder(node.path)
          } else {
            onSelect(node.path)
          }
        }}
      >
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {node.type === 'folder' ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <FileIcon size={14} className="opacity-70" />
          )}
        </div>
        
        {node.type === 'folder' && (
          <Folder size={14} className={isExpanded ? 'text-blue-400' : 'text-blue-400/70'} />
        )}
        
        <span className="text-sm truncate flex-1">{node.name}</span>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
          <button 
            className="p-1 hover:bg-white/20 rounded text-gray-400 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); onRename(node) }}
            title="Rename"
          >
            <Edit2 size={12} />
          </button>
          <button 
            className="p-1 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400 transition-colors"
            onClick={(e) => { e.stopPropagation(); onDelete(node) }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      
      {node.type === 'folder' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode 
              key={child.path}
              node={child} 
              level={level + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const SkillEditor = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  
  const [tree, setTree] = useState([])
  const [selectedPath, setSelectedPath] = useState('SKILL.md')
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState({})
  const editorRef = useRef(null)

  const handleFormat = (format) => {
    if (!editorRef.current) return
    const editor = editorRef.current
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (!selection || !model) return

    const selectedText = model.getValueInRange(selection)
    
    let textToInsert = ''
    
    switch (format) {
      case 'h1': textToInsert = `# ${selectedText || 'Heading 1'}`; break;
      case 'h2': textToInsert = `## ${selectedText || 'Heading 2'}`; break;
      case 'bold': textToInsert = `**${selectedText || 'teks tebal'}**`; break;
      case 'italic': textToInsert = `*${selectedText || 'teks miring'}*`; break;
      case 'check': textToInsert = `- [ ] ${selectedText || 'Tugas baru'}`; break;
      case 'list': textToInsert = `- ${selectedText || 'Item list'}`; break;
      case 'code': textToInsert = `\`\`\`javascript\n${selectedText || '// Tulis kode di sini'}\n\`\`\``; break;
      case 'quote': textToInsert = `> ${selectedText || 'Kutipan'}`; break;
      case 'link': textToInsert = `[${selectedText || 'Teks Link'}](https://url-di-sini)`; break;
      default: return;
    }
    
    editor.executeEdits('toolbar', [{
      range: selection,
      text: textToInsert,
      forceMoveMarkers: true
    }])
    editor.focus()
  }

  const loadTree = async () => {
    try {
      const data = await window.api.getSkillTree(id)
      setTree(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadFileContent = async (path) => {
    setIsLoading(true)
    try {
      const text = await window.api.readSkillFile(id, path)
      setContent(text)
      setSelectedPath(path)
      setIsEditing(false)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTree().then(() => loadFileContent('SKILL.md'))
  }, [id])

  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }))
  }

  const handleSave = async () => {
    try {
      await window.api.saveSkillFile(id, selectedPath, content)
      setIsEditing(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateItem = async (isFolder) => {
    const defaultPath = selectedPath.includes('/') ? selectedPath.substring(0, selectedPath.lastIndexOf('/')) : ''
    const itemName = prompt(`Nama ${isFolder ? 'folder' : 'file'} baru:`)
    if (!itemName) return

    const newPath = defaultPath ? `${defaultPath}/${itemName}` : itemName
    
    try {
      await window.api.createSkillItem(id, newPath, isFolder)
      await loadTree()
      if (!isFolder) {
        loadFileContent(newPath)
      } else {
        setExpandedFolders(prev => ({ ...prev, [newPath]: true }))
      }
    } catch (e) {
      console.error(e)
      alert('Gagal membuat item')
    }
  }

  const handleDeleteItem = async (node) => {
    if (!confirm(`Hapus ${node.type} "${node.name}"?`)) return
    try {
      await window.api.deleteSkillItem(id, node.path)
      await loadTree()
      if (selectedPath === node.path || selectedPath.startsWith(node.path + '/')) {
        loadFileContent('SKILL.md')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleRenameItem = async (node) => {
    const newName = prompt('Nama baru:', node.name)
    if (!newName || newName === node.name) return

    const basePath = node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : ''
    const newPath = basePath ? `${basePath}/${newName}` : newName

    try {
      await window.api.renameSkillItem(id, node.path, newPath)
      await loadTree()
      if (selectedPath === node.path) {
        setSelectedPath(newPath)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteSkill = async () => {
    if (!confirm(`Hapus keseluruhan skill ${id} beserta semua filenya?`)) return
    try {
      await window.api.deleteSkill(id)
      navigate('/skills')
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden relative font-['Poppins',sans-serif] bg-base-300 rounded-xl border border-white/5 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/skills')}
              className="btn btn-ghost btn-sm btn-circle shrink-0"
              style={{ WebkitAppRegion: 'no-drag' }}
              title="Kembali ke Skills"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="1.2em"
                height="1.2em"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Terminal className="text-emerald-400" size={22} />
                <span>{id}</span>
              </h1>
              <p className="opacity-50 text-xs mt-0.5">Workspace Editor</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              className="btn btn-outline btn-error gap-2"
              onClick={handleDeleteSkill}
            >
              <Trash2 size={16} /> Delete Skill
            </button>
            <button 
              className={`btn gap-2 ${isEditing ? 'btn-primary' : 'btn-disabled'}`}
              onClick={handleSave}
              disabled={!isEditing}
            >
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>

        {/* IDE Layout */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          
          {/* Sidebar: Explorer */}
          <div className="w-64 flex flex-col bg-[#1e1e1e]/80 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-3 flex items-center justify-between border-b border-white/5 bg-black/20">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Explorer</span>
              <div className="flex gap-1">
                <button 
                  className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 transition-colors"
                  onClick={() => handleCreateItem(false)}
                  title="New File"
                >
                  <Plus size={14} />
                </button>
                <button 
                  className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 transition-colors"
                  onClick={() => handleCreateItem(true)}
                  title="New Folder"
                >
                  <FolderPlus size={14} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              {tree.map(node => (
                <FileTreeNode 
                  key={node.path}
                  node={node}
                  selectedPath={selectedPath}
                  onSelect={loadFileContent}
                  onRename={handleRenameItem}
                  onDelete={handleDeleteItem}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                />
              ))}
            </div>
          </div>

          {/* Editor Container */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative">
            <div className="bg-black/20 border-b border-white/5 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileIcon size={14} className="text-gray-400" />
                <span className="text-sm text-gray-300 font-mono">{selectedPath}</span>
                {isEditing && <span className="w-2 h-2 rounded-full bg-primary ml-2"></span>}
              </div>
              
              {selectedPath.endsWith('.md') && (
                <div className="flex items-center gap-1 bg-black/30 rounded-lg p-1 border border-white/5">
                  <button onClick={() => handleFormat('h1')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Heading 1"><Heading1 size={14} /></button>
                  <button onClick={() => handleFormat('h2')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Heading 2"><Heading2 size={14} /></button>
                  <div className="w-px h-4 bg-white/10 mx-1"></div>
                  <button onClick={() => handleFormat('bold')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Bold"><Bold size={14} /></button>
                  <button onClick={() => handleFormat('italic')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Italic"><Italic size={14} /></button>
                  <div className="w-px h-4 bg-white/10 mx-1"></div>
                  <button onClick={() => handleFormat('check')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Checklist"><CheckSquare size={14} /></button>
                  <button onClick={() => handleFormat('list')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Bulleted List"><List size={14} /></button>
                  <div className="w-px h-4 bg-white/10 mx-1"></div>
                  <button onClick={() => handleFormat('code')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Code Block"><Code size={14} /></button>
                  <button onClick={() => handleFormat('link')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Link"><Link size={14} /></button>
                  <button onClick={() => handleFormat('quote')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Quote"><Quote size={14} /></button>
                </div>
              )}
            </div>
            
            <div className="flex-1 relative">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Loading editor...
                </div>
              ) : (
                <Editor
                  height="100%"
                  defaultLanguage={selectedPath.endsWith('.md') ? 'markdown' : selectedPath.endsWith('.json') ? 'json' : 'javascript'}
                  theme="vs-dark"
                  value={content}
                  onMount={(editor) => { editorRef.current = editor }}
                  onChange={(val) => {
                    setContent(val)
                    setIsEditing(true)
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    padding: { top: 16 },
                    fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                  }}
                />
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default SkillEditor
