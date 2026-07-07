import React, { useEffect, useState, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getAllChatArchives } from '../../api/db';

const MemoryVisualizer = ({ isOpen, onClose }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const fgRef = useRef();

  // Resize listener
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch and format data
  useEffect(() => {
    if (isOpen) {
      const loadMemories = async () => {
        const archives = await getAllChatArchives();
        
        const nodes = [];
        const links = [];

        // 1. Core Node
        const coreNodeId = 'core';
        nodes.push({ 
          id: coreNodeId, 
          name: 'Mark Core Memory', 
          group: 0, 
          val: 20, 
          color: 'oklch(var(--su))' 
        });

        // 2. Extract unique topics to form category nodes
        const topics = [...new Set(archives.map(a => a.topic || 'General'))];
        topics.forEach(topic => {
          nodes.push({
            id: `topic-${topic}`,
            name: topic,
            group: 1,
            val: 10,
            color: 'oklch(var(--p))'
          });
          links.push({
            source: coreNodeId,
            target: `topic-${topic}`,
            color: 'rgba(255,255,255,0.2)'
          });
        });

        // 3. Add individual memories
        archives.forEach(arc => {
          const topicId = `topic-${arc.topic || 'General'}`;
          nodes.push({
            id: arc.id,
            name: arc.summary.substring(0, 30) + '...',
            fullText: arc.summary,
            date: new Date(arc.timestamp).toLocaleDateString(),
            group: 2,
            val: 5,
            color: 'oklch(var(--s))'
          });
          links.push({
            source: topicId,
            target: arc.id,
            color: 'rgba(255,255,255,0.1)'
          });
        });

        setGraphData({ nodes, links });
      };
      
      loadMemories();
    }
  }, [isOpen]);

  // Handle graph physics on load
  useEffect(() => {
    if (fgRef.current && isOpen) {
      fgRef.current.d3Force('charge').strength(-200);
      fgRef.current.d3Force('link').distance(60);
      fgRef.current.zoom(1.5, 1000);
    }
  }, [isOpen, graphData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-base-300/80 backdrop-blur-md animate-[fade-in_0.5s_ease-out_forwards]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,100,0.05)_0%,transparent_60%)] pointer-events-none" />
      
      {/* Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-8 right-8 btn btn-circle btn-ghost text-white/50 hover:text-white z-10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      {/* Graph Area */}
      <div className="absolute inset-0 cursor-crosshair">
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="" 
          nodeColor={node => hoverNode === node ? 'white' : node.color}
          nodeRelSize={6}
          linkColor={link => 'rgba(255,255,255,0.1)'}
          linkWidth={link => 1}
          cooldownTicks={100} // OPTIMIZATION: Stop physics after 100 ticks
          onNodeHover={node => setHoverNode(node)}
          onNodeClick={node => {
            if (node.group === 2) {
              setSelectedNode(node);
              fgRef.current.centerAt(node.x, node.y, 1000);
              fgRef.current.zoom(3, 1000);
            }
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name;
            const fontSize = node.group === 0 ? 16/globalScale : node.group === 1 ? 12/globalScale : 0;
            
            // OPTIMIZATION: Fake glow without shadowBlur (which is extremely slow)
            if (node === hoverNode || node.group === 0) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, node.val * 1.5, 0, 2 * Math.PI, false);
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              ctx.fill();
            }

            // Draw Node
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
            ctx.fillStyle = node === hoverNode ? '#ffffff' : node.color;
            ctx.fill();
            
            // Draw Label for Group 0 and 1
            if (fontSize > 0 && globalScale > 0.5) { // OPTIMIZATION: Don't draw text if zoomed out too far
              ctx.font = `${fontSize}px Sans-Serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.fillText(label, node.x, node.y + node.val + (8/globalScale));
            }
          }}
        />
      </div>

      {/* Info Panel for Selected Node */}
      {selectedNode && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg bg-base-100/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl animate-[slide-up_0.3s_ease-out_forwards] z-10">
          <button 
            onClick={() => setSelectedNode(null)}
            className="absolute top-4 right-4 text-white/40 hover:text-white"
          >
            ✕
          </button>
          <div className="flex gap-2 items-center mb-3">
            <span className="badge badge-primary badge-sm">Memori Terkunci</span>
            <span className="text-xs opacity-50">{selectedNode.date}</span>
          </div>
          <p className="text-sm opacity-90 leading-relaxed font-mono">
            "{selectedNode.fullText}"
          </p>
        </div>
      )}

      {/* Hover Tooltip (Mouse follow) */}
      {hoverNode && !selectedNode && (
        <div 
          className="absolute pointer-events-none bg-black/80 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap z-20"
          style={{
            left: dimensions.width / 2 + 10,
            top: dimensions.height / 2 + 10 // Simplified position, ForceGraph handles real coords differently
          }}
        >
          {hoverNode.name}
        </div>
      )}
    </div>
  );
};

export default MemoryVisualizer;
