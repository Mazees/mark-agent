import React, { useEffect, useState, useRef, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { getAllChatArchives, getAllMemory, getAllDocuments } from '../../api/db'

const MemoryVisualizer = ({ isOpen, onClose }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })
  const [selectedNode, setSelectedNode] = useState(null)
  const fgRef = useRef()

  // Resize listener
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Configure Physics Engine
  useEffect(() => {
    if (fgRef.current && isOpen) {
      // Repel nodes more strongly so they don't clump
      fgRef.current.d3Force('charge').strength(-150)
      // Give links a bit more distance
      fgRef.current.d3Force('link').distance(40)
    }
  }, [isOpen])

  // Fetch and format data
  useEffect(() => {
    if (isOpen) {
      const loadMemories = async () => {
        const archives = await getAllChatArchives();
        const explicitMemories = await getAllMemory();
        const documents = await getAllDocuments();
        
        const nodes = [];
        const links = [];

        // 0. Core Node
        const coreNodeId = 'core';
        nodes.push({ id: coreNodeId, name: 'Mark Neural Core', group: 0, val: 25, color: '#00ff66' });

        // 1. Sub-Cores (Main Branches)
        nodes.push({ id: 'archives-root', name: 'Chat History', group: 1, val: 15, color: '#00e5ff' });
        nodes.push({ id: 'vector-root', name: 'Knowledge Base', group: 1, val: 15, color: '#ff00aa' });
        nodes.push({ id: 'doc-root', name: 'Document Vault', group: 1, val: 15, color: '#ffaa00' });
        
        links.push({ source: coreNodeId, target: 'archives-root', color: 'rgba(255,255,255,0.3)' });
        links.push({ source: coreNodeId, target: 'vector-root', color: 'rgba(255,255,255,0.3)' });
        links.push({ source: coreNodeId, target: 'doc-root', color: 'rgba(255,255,255,0.3)' });

        // 2 & 3. Process Chat Archives
        const topics = [...new Set(archives.map(a => a.topic || 'General'))];
        topics.forEach(topic => {
          nodes.push({ id: `topic-${topic}`, name: topic, group: 2, val: 10, color: '#00e5ff' });
          links.push({ source: 'archives-root', target: `topic-${topic}`, color: 'rgba(255,255,255,0.1)' });
        });

        archives.forEach(arc => {
          const topicId = `topic-${arc.topic || 'General'}`;
          nodes.push({
            id: `arc-${arc.id}`,
            name: arc.summary.substring(0, 30) + '...',
            fullText: arc.summary,
            date: new Date(arc.timestamp).toLocaleDateString(),
            group: 3,
            val: 4,
            color: '#a0a0a0',
            typeLabel: 'Chat Archive'
          });
          links.push({ source: topicId, target: `arc-${arc.id}`, color: 'rgba(255,255,255,0.1)' });
        });

        // 2 & 3. Process Vector Explicit Memories
        const memoryTypes = [...new Set(explicitMemories.map(m => m.type || 'other'))];
        memoryTypes.forEach(type => {
          nodes.push({ id: `type-${type}`, name: type.toUpperCase(), group: 2, val: 10, color: '#ff00aa' });
          links.push({ source: 'vector-root', target: `type-${type}`, color: 'rgba(255,255,255,0.1)' });
        });

        explicitMemories.forEach(mem => {
          const typeId = `type-${mem.type || 'other'}`;
          nodes.push({
            id: `mem-${mem.id}`,
            name: mem.key ? mem.key : mem.memory.substring(0, 30) + '...',
            fullText: mem.memory,
            date: 'Vector RAG',
            group: 3,
            val: 5,
            color: '#e0e0e0',
            typeLabel: 'Explicit Memory'
          });
          links.push({ source: typeId, target: `mem-${mem.id}`, color: 'rgba(255,255,255,0.1)' });
        });

        // 2 & 3. Process Documents (PDFs)
        const docNames = [...new Set(documents.map(d => d.docName || 'Unknown Document'))];
        docNames.forEach(docName => {
          nodes.push({ id: `docGroup-${docName}`, name: docName, group: 2, val: 12, color: '#ffaa00' });
          links.push({ source: 'doc-root', target: `docGroup-${docName}`, color: 'rgba(255,255,255,0.1)' });
        });

        documents.forEach(doc => {
          const docGroupId = `docGroup-${doc.docName || 'Unknown Document'}`;
          nodes.push({
            id: `doc-${doc.id}`,
            name: `Chunk ${doc.chunkIndex}`,
            fullText: doc.content,
            date: doc.timestamp ? new Date(doc.timestamp).toLocaleDateString() : 'Parsed Document',
            group: 3,
            val: 4,
            color: '#d0b080',
            typeLabel: 'Document Chunk'
          });
          links.push({ source: docGroupId, target: `doc-${doc.id}`, color: 'rgba(255,255,255,0.1)' });
        });

        setGraphData({ nodes, links });
      };
      loadMemories();
    }
  }, [isOpen]);

  // Handle graph physics on load
  useEffect(() => {
    if (fgRef.current && isOpen) {
      fgRef.current.d3Force('charge').strength(-200)
      fgRef.current.d3Force('link').distance(60)
      fgRef.current.zoom(1.5, 1000)
    }
  }, [isOpen, graphData])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-base-300/95 animate-[fade-in_0.5s_ease-out_forwards]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,100,0.05)_0%,transparent_60%)] pointer-events-none" />

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-8 right-8 btn btn-circle btn-ghost text-white/50 hover:text-white z-10"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {/* Graph Area */}
      <div className="absolute inset-0 cursor-crosshair">
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={(node) => node.color}
          nodeRelSize={4}
          linkColor={(link) => 'rgba(255,255,255,0.15)'}
          linkWidth={(link) => (link.source.id === 'core' || link.source === 'core' ? 2 : 1)}
          linkCurvature={0.25}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleSpeed={0.005}
          cooldownTicks={60}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
          d3VelocityDecay={0.3}
          onNodeClick={(node) => {
            // Only select leaf nodes (group 3 for our dual-tree structure)
            if (node.group === 3) {
              setSelectedNode(node)
              fgRef.current.centerAt(node.x, node.y, 1000)
              fgRef.current.zoom(3, 1000)
            } else {
              // Zoom into clusters
              fgRef.current.centerAt(node.x, node.y, 1000)
              fgRef.current.zoom(2.5, 1000)
            }
          }}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node, ctx, globalScale) => {
            if (node.group === 0 || node.group === 1 || node.group === 2) {
              // Core = 16, Sub-Core = 14, Topic/Type = 10
              const fontSize = node.group === 0 ? 16 / globalScale : node.group === 1 ? 14 / globalScale : 10 / globalScale;
              if (globalScale > 0.5) {
                ctx.font = `${fontSize}px Sans-Serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = 'rgba(255,255,255,0.8)'
                ctx.fillText(node.name, node.x, node.y + node.val + (8 / globalScale))
              }
            }
          }}
        />
      </div>

      {/* Info Panel for Selected Node */}
      {selectedNode && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg bg-base-100/90 border border-white/10 rounded-2xl p-6 shadow-2xl animate-[slide-up_0.3s_ease-out_forwards] z-10">
          <button
            onClick={() => setSelectedNode(null)}
            className="absolute top-4 right-4 text-white/40 hover:text-white"
          >
            ✕
          </button>
          <div className="flex gap-2 items-center mb-3">
            <span className={`badge badge-sm ${selectedNode.typeLabel === 'Explicit Memory' ? 'badge-secondary' : selectedNode.typeLabel === 'Document Chunk' ? 'badge-warning' : 'badge-primary'}`}>
              {selectedNode.typeLabel || 'Memori Terkunci'}
            </span>
            <span className="text-xs opacity-50">{selectedNode.date}</span>
          </div>
          <p className="text-sm opacity-90 leading-relaxed font-mono">
            "{selectedNode.fullText}"
          </p>
        </div>
      )}
    </div>
  )
}

export default MemoryVisualizer
