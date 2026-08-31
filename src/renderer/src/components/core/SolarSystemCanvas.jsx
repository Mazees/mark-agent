import React, { useEffect, useRef, useMemo } from 'react'
import { GROUP_TOOLS_SCHEMA } from '../../api/tools/group-tools'
import { core_tools_schema } from '../../api/tools/core-tools'

/**
 * Palet warna holographic untuk setiap orbit planet kluster tools MARK V5
 */
export const CLUSTER_THEMES = {
  advanced_browser: { name: 'Web Browser', color: '#00e5ff', radius: 170, speed: 0.0008, size: 6.5 },
  pc_automation: { name: 'OS Automation', color: '#facc15', radius: 230, speed: 0.0006, size: 7.5 },
  youtube_music: { name: 'Media & Music', color: '#f43f5e', radius: 290, speed: -0.0005, size: 6 },
  subagents: { name: 'Sub-Agents', color: '#c084fc', radius: 350, speed: 0.0004, size: 8.5 },
  file_system: { name: 'File System', color: '#10b981', radius: 410, speed: -0.00035, size: 7 },
  memory_rag: { name: 'Memory RAG', color: '#ec4899', radius: 470, speed: 0.0003, size: 6.5 },
  google_drive: { name: 'Google Drive', color: '#38bdf8', radius: 520, speed: -0.00025, size: 5.5 },
  google_calendar: { name: 'Calendar', color: '#0284c7', radius: 570, speed: 0.00022, size: 5.5 },
  google_gmail: { name: 'Gmail Inbox', color: '#ea580c', radius: 620, speed: -0.0002, size: 5.5 },
  system_vision_tg: { name: 'Vision & TG', color: '#14b8a6', radius: 670, speed: 0.00018, size: 6 },
  git_vcs: { name: 'Git VCS', color: '#8b5cf6', radius: 720, speed: -0.00015, size: 6 },
  task_terminal: { name: 'CLI Daemon', color: '#f97316', radius: 770, speed: 0.00012, size: 6 },
  custom_plugins: { name: 'Plugins', color: '#a855f7', radius: 820, speed: -0.00011, size: 6.5 },
  core_system: { name: 'Core Shell', color: '#6366f1', radius: 870, speed: -0.0001, size: 6.5 }
}

/**
 * Membangun registry kluster tools lengkap langsung dari GROUP_TOOLS_SCHEMA & core_tools_schema
 */
export function buildCompleteToolClusters(dynamicPlugins = []) {
  const clusters = []

  // 1. Ambil seluruh group tools dari GROUP_TOOLS_SCHEMA (kecuali custom_plugins jika diisi dynamicPlugins)
  const hasDynamicPlugins = Array.isArray(dynamicPlugins) && dynamicPlugins.length > 0

  Object.entries(GROUP_TOOLS_SCHEMA).forEach(([groupKey, groupData]) => {
    // Jika custom_plugins memiliki dynamic plugin tersendiri, kita gantikan schema statis list-plugins dengan daftar action plugins dinamis
    if (groupKey === 'custom_plugins' && hasDynamicPlugins) return

    const theme = CLUSTER_THEMES[groupKey] || {
      name: groupKey.replace(/_/g, ' ').toUpperCase(),
      color: '#00e5ff',
      radius: 300,
      speed: 0.0005,
      size: 6
    }
    const tools = (groupData.tools || []).map((t) => {
      const fn = t.function || t
      return {
        id: `tool-${fn.name}`,
        name: fn.name,
        label: fn.name.replace(/^(browser|os|gdrive|gcalendar|gmail|music|git|tg)-/, ''),
        description: fn.description,
        clusterKey: groupKey,
        matchTools: [fn.name, fn.name.replace(/-/g, '_'), fn.name.replace(/_/g, '-')]
      }
    })

    clusters.push({
      id: `cluster-${groupKey}`,
      key: groupKey,
      name: theme.name,
      color: theme.color,
      radius: theme.radius || 300,
      speed: theme.speed || 0.0005,
      size: theme.size || 7,
      tools
    })
  })

  // 2. Kumpulkan core tools yang belum termasuk di dalam group tools
  const existingToolNames = new Set()
  clusters.forEach((c) => c.tools.forEach((t) => existingToolNames.add(t.name)))

  const subagentTools = []
  const fileTools = []
  const memoryTools = []
  const coreControlTools = []

  core_tools_schema.forEach((t) => {
    const fn = t.function || t
    if (existingToolNames.has(fn.name)) return

    const item = {
      id: `tool-${fn.name}`,
      name: fn.name,
      label: fn.name.replace(/^(browser|os|gdrive|gcalendar|gmail|music|git|tg)-/, ''),
      description: fn.description,
      matchTools: [fn.name, fn.name.replace(/-/g, '_'), fn.name.replace(/_/g, '-')]
    }

    if (
      fn.name.includes('subagent') ||
      fn.name.includes('message_agent') ||
      fn.name.includes('send_message') ||
      fn.name.includes('report_to_lead')
    ) {
      item.clusterKey = 'subagents'
      subagentTools.push(item)
    } else if (
      fn.name.includes('file') ||
      fn.name.includes('replace') ||
      fn.name.includes('list-dir') ||
      fn.name.includes('find-files') ||
      fn.name.includes('grep')
    ) {
      item.clusterKey = 'file_system'
      fileTools.push(item)
    } else if (
      fn.name.includes('memory') ||
      fn.name.includes('document') ||
      fn.name.includes('skill')
    ) {
      item.clusterKey = 'memory_rag'
      memoryTools.push(item)
    } else {
      item.clusterKey = 'core_system'
      coreControlTools.push(item)
    }
  })

  if (subagentTools.length > 0) {
    clusters.push({
      id: 'cluster-subagents',
      key: 'subagents',
      name: CLUSTER_THEMES.subagents.name,
      color: CLUSTER_THEMES.subagents.color,
      radius: CLUSTER_THEMES.subagents.radius,
      speed: CLUSTER_THEMES.subagents.speed,
      size: CLUSTER_THEMES.subagents.size,
      tools: subagentTools
    })
  }

  if (fileTools.length > 0) {
    clusters.push({
      id: 'cluster-file_system',
      key: 'file_system',
      name: CLUSTER_THEMES.file_system.name,
      color: CLUSTER_THEMES.file_system.color,
      radius: CLUSTER_THEMES.file_system.radius,
      speed: CLUSTER_THEMES.file_system.speed,
      size: CLUSTER_THEMES.file_system.size,
      tools: fileTools
    })
  }

  if (memoryTools.length > 0) {
    clusters.push({
      id: 'cluster-memory_rag',
      key: 'memory_rag',
      name: CLUSTER_THEMES.memory_rag.name,
      color: CLUSTER_THEMES.memory_rag.color,
      radius: CLUSTER_THEMES.memory_rag.radius,
      speed: CLUSTER_THEMES.memory_rag.speed,
      size: CLUSTER_THEMES.memory_rag.size,
      tools: memoryTools
    })
  }

  if (coreControlTools.length > 0) {
    clusters.push({
      id: 'cluster-core_system',
      key: 'core_system',
      name: CLUSTER_THEMES.core_system.name,
      color: CLUSTER_THEMES.core_system.color,
      radius: CLUSTER_THEMES.core_system.radius,
      speed: CLUSTER_THEMES.core_system.speed,
      size: CLUSTER_THEMES.core_system.size,
      tools: coreControlTools
    })
  }

  // 3. Tambahkan Custom Plugins jika ada
  if (Array.isArray(dynamicPlugins) && dynamicPlugins.length > 0) {
    const pluginTools = []
    dynamicPlugins.forEach((p) => {
      if (p.isEnabled !== false && Array.isArray(p.actions)) {
        p.actions.forEach((act) => {
          const actionName = act.name
          const fullPrefix = `plugin-${p.name}-${actionName}`
          pluginTools.push({
            id: `plugin-tool-${p.name}-${actionName}`,
            name: `${p.name}/${actionName}`,
            label: actionName,
            description: act.description || p.description || `Custom plugin ${p.name}`,
            clusterKey: 'custom_plugins',
            matchTools: [
              actionName,
              fullPrefix,
              `plugin-${actionName}`,
              `plugin_${p.name}_${actionName}`,
              `plugin_${actionName}`
            ]
          })
        })
      }
    })

    if (pluginTools.length > 0) {
      clusters.push({
        id: 'cluster-custom_plugins',
        key: 'custom_plugins',
        name: CLUSTER_THEMES.custom_plugins.name,
        color: CLUSTER_THEMES.custom_plugins.color,
        radius: CLUSTER_THEMES.custom_plugins.radius,
        speed: CLUSTER_THEMES.custom_plugins.speed,
        size: CLUSTER_THEMES.custom_plugins.size,
        tools: pluginTools
      })
    }
  }

  return clusters
}

export const STATIC_TOOL_CLUSTERS = buildCompleteToolClusters()

/**
 * SolarSystemCanvas (Cosmos Planetary Engine)
 * Merender semesta tata surya kinetik otonom berbasis HTML5 Canvas 60 FPS.
 * Planet-planet merepresentasikan kluster tools dan satelit kecil merepresentasikan kapabilitas tools aktif.
 */
export const SolarSystemCanvas = ({
  processes = [],
  moodColor = '#1fb854',
  className = '',
  orbStatus = 'idle'
}) => {
  const canvasRef = useRef(null)

  // Ekstrak nama tools yang sedang aktif berjalan secara real-time dari telemetry
  const activeToolNames = useMemo(() => {
    const active = new Set()
    processes.forEach((p) => {
      if (p.status === 'active' || p.status === 'running' || p.status === 'executing') {
        if (p.type) active.add(p.type.toLowerCase())
        if (p.name) active.add(p.name.toLowerCase())
        if (p.tool) active.add(p.tool.toLowerCase())
        if (p.data?.task) active.add(String(p.data.task).toLowerCase())
        if (p.data?.tool) active.add(String(p.data.tool).toLowerCase())
      }
    })
    return active
  }, [processes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth)
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth
      height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Inisialisasi Stars / Deep Space Stardust
    const starsCount = 180
    const stars = Array.from({ length: starsCount }, () => ({
      x: (Math.random() - 0.5) * 2600,
      y: (Math.random() - 0.5) * 2600,
      size: Math.random() * 1.6 + 0.4,
      alpha: Math.random() * 0.7 + 0.2,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinklePhase: Math.random() * Math.PI * 2
    }))

    // Inisialisasi posisi sudut awal tiap planet
    const planets = STATIC_TOOL_CLUSTERS.map((cluster, i) => ({
      ...cluster,
      angle: (i / STATIC_TOOL_CLUSTERS.length) * Math.PI * 2,
      pulsePhase: Math.random() * Math.PI * 2,
      flareIntensity: 0
    }))

    // Satelit / asteroid partikel orbit bebas
    const asteroidCount = 45
    const asteroids = Array.from({ length: asteroidCount }, () => ({
      radius: 120 + Math.random() * 750,
      angle: Math.random() * Math.PI * 2,
      speed: (Math.random() * 0.0006 + 0.0002) * (Math.random() > 0.5 ? 1 : -1),
      size: Math.random() * 1.5 + 0.6,
      color: 'rgba(255, 255, 255, 0.4)'
    }))

    let lastTime = performance.now()

    const render = (time) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000)
      lastTime = time

      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2

      // 1. Background Void & Radial Nebula Deep Glow
      const bgGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        30,
        centerX,
        centerY,
        Math.max(width, height) * 0.85
      )
      bgGrad.addColorStop(0, 'rgba(15, 35, 28, 0.45)')
      bgGrad.addColorStop(0.4, 'rgba(10, 20, 16, 0.75)')
      bgGrad.addColorStop(1, '#060a08')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Render Background Twinkling Stardust
      ctx.save()
      ctx.translate(centerX, centerY)

      stars.forEach((s) => {
        s.twinklePhase += s.twinkleSpeed
        const currentAlpha = s.alpha + Math.sin(s.twinklePhase) * 0.25
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, Math.min(0.9, currentAlpha))})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      })

      // 3. Render Asteroid Belts (Ring Orbit Debu Halus)
      asteroids.forEach((ast) => {
        ast.angle += ast.speed
        const ax = Math.cos(ast.angle) * ast.radius
        const ay = Math.sin(ast.angle) * ast.radius * 0.72 // Proyeksi elips perspektif 3D
        ctx.fillStyle = ast.color
        ctx.beginPath()
        ctx.arc(ax, ay, ast.size, 0, Math.PI * 2)
        ctx.fill()
      })

      // 4. Render Orbit Rings (Garis Orbit Tiap Planet Kluster)
      planets.forEach((p) => {
        const isClusterActive = p.tools.some((t) =>
          t.matchTools.some(
            (mt) => activeToolNames.has(mt) || [...activeToolNames].some((an) => an.includes(mt))
          )
        )

        ctx.save()
        ctx.beginPath()
        // Orbit berbentuk elips halus untuk ilusi kedalaman ruang
        ctx.ellipse(0, 0, p.radius, p.radius * 0.72, 0, 0, Math.PI * 2)
        ctx.strokeStyle = isClusterActive
          ? p.color
          : 'rgba(255, 255, 255, 0.04)'
        ctx.lineWidth = isClusterActive ? 1.5 : 0.75
        if (isClusterActive) {
          ctx.shadowColor = p.color
          ctx.shadowBlur = 12
        }
        ctx.stroke()
        ctx.restore()
      })

      // 5. Render Planet-Planet Kluster Tools & Satelit
      planets.forEach((p) => {
        // Kecepatan putaran orbit
        p.angle += p.speed
        p.pulsePhase += dt * 2

        const isClusterActive = p.tools.some((t) =>
          t.matchTools.some(
            (mt) => activeToolNames.has(mt) || [...activeToolNames].some((an) => an.includes(mt))
          )
        )

        const px = Math.cos(p.angle) * p.radius
        const py = Math.sin(p.angle) * p.radius * 0.72

        // Jika kluster sedang aktif, gambar laser pulsa energi ke pusat (Sun/Core)
        if (isClusterActive) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(0, 0)
          const laserGrad = ctx.createLinearGradient(px, py, 0, 0)
          laserGrad.addColorStop(0, p.color)
          laserGrad.addColorStop(1, 'rgba(0, 255, 204, 0)')
          ctx.strokeStyle = laserGrad
          ctx.lineWidth = 1.8 + Math.sin(p.pulsePhase * 3) * 0.8
          ctx.shadowColor = p.color
          ctx.shadowBlur = 16
          ctx.stroke()
          ctx.restore()
        }

        // Gambar Badan Planet
        ctx.save()
        ctx.beginPath()
        const planetRadius = isClusterActive
          ? p.size * 1.5 + Math.sin(p.pulsePhase * 2) * 1.5
          : p.size
        ctx.arc(px, py, planetRadius, 0, Math.PI * 2)

        if (isClusterActive) {
          ctx.shadowColor = p.color
          ctx.shadowBlur = 24
          ctx.fillStyle = p.color
        } else {
          ctx.shadowColor = p.color
          ctx.shadowBlur = 6
          ctx.fillStyle = p.color
        }
        ctx.fill()

        // Ring Mini di Sekeliling Planet (Mirip Saturnus)
        ctx.beginPath()
        ctx.ellipse(px, py, planetRadius * 1.9, planetRadius * 0.6, 0.4, 0, Math.PI * 2)
        ctx.strokeStyle = isClusterActive ? '#ffffff' : `${p.color}55`
        ctx.lineWidth = 0.8
        ctx.stroke()

        // Satelit Mini (Tools dalam kluster) mengorbit planetnya
        const numSats = Math.min(4, p.tools.length)
        for (let sIdx = 0; sIdx < numSats; sIdx++) {
          const satAngle = p.angle * 4 + (sIdx / numSats) * Math.PI * 2
          const satDist = planetRadius + 9 + sIdx * 3
          const sx = px + Math.cos(satAngle) * satDist
          const sy = py + Math.sin(satAngle) * satDist * 0.6

          ctx.beginPath()
          ctx.arc(sx, sy, 1.3, 0, Math.PI * 2)
          ctx.fillStyle = isClusterActive ? '#00ffcc' : 'rgba(255, 255, 255, 0.4)'
          ctx.fill()
        }

        // Label Nama Kluster
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isClusterActive ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'
        ctx.fillText(p.name.toUpperCase(), px, py + planetRadius + 6)

        ctx.restore()
      })

      // 6. Pusat Tata Surya (Solar Core Corona Glow)
      ctx.save()
      const corePulse = Math.sin(time * 0.002) * 8
      const coreGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 110 + corePulse)
      coreGrad.addColorStop(0, `${moodColor}33`)
      coreGrad.addColorStop(0.5, `${moodColor}15`)
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(0, 0, 110 + corePulse, 0, Math.PI * 2)
      ctx.fill()

      // Concentric Orbit HUD Ticks di Pusat
      ctx.beginPath()
      ctx.arc(0, 0, 80, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.stroke()
      ctx.setLineDash([])

      ctx.restore()
      ctx.restore()

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animId)
    }
  }, [activeToolNames, moodColor])

  return (
    <div className={`relative w-full h-full select-none overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  )
}

export default SolarSystemCanvas
