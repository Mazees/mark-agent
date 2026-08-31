import React, { useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { FaNetworkWired, FaChevronRight } from 'react-icons/fa'
import { FiCheckCircle, FiRefreshCw } from 'react-icons/fi'

export const SynapticMemoryLobe = ({
  graphData,
  graphDimensions,
  graphContainerRef,
  fgRef,
  groomResult,
  isGrooming,
  triggerGrooming,
  loadBrainData,
  onSelectNode,
  isFullView = false,
  onNavigateToFull
}) => {
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-150)
      fgRef.current.d3Force('link').distance(40)
    }
  }, [graphData, fgRef])

  if (isFullView) {
    return (
      <div
        ref={graphContainerRef}
        className="flex-1 w-full h-full bg-base-200/50 backdrop-blur-md border border-white/5 rounded-2xl relative overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Memory Grooming Control Toolbar */}
        <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-3 p-2.5 bg-base-300/90 backdrop-blur-md border border-white/10 rounded-xl text-xs shadow-lg">
          <div className="flex items-center gap-2 px-2 text-base-content/70 font-mono text-[11px]">
            <FiCheckCircle className="text-primary" />
            <span>
              Pembersih Memori:{' '}
              {groomResult.lastChecked
                ? `Terakhir dirapikan ${new Date(groomResult.lastChecked).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}`
                : 'Siap merapikan data'}
            </span>
          </div>
          {(groomResult.mergedCount > 0 || groomResult.deletedCount > 0) && (
            <div className="flex items-center gap-2 pl-2 border-l border-white/10 font-mono text-[10px] text-base-content/70">
              <span>{groomResult.mergedCount} digabung</span>
              <span>{groomResult.deletedCount} dibersihkan</span>
            </div>
          )}
          <button
            type="button"
            onClick={async () => {
              await triggerGrooming(true)
              await loadBrainData()
            }}
            disabled={isGrooming}
            className="btn btn-xs btn-primary rounded-lg font-mono flex items-center gap-1.5"
          >
            <FiRefreshCw className={isGrooming ? 'animate-spin' : ''} />
            <span>{isGrooming ? 'Sedang Merapikan...' : 'Rapikan & Bersihkan Duplikat'}</span>
          </button>
        </div>

        <div className="flex-1 w-full h-full cursor-crosshair">
          <ForceGraph2D
            ref={fgRef}
            width={graphDimensions.width}
            height={graphDimensions.height}
            graphData={graphData}
            nodeLabel="name"
            nodeColor={(node) => node.color}
            nodeRelSize={4}
            linkColor={() => 'rgba(255,255,255,0.15)'}
            linkWidth={(link) => (link.source.id === 'core' || link.source === 'core' ? 2 : 1)}
            linkCurvature={0.25}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleSpeed={0.005}
            cooldownTicks={60}
            onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
            d3VelocityDecay={0.3}
            onNodeClick={(node) => {
              if (node.group === 3) {
                onSelectNode(node)
                fgRef.current?.centerAt(node.x, node.y, 1000)
                fgRef.current?.zoom(3, 1000)
              } else {
                fgRef.current?.centerAt(node.x, node.y, 1000)
                fgRef.current?.zoom(2.5, 1000)
              }
            }}
            nodeCanvasObjectMode={() => 'after'}
            nodeCanvasObject={(node, ctx, globalScale) => {
              if (node.group === 0 || node.group === 1 || node.group === 2) {
                const fontSize =
                  node.group === 0 ? 15 / globalScale : node.group === 1 ? 13 / globalScale : 10 / globalScale
                if (globalScale > 0.5) {
                  ctx.font = `${fontSize}px Sans-Serif`
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillStyle = 'rgba(255,255,255,0.85)'
                  ctx.fillText(node.name, node.x, node.y + node.val + 8 / globalScale)
                }
              }
            }}
          />
        </div>
      </div>
    )
  }

  // Embedded Column
  return (
    <div
      ref={graphContainerRef}
      className="lg:col-span-5 bg-base-200/50 backdrop-blur-md border border-white/5 rounded-2xl relative flex flex-col min-h-[380px] lg:min-h-0 overflow-hidden shadow-xl"
    >
      <div className="absolute top-3 left-4 z-20 flex items-center justify-between right-4 pointer-events-none">
        <div className="flex items-center gap-2 text-xs font-bold font-mono text-base-content bg-base-300/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-md">
          <FaNetworkWired className="text-primary" /> PETA JARINGAN MEMORI
        </div>
        {onNavigateToFull && (
          <button
            type="button"
            onClick={onNavigateToFull}
            className="pointer-events-auto text-[10px] font-mono text-base-content/60 hover:text-base-content bg-base-300/80 px-2.5 py-1.5 rounded-xl border border-white/10 flex items-center gap-1 shadow-md cursor-pointer transition-colors"
          >
            Layar Penuh <FaChevronRight size={8} />
          </button>
        )}
      </div>

      {/* Mini Trigger Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between p-2.5 rounded-xl bg-base-300/90 backdrop-blur-md border border-white/10 text-xs text-base-content/80 shadow-md">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-primary">
          <FiCheckCircle className="text-primary" />
          <span>{groomResult.lastChecked ? 'Memori Rapi' : 'Siap Dirapikan'}</span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await triggerGrooming(true)
            await loadBrainData()
          }}
          disabled={isGrooming}
          className="btn btn-xs btn-primary font-mono text-[10px] flex items-center gap-1"
        >
          <FiRefreshCw className={isGrooming ? 'animate-spin' : ''} />
          <span>{isGrooming ? 'Merapikan...' : 'Rapikan Memori'}</span>
        </button>
      </div>

      {/* 2D Canvas ForceGraph */}
      <div className="flex-1 w-full h-full cursor-crosshair">
        <ForceGraph2D
          ref={fgRef}
          width={graphDimensions.width}
          height={graphDimensions.height}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={(node) => node.color}
          nodeRelSize={4}
          linkColor={() => 'rgba(255,255,255,0.08)'}
          linkWidth={(link) => (link.source.id === 'core' || link.source === 'core' ? 1.5 : 1)}
          linkCurvature={0.2}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={1.2}
          linkDirectionalParticleSpeed={0.004}
          cooldownTicks={60}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
          d3VelocityDecay={0.3}
          onNodeClick={(node) => {
            if (node.group === 3) {
              onSelectNode(node)
              fgRef.current?.centerAt(node.x, node.y, 1000)
              fgRef.current?.zoom(3, 1000)
            } else {
              fgRef.current?.centerAt(node.x, node.y, 1000)
              fgRef.current?.zoom(2.5, 1000)
            }
          }}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node, ctx, globalScale) => {
            if (node.group === 0 || node.group === 1 || node.group === 2) {
              const fontSize =
                node.group === 0 ? 15 / globalScale : node.group === 1 ? 13 / globalScale : 10 / globalScale
              if (globalScale > 0.5) {
                ctx.font = `${fontSize}px Sans-Serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.fillText(node.name, node.x, node.y + node.val + 8 / globalScale)
              }
            }
          }}
        />
      </div>
    </div>
  )
}

export default SynapticMemoryLobe
