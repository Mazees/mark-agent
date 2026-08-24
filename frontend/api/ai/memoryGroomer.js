import { fetchAI, cleanAndParse } from './core'

const groomerSchema = {
  name: "memory_consolidation_result",
  schema: {
    type: "object",
    properties: {
      consolidations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            keep_id: { type: "number" },
            merged_text: { type: "string" },
            delete_ids: {
              type: "array",
              items: { type: "number" }
            }
          },
          required: ["keep_id", "merged_text", "delete_ids"],
          additionalProperties: false
        }
      }
    },
    required: ["consolidations"],
    additionalProperties: false
  }
}

export function buildGroomerPrompt(clusters) {
  const payload = JSON.stringify(clusters, null, 2)
  return `Kamu adalah Mark Hippocampus Engine — mesin konsolidasi memori otonom.
Tugasmu adalah memeriksa kelompok-kelompok (clusters) ingatan tentang user yang mirip atau memiliki kesinambungan kronologis, lalu mengonsolidasi setiap cluster menjadi SATU kalimat yang utuh dan runtut secara kronologis.

# ATURAN EMAS (THE GOLDEN RULE - MERGE THEN PRUNE):
1. JANGAN PERNAH menghapus sejarah masa lalu! Jika ada memori lama "User bekerja pakai Laptop A" dan memori baru "User sekarang pakai PC RTX 4090", gabungkan menjadi cerita kronologis: "User saat ini menggunakan PC RTX 4090 (perangkat utama), setelah sebelumnya menggunakan Laptop A."
2. Untuk setiap cluster:
   - Pilih SATU id memori sebagai "keep_id" (pilih ID dari memori yang paling baru atau paling lengkap representasinya).
   - Tulis kalimat gabungan yang merangkum SELURUH fakta dalam cluster di "merged_text".
   - Masukkan SEMUA id memori lainnya di cluster tersebut ke dalam array "delete_ids".
3. Pastikan tidak ada informasi penting atau sejarah perjuangan user yang hilang dalam "merged_text".

# DATA CLUSTER MEMORI:
${payload}

# FORMAT RESPONS:
Wajib kembalikan HANYA objek JSON dengan skema:
{
  "consolidations": [
    {
      "keep_id": 120,
      "merged_text": "User saat ini menggunakan PC RTX 4090 setelah sebelumnya menggunakan Laptop A.",
      "delete_ids": [91]
    }
  ]
}`
}

export function parseGroomerResponse(rawResponse) {
  if (!rawResponse) return []
  try {
    const parsed = cleanAndParse(typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse))
    if (parsed && Array.isArray(parsed.consolidations)) {
      return parsed.consolidations.map(c => ({
        keep_id: Number(c.keep_id),
        merged_text: String(c.merged_text || '').trim(),
        delete_ids: Array.isArray(c.delete_ids) ? c.delete_ids.map(id => Number(id)) : []
      })).filter(c => !isNaN(c.keep_id) && c.merged_text.length > 0)
    }
  } catch (err) {
    console.error('[Groomer] Gagal memvalidasi/parse respons Groomer:', err)
  }
  return []
}

export async function runBatchConsolidation(clusters) {
  if (!clusters || clusters.length === 0) return []

  const prompt = buildGroomerPrompt(clusters)
  const messages = [
    {
      role: 'system',
      content: prompt
    }
  ]

  try {
    console.log(`[Groomer] Mengirim ${clusters.length} cluster ke LLM untuk konsolidasi...`)
    const res = await fetchAI(messages, null, false, groomerSchema)
    if (!res) return []
    const results = parseGroomerResponse(res)
    console.log(`[Groomer] Berhasil menerima ${results.length} hasil konsolidasi dari LLM.`)
    return results
  } catch (err) {
    console.error('[Groomer] Gagal menjalankan runBatchConsolidation:', err)
    return []
  }
}
