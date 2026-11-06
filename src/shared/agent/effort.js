export const DEFAULT_EFFORT = 'high'
export const EFFORT_LEVELS = [
  {
    value: 'low',
    label: 'Low',
    description: 'Langsung ke sasaran, dengan pemeriksaan hasil yang terarah.'
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Telusuri bagian terkait dan periksa alur utama.'
  },
  {
    value: 'high',
    label: 'High',
    description: 'Selesaikan penyebab masalah dan periksa alur yang terdampak.'
  },
  {
    value: 'ultra',
    label: 'Ultra',
    description: 'Selidiki masalah kompleks, risiko, dan kasus tepi yang relevan.'
  }
]
export const validEffort = (value) => EFFORT_LEVELS.some((level) => level.value === value)
export function resolveEffort(value) {
  if (value == null) return DEFAULT_EFFORT
  if (!validEffort(value)) throw new Error('Effort harus Low, Medium, High, atau Ultra.')
  return value
}

export function parseEffortCommand(input) {
  if (typeof input !== 'string') return { text: input, effortLevel: null, matched: false }
  const match = input.match(
    /^\s*\/(?:(effort)\b(?:[ \t]+(low|medium|high|ultra)\b)?|(?:super|boost)\b)[ \t]*/i
  )
  if (!match) return { text: input, effortLevel: null, matched: false }
  return {
    text: input.slice(match[0].length).trim(),
    effortLevel: match[2]?.toLowerCase() || 'ultra',
    matched: true
  }
}

const guidance = {
  low: 'Langsung menuju sasaran. Baca konteks yang diperlukan dan lakukan perubahan terkecil yang memenuhi permintaan. Periksa hasil tindakan secara terarah; jangan memaksakan build penuh untuk perubahan sederhana.',
  medium:
    'Telusuri bagian terkait dan hubungan langsungnya. Selesaikan pekerjaan, lalu periksa alur utama dan bagian yang diubah.',
  high: 'Pahami alur yang terdampak dan selesaikan penyebab masalah. Periksa hasil dari awal sampai akhir sesuai kebutuhan tugas, termasuk regresi yang masuk akal pada fungsi terkait.',
  ultra:
    'Untuk pekerjaan kompleks, selidiki akar masalah, bandingkan pendekatan bila diperlukan, dan periksa risiko serta kasus tepi yang relevan. Peninjauan tambahan harus memiliki tujuan konkret; jangan memperluas pekerjaan hanya untuk menambah kedalaman.'
}
export function buildEffortPrompt(value) {
  const level = resolveEffort(value)
  return `# EFFORT: ${level.toUpperCase()}
${guidance[level]}
Semua tingkat wajib menuntaskan permintaan yang diizinkan dan melaporkan hasil nyata. Low bukan hasil setengah jadi; Ultra bukan kewajiban melakukan lebih banyak aksi.
Pahami sasaran, lakukan tindakan, periksa hasil, lalu perbaiki berdasarkan temuan baru. Gunakan observasi yang sudah dikembalikan tool. Klik browser diperiksa melalui halaman yang sama, bukan dengan menelusuri source code proyek. Berkas teks/dokumen diperiksa sesuai isinya; tidak wajib build aplikasi.
Jangan mengulang tool, pemeriksaan, atau perbaikan tanpa perubahan keadaan atau bukti baru. Jika terhambat izin, informasi, atau layanan, jelaskan kendala konkret tanpa mengakali penolakan. Bedakan aksi berhasil dijalankan, hasil pemeriksaan, dan tujuan tercapai.
Effort tidak mengubah perizinan, model, reasoning provider, panjang jawaban, atau lingkup permintaan. Jika pengguna meminta rencana saja, jangan mengeksekusi pekerjaan. Workflow mengikuti kebutuhan tugas; Minibot hanya untuk bagian yang bisa dikerjakan bersamaan, tanpa kewajiban delegasi pada tingkat apa pun.`
}
