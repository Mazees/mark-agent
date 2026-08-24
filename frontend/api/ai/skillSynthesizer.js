import { fetchAI, cleanAndParse } from './core'
import { saveLearnedSkill } from '../db'

/**
 * Dedicated Skill Synthesizer (MARK Meta-Learning Engine)
 * Dieksekusi secara khusus ketika Mark menyetel `should_learn: true` pada giliran terakhir.
 * Menghasilkan objek skill murni { name, description, content } dan menyimpannya ke Dexie.
 */
export async function synthesizeSkillAndSave({
  userPrompt = '',
  executedTools = [],
  finalAnswer = '',
  thought = ''
}) {
  try {
    if (!executedTools || executedTools.length === 0) {
      console.log('[Meta-Learner] Skip: Tidak ada tool yang dieksekusi.')
      return null
    }

    // Susun ringkasan riwayat aksi & tool yang berhasil
    const toolsTrajectory = executedTools
      .slice(0, 12)
      .map((t, idx) => {
        const toolName = t.tool || t.task || 'unknown_tool'
        const queryStr = t.query ? `\n   Query: ${JSON.stringify(t.query).slice(0, 200)}` : ''
        return `${idx + 1}. [Tool: ${toolName}]${queryStr}`
      })
      .join('\n')

    const promptText = `Berikut adalah sesi kerja Mark yang berhasil:

[PERMINTAAN USER]:
${userPrompt ? userPrompt.slice(0, 500) : '(Tidak ada teks permintaan)'}

[ANALISIS & LOGIKA (THOUGHT)]:
${thought ? thought.slice(0, 500) : '(Tidak ada thought)'}

[LANGKAH ALAT YANG SUKSES DIEKSEKUSI]:
${toolsTrajectory}

[HASIL / JAWABAN AKHIR]:
${finalAnswer ? finalAnswer.slice(0, 600) : '(Tidak ada jawaban akhir)'}

Tugasmu: Rumuskan alur kerja prosedural di atas menjadi berkas SKILL.md yang terstruktur dan dapat digunakan kembali.`

    const systemPrompt = `Kamu adalah MARK Meta-Learning Synthesizer Engine.
Tugasmu adalah menyaring alur kerja teknis yang baru saja BERHASIL diselesaikan oleh Mark menjadi sebuah PROSEDUR SKILL (.md) yang rapi, modular, dan dapat dieksekusi kembali secara otomatis oleh Mark di masa depan via 'read-skill'.

# ATURAN PENYUSUNAN SKILL:
1. "name": Buat nama skill dalam format kebab-case (huruf kecil, gunakan strip '-', contoh: "scrape-dynamic-table", "setup-wsl-node", "fix-powershell-policy").
2. "description": Tulis 1-2 kalimat ringkas menjelaskan kegunaan skill ini dan kapan Mark harus memanggilnya.
3. "content": Tulis isi panduan teknis langkah-demi-langkah dalam format Markdown:
   - Gambaran umum tujuan prosedur.
   - Langkah kerja berurutan (Sebutkan nama tool dan parameter query yang tepat).
   - Validasi hasil / pengujian.
   - Aturan khusus & hal yang harus dihindari (berdasarkan kendala yang sempat dialami).

# FORMAT OUTPUT JSON WAJIB:
{
  "name": "nama-skill-kebab-case",
  "description": "Deskripsi singkat dalam 1-2 kalimat",
  "content": "# Judul Panduan Prosedur\\n\\n## Gambaran Umum\\n...\\n\\n## Langkah-Langkah\\n1. ...\\n2. ...\\n\\n## Aturan & Validasi\\n- ..."
}`

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptText }
    ]

    const response = await fetchAI(messages, null, true, {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['name', 'description', 'content']
    })

    const parsed = cleanAndParse(response)
    if (!parsed || !parsed.name || !parsed.content) {
      console.warn('[Meta-Learner] Format respons synthesizer tidak valid:', response)
      return null
    }

    const savedSkill = await saveLearnedSkill({
      name: parsed.name,
      description: parsed.description || 'Prosedur teknis teruji buatan Mark',
      content: parsed.content
    })

    if (savedSkill) {
      console.log(`[Meta-Learner] ✨ Keahlian baru berhasil dipelajari & disimpan ke Dexie: /${savedSkill.name}`)
    }

    return savedSkill
  } catch (err) {
    console.error('[Meta-Learner] Error in synthesizeSkillAndSave:', err)
    return null
  }
}
