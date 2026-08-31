import React, { useEffect, useState, useMemo } from 'react'
import { Layers, Activity, Puzzle, ChevronRight, CheckCircle2 } from 'lucide-react'
import ProcessPanel from './ProcessPanel'
import { buildCompleteToolClusters, CLUSTER_THEMES } from './SolarSystemCanvas'
import { webApi } from '../../api/web-bridge'

/**
 * ToolClustersDeck Component
 * Docked Left Panel di MARK V5 yang merender seluruh kluster tools otonom,
 * telemetry proses aktif, dan daftar custom plugins yang tersinkronisasi secara real-time.
 */
const ToolClustersDeck = ({
  activeProcesses = [],
  dismissProcess,
  className = ''
}) => {
  const [selectedClusterKey, setSelectedClusterKey] = useState(null)
  const [plugins, setPlugins] = useState([])

  // Ambil data plugins & dengarkan event update
  useEffect(() => {
    let isMounted = true

    const loadPlugins = async () => {
      try {
        if (webApi && typeof webApi.getPlugins === 'function') {
          const list = await webApi.getPlugins()
          if (isMounted) setPlugins(list || [])
        }
      } catch (err) {
        console.error('[ToolClustersDeck] Gagal memuat plugins:', err)
      }
    }

    loadPlugins()

    let unsub = null
    if (webApi && typeof webApi.onPluginsUpdated === 'function') {
      unsub = webApi.onPluginsUpdated(() => {
        loadPlugins()
      })
    }

    return () => {
      isMounted = false
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // Bangun daftar kluster lengkap termasuk custom plugins
  const clusters = useMemo(() => {
    return buildCompleteToolClusters(plugins)
  }, [plugins])

  // Total count tools di seluruh kluster
  const totalToolsCount = useMemo(() => {
    return clusters.reduce((acc, c) => acc + (c.tools ? c.tools.length : 0), 0)
  }, [clusters])

  // Ekstrak nama tools yang sedang aktif berjalan secara real-time dari telemetry
  const activeToolNames = useMemo(() => {
    const active = new Set()
    activeProcesses.forEach((p) => {
      if (p.status === 'active' || p.status === 'running' || p.status === 'executing') {
        if (p.type) active.add(p.type.toLowerCase())
        if (p.name) active.add(p.name.toLowerCase())
        if (p.tool) active.add(p.tool.toLowerCase())
        if (p.data?.task) active.add(String(p.data.task).toLowerCase())
        if (p.data?.tool) active.add(String(p.data.tool).toLowerCase())
        if (p.data?.action) active.add(String(p.data.action).toLowerCase())
      }
    })
    return active
  }, [activeProcesses])

  return (
    <aside className={`absolute left-6 top-18 bottom-24 w-72 lg:w-76 z-20 flex flex-col gap-2.5 pointer-events-auto ${className}`}>
      <div className="flex-1 bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-3 shadow-2xl flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
              TOOL CLUSTERS
            </h3>
          </div>
          <span className="text-[10px] font-mono text-white/40">
            {clusters.length} Hubs · {totalToolsCount} Tools
          </span>
        </div>

        {/* Active Process In-Place Card (Jika ada proses/task yang sedang berjalan) */}
        {activeProcesses && activeProcesses.length > 0 && (
          <div className="mb-2 shrink-0 max-h-[35vh] overflow-y-auto no-scrollbar">
            <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} isEmbedded={true} />
          </div>
        )}

        {/* List of Tool Clusters */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pr-0.5">
          {clusters.map((c) => {
            const isClusterActive = c.tools.some((t) =>
              t.matchTools.some(
                (mt) => activeToolNames.has(mt) || [...activeToolNames].some((an) => an.includes(mt))
              )
            )
            const isSelected = selectedClusterKey === c.key
            const isCustomPluginCluster = c.key === 'custom_plugins'

            return (
              <div key={c.id} className="flex flex-col">
                <button
                  onClick={() => setSelectedClusterKey(isSelected ? null : c.key)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                    isClusterActive
                      ? 'bg-primary/20 text-white font-semibold shadow-[0_0_10px_rgba(0,255,204,0.2)]'
                      : isSelected
                        ? 'bg-white/10 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCustomPluginCluster ? (
                      <Puzzle className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                    ) : (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${isClusterActive ? 'animate-ping' : ''}`}
                        style={{ backgroundColor: c.color }}
                      />
                    )}
                    <span className="truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isClusterActive && (
                      <span className="px-1.5 py-0.2 rounded text-[8px] bg-primary text-black font-bold uppercase">
                        RUN
                      </span>
                    )}
                    <span className="text-[10px] opacity-40">({c.tools.length})</span>
                  </div>
                </button>

                {/* Expanded Sub-Tools */}
                {isSelected && (
                  <div className="pl-4 pr-1 py-1 flex flex-col gap-1 border-l border-white/10 ml-2.5 my-1 animate-[holo-project-in_0.15s_ease-out_forwards]">
                    {c.tools.map((t) => {
                      const isToolActive = t.matchTools.some(
                        (mt) => activeToolNames.has(mt) || [...activeToolNames].some((an) => an.includes(mt))
                      )
                      return (
                        <div
                          key={t.id}
                          title={t.description || t.name}
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono flex items-center justify-between transition-colors ${
                            isToolActive
                              ? 'bg-primary text-black font-bold shadow-sm'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <span className="truncate flex-1 pr-1">{t.name}</span>
                          {isToolActive && <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse shrink-0" />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Bottom Telemetry One-Liner */}
        <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-white/50 px-1">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-primary" />
            <span>Active Process</span>
          </div>
          <span className="font-bold text-primary">{activeProcesses.length} Active</span>
        </div>
      </div>
    </aside>
  )
}

export default ToolClustersDeck
