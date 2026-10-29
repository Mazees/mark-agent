import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { ChevronRight, List, Network, RotateCcw, Search } from 'lucide-react'
import PropTypes from 'prop-types'
import { neuralDate } from './neuralCoreData'

const graphAnchors = {
  core: [0, 0],
  'archives-root': [-180, -130],
  'vector-root': [180, -130],
  'skills-root': [-180, 130],
  'custom-skills-root': [180, 130]
}

export const SynapticMemoryLobe = ({
  graphData,
  onSelectNode,
  groomResult,
  isGrooming,
  onGroom
}) => {
  const [view, setView] = useState('graph')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [settled, setSettled] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const container = useRef(null)
  const graph = useRef(null)
  const canvasData = useMemo(
    () => ({
      nodes: graphData.nodes.map((node) => ({
        ...node,
        ...(graphAnchors[node.id]
          ? {
              x: graphAnchors[node.id][0],
              y: graphAnchors[node.id][1],
              fx: graphAnchors[node.id][0],
              fy: graphAnchors[node.id][1]
            }
          : {})
      })),
      links: graphData.links.map((link) => ({
        ...link,
        source: link.source.id || link.source,
        target: link.target.id || link.target
      }))
    }),
    [graphData]
  )
  useEffect(() => {
    if (view !== 'graph' || !container.current) return
    const observer = new ResizeObserver(([entry]) =>
      setDimensions({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height)
      })
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [view])
  useEffect(() => {
    graph.current?.d3Force('charge')?.strength(-120)
    graph.current?.d3Force('link')?.distance(55)
    graph.current?.centerAt(0, 0, 0)
    graph.current?.zoom(Math.min(dimensions.width / 640, dimensions.height / 480, 1), 0)
  }, [canvasData, view, dimensions.width, dimensions.height])
  const entries = graphData.nodes.filter((node) => node.group === 3)
  const term = query.trim().toLowerCase()
  const visible = entries.filter(
    (node) =>
      (filter === 'all' || node.kind === filter) &&
      [node.name, node.fullText, node.description].join(' ').toLowerCase().includes(term)
  )
  return (
    <section aria-labelledby="memory-title" className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 id="memory-title" className="text-base font-medium text-white/90">
            Memori dan pengetahuan <span className="ml-1 text-white/40">{entries.length}</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Telusuri ingatan, arsip percakapan, dan panduan yang tersimpan.
          </p>
        </div>
        <div aria-label="Tampilan memori" className="flex shrink-0 gap-1">
          {[
            ['graph', 'Peta', Network],
            ['list', 'Daftar', List]
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => {
                if (id === 'graph' && view !== 'graph') setSettled(false)
                setView(id)
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${view === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </header>
      {view === 'graph' ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-white/40">
              Klik titik untuk melihat detail. Geser untuk memindahkan peta dan gulir untuk
              memperbesar.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0 rounded-full"
              onClick={() => graph.current?.zoomToFit(300, 40)}
            >
              <RotateCcw size={14} />
              Atur ulang
            </button>
          </div>
          <div
            ref={container}
            aria-label="Peta hubungan memori"
            aria-busy={!settled}
            className="h-[min(55dvh,480px)] min-h-72 w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.015]"
          >
            {dimensions.width > 0 && (
              <ForceGraph2D
                ref={graph}
                width={dimensions.width}
                height={dimensions.height}
                graphData={canvasData}
                nodeLabel={(node) =>
                  node.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                }
                nodeColor={(node) => node.color}
                nodeRelSize={3}
                linkColor={() => 'rgba(255,255,255,0.14)'}
                cooldownTicks={70}
                onEngineStop={() => {
                  graph.current?.zoomToFit(300, 40)
                  setSettled(true)
                }}
                onNodeClick={(node) => {
                  if (node.group === 3) onSelectNode(node)
                  else graph.current?.centerAt(node.x, node.y, 300)
                }}
                nodeCanvasObjectMode={() => 'after'}
                nodeCanvasObject={(node, ctx, scale) => {
                  if (node.group < 2) {
                    ctx.font = `${12 / scale}px sans-serif`
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillStyle = 'rgba(255,255,255,0.75)'
                    ctx.fillText(node.name, node.x, node.y + 14)
                  }
                }}
              />
            )}
          </div>
          <p className="mt-3 text-xs text-white/35">
            Gunakan tampilan Daftar untuk mencari data dan membukanya melalui keyboard.
          </p>
        </div>
      ) : (
        <div>
          <label className="relative block w-full sm:max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              aria-label="Cari memori"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari ingatan, arsip, atau skill..."
              className="h-10 w-full rounded-full border border-white/15 bg-transparent pl-10 pr-4 text-sm outline-none focus:border-primary/60"
            />
          </label>
          <div aria-label="Jenis memori" className="mt-4 flex flex-wrap gap-2">
            {Object.entries({
              all: 'Semua',
              memory: 'Ingatan',
              archive: 'Arsip',
              skill: 'Skill dipelajari',
              'disk-skill': 'Skill lokal'
            }).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-full px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-primary ${filter === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {visible.length ? (
            <ul className="mt-4 divide-y divide-white/10">
              {visible.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => onSelectNode(node)}
                    className="flex w-full min-w-0 items-center gap-5 rounded-lg px-1 py-5 text-left hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 break-words text-sm font-medium text-white/80">
                        {node.name}
                      </span>
                      <span className="mt-2 block text-xs text-white/40">{node.typeLabel}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-white/35" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="py-12 text-sm text-white/45">
              {term || filter !== 'all'
                ? 'Tidak ada data yang sesuai dengan pencarian atau filter ini.'
                : 'Belum ada memori yang tersimpan.'}
            </p>
          )}
        </div>
      )}
      <section className="flex flex-col justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-medium text-white/80">Perawatan memori</h3>
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            {groomResult.lastChecked
              ? `Terakhir diperiksa ${neuralDate(groomResult.lastChecked)}.`
              : 'Belum ada pemeriksaan memori yang tercatat.'}{' '}
            Pemeriksaan dapat menggabungkan ingatan yang serupa dan menghapus duplikat.
          </p>
          {groomResult.timestamp && groomResult.timestamp === groomResult.lastChecked && (
            <p className="mt-2 text-xs text-white/45">
              {groomResult.mergedCount || 0} ingatan digabung · {groomResult.deletedCount || 0}{' '}
              duplikat dihapus
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onGroom}
          disabled={isGrooming}
          className="btn btn-ghost w-fit shrink-0 rounded-full"
        >
          <RotateCcw size={15} className={isGrooming ? 'motion-safe:animate-spin' : ''} />
          {isGrooming ? 'Memeriksa memori...' : 'Rapikan memori'}
        </button>
      </section>
    </section>
  )
}
SynapticMemoryLobe.propTypes = {
  graphData: PropTypes.object.isRequired,
  onSelectNode: PropTypes.func.isRequired,
  groomResult: PropTypes.object.isRequired,
  isGrooming: PropTypes.bool.isRequired,
  onGroom: PropTypes.func.isRequired
}
export default SynapticMemoryLobe
