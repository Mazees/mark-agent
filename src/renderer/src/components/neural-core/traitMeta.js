import { FaFire, FaTheaterMasks, FaHandshake, FaBolt, FaRobot } from 'react-icons/fa'

export const TRAIT_META = [
  {
    key: 'warmth',
    label: 'Kehangatan',
    desc: 'Keakraban dalam percakapan',
    color: 'text-error',
    border: 'border-error/20',
    bg: 'bg-error/10',
    ring: 'ring-error/30',
    hex: '#f87171',
    icon: FaFire
  },
  {
    key: 'sarcasm_level',
    label: 'Sarkasme',
    desc: 'Intensitas humor dan sindiran',
    color: 'text-warning',
    border: 'border-warning/20',
    bg: 'bg-warning/10',
    ring: 'ring-warning/30',
    hex: '#fbbf24',
    icon: FaTheaterMasks
  },
  {
    key: 'trust',
    label: 'Kepercayaan',
    desc: 'Keterbukaan saat berinteraksi',
    color: 'text-success',
    border: 'border-success/20',
    bg: 'bg-success/10',
    ring: 'ring-success/30',
    hex: '#34d399',
    icon: FaHandshake
  },
  {
    key: 'energy',
    label: 'Energi',
    desc: 'Tingkat energi dalam respons',
    color: 'text-info',
    border: 'border-info/20',
    bg: 'bg-info/10',
    ring: 'ring-info/30',
    hex: '#38bdf8',
    icon: FaBolt
  },
  {
    key: 'obedience',
    label: 'Kepatuhan',
    desc: 'Kecenderungan mengikuti arahan',
    color: 'text-secondary',
    border: 'border-secondary/20',
    bg: 'bg-secondary/10',
    ring: 'ring-secondary/30',
    hex: '#c084fc',
    icon: FaRobot
  }
]

export function describeLevel(val) {
  if (val >= 0.85) return 'Sangat Tinggi'
  if (val >= 0.7) return 'Tinggi'
  if (val >= 0.55) return 'Agak Tinggi'
  if (val >= 0.45) return 'Netral'
  if (val >= 0.3) return 'Agak Rendah'
  if (val >= 0.15) return 'Rendah'
  return 'Sangat Rendah'
}

export function describePersonality(traits) {
  if (!traits) return 'Memuat...'
  const { warmth, sarcasm_level, trust, energy, obedience } = traits
  const parts = []

  if (warmth >= 0.7) parts.push('hangat dan akrab')
  else if (warmth <= 0.3) parts.push('dingin dan berjarak')
  else parts.push('ramah')

  if (sarcasm_level >= 0.7) parts.push('sering menyindir')
  else if (sarcasm_level <= 0.3) parts.push('sopan dan tenang')
  else parts.push('humoris tetapi tetap sopan')

  if (trust >= 0.7) parts.push('terus terang')
  else if (trust <= 0.3) parts.push('hati-hati dan formal')
  else parts.push('cukup terbuka')

  if (energy >= 0.7) parts.push('penuh semangat')
  else if (energy <= 0.3) parts.push('kalem dan tenang')
  else parts.push('memiliki suasana hati yang stabil')

  if (obedience >= 0.7) parts.push('cenderung mengikuti arahan')
  else if (obedience <= 0.3) parts.push('lebih mandiri dalam menanggapi arahan')

  return `Mark saat ini bersikap ${parts.join(', ')}.`
}
