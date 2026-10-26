export const agentStatuses = {
  queued: { label: 'Dalam antrean', color: 'text-white/60' },
  waiting_peer: { label: 'Menunggu kolega', color: 'text-warning' },
  waiting_user: { label: 'Perlu keputusan', color: 'text-warning' },
  waiting_review: { label: 'Ditinjau Mark', color: 'text-primary' },
  interrupted: { label: 'Terputus', color: 'text-warning' },
  cancelled: { label: 'Dibatalkan', color: 'text-white/50' },
  running: { label: 'Berjalan', color: 'text-primary' },
  idle: { label: 'Siap', color: 'text-white/50' },
  completed: { label: 'Selesai', color: 'text-primary' },
  failed: { label: 'Gagal', color: 'text-error' },
  killed: { label: 'Dihentikan', color: 'text-white/50' }
}

export function agentStatus(status) {
  return agentStatuses[status] || { label: 'Tidak diketahui', color: 'text-white/50' }
}

export function agentDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Belum tercatat'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}
