export const APPROVAL_MODES = [
  {
    value: 'manual',
    label: 'Tanya pengguna',
    description: 'Minta izin sebelum mengubah berkas atau menjalankan tindakan.'
  },
  {
    value: 'smart',
    label: 'Tinjau Otomatis',
    description: 'Mark akan meninjau perizinan secara otomatis.'
  },
  {
    value: 'full',
    label: 'Akses penuh',
    description: 'Lewati izin rutin. Sesi Computer Use tetap meminta persetujuan.'
  }
]

export function validApprovalMode(value) {
  return APPROVAL_MODES.some((mode) => mode.value === value)
}
