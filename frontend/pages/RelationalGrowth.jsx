import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRelationship, saveRelationship } from '../api/db'
import { useConfirm } from '../hooks/useConfirm'
import {
  FaFire,
  FaTheaterMasks,
  FaHandshake,
  FaBolt,
  FaBrain,
  FaChartLine,
  FaCommentDots,
  FaCubes,
  FaInfoCircle,
  FaChartBar,
  FaClock,
  FaHeart,
  FaShieldAlt,
  FaUndo,
  FaSave,
  FaRobot
} from 'react-icons/fa'

const TRAIT_META = [
  {
    key: 'warmth',
    label: 'Kehangatan',
    desc: 'Kehangatan & keakraban emosional',
    color: 'text-error',
    bg: 'bg-error/10',
    ring: 'ring-error/30',
    icon: FaFire
  },
  {
    key: 'sarcasm_level',
    label: 'Sarkasme',
    desc: 'Level sarkas & toxic-friendly',
    color: 'text-warning',
    bg: 'bg-warning/10',
    ring: 'ring-warning/30',
    icon: FaTheaterMasks
  },
  {
    key: 'trust',
    label: 'Kepercayaan',
    desc: 'Kepercayaan & keterbukaan',
    color: 'text-success',
    bg: 'bg-success/10',
    ring: 'ring-success/30',
    icon: FaHandshake
  },
  {
    key: 'energy',
    label: 'Energi',
    desc: 'Baseline mood & energi',
    color: 'text-info',
    bg: 'bg-info/10',
    ring: 'ring-info/30',
    icon: FaBolt
  },
  {
    key: 'obedience',
    label: 'Kepatuhan',
    desc: 'Pelayan vs mandiri',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
    ring: 'ring-secondary/30',
    icon: FaRobot
  }
]

function describeLevel(val) {
  if (val >= 0.85) return 'Sangat Tinggi'
  if (val >= 0.7) return 'Tinggi'
  if (val >= 0.55) return 'Agak Tinggi'
  if (val >= 0.45) return 'Netral'
  if (val >= 0.3) return 'Agak Rendah'
  if (val >= 0.15) return 'Rendah'
  return 'Sangat Rendah'
}

function describePersonality(traits) {
  if (!traits) return 'Memuat...'
  const { warmth, sarcasm_level, trust, energy, obedience } = traits
  const parts = []

  if (warmth >= 0.7) parts.push('hangat dan akrab')
  else if (warmth <= 0.3) parts.push('dingin dan berjarak')
  else parts.push('ramah standar')

  if (sarcasm_level >= 0.7) parts.push('suka roasting')
  else if (sarcasm_level <= 0.3) parts.push('sopan dan kalem')
  else parts.push('witty tapi sopan')

  if (trust >= 0.7) parts.push('blak-blakan')
  else if (trust <= 0.3) parts.push('hati-hati dan formal')
  else parts.push('cukup terbuka')

  if (energy >= 0.7) parts.push('penuh semangat')
  else if (energy <= 0.3) parts.push('kalem dan tenang')
  else parts.push('mood stabil')

  if (obedience >= 0.7) parts.push('sangat penurut')
  else if (obedience <= 0.3) parts.push('berani membantah')

  return `Mark saat ini bersikap ${parts.join(', ')}.`
}

const TraitRing = ({ value, color, icon: Icon, label, desc, ring }) => {
  const pct = value * 100
  const r = 42
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className={`flex flex-col items-center gap-2 p-3 rounded-2xl bg-base-200/50 border border-white/5 ring-1 ${ring} transition-all hover:scale-[1.03] hover:bg-base-200/80`}>
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="6" className="stroke-base-content/10" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className={`transition-all duration-1000 ease-out stroke-current ${color}`}
          />
        </svg>
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${color}`}>
          <Icon className="text-xl" />
          <span className="text-sm font-bold font-mono mt-0.5">{value.toFixed(2)}</span>
        </div>
      </div>
      <div className="text-center">
        <p className={`text-[13px] font-bold ${color}`}>{label}</p>
        <p className="text-[10px] leading-tight text-base-content/50 mt-0.5">{desc}</p>
        <p className={`text-[11px] font-semibold mt-1 ${color}`}>{describeLevel(value)}</p>
      </div>
    </div>
  )
}

const RelationalGrowth = () => {
  const navigate = useNavigate()
  const [traits, setTraits] = useState(null)
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const { confirm, ModalComponent } = useConfirm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const rel = await getRelationship('owner')
      setTraits(rel)
    } catch (err) {
      console.error('[RelationalGrowth] Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleReset = async () => {
    const result = await confirm({
      title: 'Reset Sifat Hubungan?',
      message: 'Ini akan mereset semua trait Mark ke netral (0.5). Hubungan akan dimulai dari awal. Lanjutkan?',
      isError: true,
      confirmText: 'Ya, Reset'
    })

    if (result.isConfirmed) {
      await saveRelationship({
        userId: 'owner',
        warmth: 0.5,
        sarcasm_level: 0.5,
        trust: 0.5,
        energy: 0.5,
        obedience: 0.5,
        evalCount: 0,
        lastChatIndex: 0,
        reasoning: 'Direset manual oleh user.',
        lastEvaluation: null
      })
      await loadData()
    }
  }

  return (
    <div className="h-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(var(--p)/0.08)_0%,transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,oklch(var(--s)/0.06)_0%,transparent_50%)] pointer-events-none" />

      {/* Main Content */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto px-4 py-8 pb-32 space-y-8">

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn btn-ghost btn-sm btn-circle shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali"
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
                <h1 className="text-2xl font-bold">Relational Growth</h1>
                <p className="opacity-50 text-sm mt-1">
                  Statistik kepribadian & hubungan Mark denganmu.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-sm btn-error btn-outline gap-1"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
              Reset
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
          ) : (
            <>
              {/* Personality Summary Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-base-200/80 to-base-300/50 border border-white/5 backdrop-blur-sm">
                <p className="text-sm font-semibold text-primary mb-2 flex items-center gap-2"><FaBrain className="text-primary" /> Kepribadian Saat Ini</p>
                <p className="text-base-content/80 text-sm leading-relaxed">{describePersonality(traits)}</p>
                {traits?.evalCount > 0 && (
                  <div className="flex items-center gap-4 mt-3 text-xs text-base-content/40">
                    <span className="flex items-center gap-1"><FaChartBar className="text-base-content/40" /> Evaluasi ke-{traits.evalCount}</span>
                    {traits.lastEvaluation && (
                      <span className="flex items-center gap-1"><FaClock className="text-base-content/40" /> {new Date(traits.lastEvaluation).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Trait Rings Grid */}
              <div>
                <p className="text-sm font-semibold text-base-content/70 mb-4 flex items-center gap-2"><FaChartLine className="text-primary/70" /> Trait Overview</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {TRAIT_META.map(t => (
                    <TraitRing
                      key={t.key}
                      value={traits?.[t.key] ?? 0.5}
                      color={t.color}
                      icon={t.icon}
                      label={t.label}
                      desc={t.desc}
                      text={t.text}
                      ring={t.ring}
                    />
                  ))}
                </div>
              </div>

              {/* Reasoning Log */}
              {traits?.reasoning && (
                <div>
                  <p className="text-sm font-semibold text-base-content/70 mb-3 flex items-center gap-2"><FaCommentDots className="text-primary/70" /> Reasoning Terakhir</p>
                  <div className="p-4 rounded-2xl bg-base-200/50 border border-white/5">
                    <p className="text-sm text-base-content/70 italic leading-relaxed">&ldquo;{traits.reasoning}&rdquo;</p>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div>
                <p className="text-sm font-semibold text-base-content/70 mb-4 flex items-center gap-2"><FaCubes className="text-primary/70" /> Statistik Hubungan</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: 'Evaluasi Sifat', value: traits?.evalCount || 0, icon: FaChartBar, sub: 'Total drift evaluation', iconColor: 'text-primary' },
                    { label: 'Kehangatan', value: ((traits?.warmth || 0.5) * 100).toFixed(0) + '%', icon: FaFire, sub: describeLevel(traits?.warmth || 0.5), iconColor: 'text-error' },
                    { label: 'Kepercayaan', value: ((traits?.trust || 0.5) * 100).toFixed(0) + '%', icon: FaShieldAlt, sub: describeLevel(traits?.trust || 0.5), iconColor: 'text-success' },
                    { label: 'Sarkasme', value: ((traits?.sarcasm_level || 0.5) * 100).toFixed(0) + '%', icon: FaTheaterMasks, sub: describeLevel(traits?.sarcasm_level || 0.5), iconColor: 'text-warning' },
                    { label: 'Kepatuhan', value: ((traits?.obedience || 0.5) * 100).toFixed(0) + '%', icon: FaRobot, sub: describeLevel(traits?.obedience || 0.5), iconColor: 'text-secondary' }
                  ].map((stat, i) => {
                    const StatIcon = stat.icon
                    return (
                      <div key={i} className="p-3 rounded-xl bg-base-200/40 border border-white/5 hover:bg-base-200/60 transition-colors">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <StatIcon className={`text-sm ${stat.iconColor}`} />
                          <span className="text-[11px] text-base-content/50 leading-none">{stat.label}</span>
                        </div>
                        <p className={`text-lg font-bold font-mono leading-none ${stat.iconColor}`}>{stat.value}</p>
                        <p className="text-[10px] text-base-content/40 mt-1.5 leading-none">{stat.sub}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {ModalComponent}
    </div>
  )
}

export default RelationalGrowth
