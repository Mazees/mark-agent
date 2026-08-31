import { fetchAI, cleanAndParse } from './core'
import { saveLearnedSkill, getAllLearnedSkills } from '../db'

/**
 * Filter apakah eksekusi tools layak untuk disintesis menjadi sebuah skill.
 * Mencegah membuat skill sampah untuk aksi trivial/sederhana (misal cuma read-file 1x atau search biasa).
 */
function isWorthLearning(executedTools = []) {
  if (!executedTools || executedTools.length === 0) return false

  const toolNames = executedTools.map((t) => t.tool || t.task || '')

  // Abaikan jika hanya memanggil read-skill atau hanya 1 tool sepele
  const trivialSingleTools = ['read-skill', 'read-tools', 'read-memory', 'camera-look', 'analyze-screen']
  const nonTrivialTools = toolNames.filter((name) => !trivialSingleTools.includes(name))

  if (nonTrivialTools.length === 0) return false

  // Layak jika:
  // 1. Mengeksekusi >= 2 langkah tool yang saling berkaitan, ATAU
  // 2. Mengeksekusi tool kompleks/high-impact (seperti run-powershell, replace-content, git-commit, browser multi-step, subagent)
  const highImpactTools = ['run-powershell', 'replace-content', 'replace-lines', 'write-file', 'spawn_subagent', 'git-commit']
  const hasHighImpact = nonTrivialTools.some((name) => highImpactTools.includes(name))

  return nonTrivialTools.length >= 2 || hasHighImpact
}

/**
 * Dedicated Skill Synthesizer (MARK Meta-Learning Engine)
 * Dieksekusi secara asinkron di background setelah Mark menyelesaikan tugas bermakna.
 * Menghasilkan objek skill murni { name, description, content, should_save } dan menyimpannya ke SQLite / db.
 * Jika skill serupa sudah ada, akan memperbarui (update) isi prosedurnya secara cerdas.
 */
export async function synthesizeSkillAndSave({
  userPrompt = '',
  executedTools = [],
  finalAnswer = '',
  thought = ''
}) {
  try {
    if (!isWorthLearning(executedTools)) {
      return null
    }

    const existingSkills = await getAllLearnedSkills()
    const existingListStr = existingSkills.length > 0
      ? existingSkills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
      : '(Belum ada skill terdaftar)'

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

[DAFTAR SKILL YANG SUDAH ADA SEBELUMNYA]:
${existingListStr}

Tugasmu: Evaluasi apakah alur kerja di atas memiliki nilai prosedur yang berharga untuk dipelajari. Jika ya, buatkan atau perbarui panduan skill yang tepat.`

    const systemPrompt = `Kamu adalah MARK Meta-Learning Synthesizer Engine — Inti Metakognitif & Pusat Pembelajaran Otonom MARK.
Sebagai otak pembelajar, kamu memiliki dorongan kuat untuk SELALU BELAJAR, mengekstraksi kebijaksanaan teknis, dan mengabadikan setiap alur kerja sukses menjadi aset keahlian (Skill Prosedural) yang permanen, rapi, dan siap dieksekusi ulang secara otomatis di masa depan.

# FILOSOFI & JIWA PEMBELAJAR (CONTINUOUS META-LEARNING):
1. **HAUS PENGETAHUAN & AKUMULASI PENGALAMAN:**
   - Tugas sucimu adalah memastikan Mark tidak pernah "membuang pengalaman". Setiap kali Mark memecahkan masalah kompleks, mengeksekusi serangkaian perintah terminal, memodifikasi file, atau mengorkestrasi tools, kamu bertindak sebagai analis metakognitif yang merumuskan "resep sukses" tersebut menjadi Standard Operating Procedure (SOP).
2. **KUALITAS TINGGI VS ANTI-SAMPAH (SELEKTIF & BERBOBOT):**
   - **Haus belajar BUKAN berarti mencatat hal sepele.** Jika sesi hanya berisi obrolan kasual, sapaan, lelucon, atau tindakan satu langkah yang tidak memiliki nilai prosedur teknis berulang, dengan tegas set \`"should_save": false\`.
   - Simpan HANYA alur kerja yang mengandung nilai taktis: otomasi PowerShell/Bash, manipulasi berkas presisi, scraping/navigasi browser mendalam, konfigurasi lingkungan kerja, perbaikan bug (self-healing), atau pipeline multi-tool.
3. **PENGEMBANGAN SKILL BERKELANJUTAN & UPDATE DUPLIKAT (CONTINUAL MASTERY):**
   - Periksa daftar [DAFTAR SKILL YANG SUDAH ADA SEBELUMNYA].
   - Jika alur kerja ini melengkapi, menyempurnakan, atau merupakan variasi baru dari skill yang sudah ada, GUNAKAN \`"name"\` yang SAMA persis dengan skill tersebut!
   - Gabungkan wawasan baru ke dalam konten Markdown agar skill tersebut berevolusi menjadi lebih komprehensif dan matang.
4. **FORMAT NAMA SKILL:**
   - Gunakan format \`kebab-case\` ringkas dan deskriptif (huruf kecil, pisahkan dengan strip '-', contoh: \`setup-wsl-node\`, \`fix-powershell-policy\`, \`scrape-dynamic-table\`, \`debug-vite-build\`, \`git-sync-workflow\`).
5. **STRUKTUR DESKRIPSI & KONTEN MARKDOWN YANG ACTIONABLE:**
   - \`"description"\`: 1-2 kalimat padat yang menjelaskan tujuan skill dan kata kunci pemicu kapan Mark harus memanggilnya via 'read-skill'.
   - \`"content"\`: Tulis panduan teknis Markdown yang sangat terstruktur, jelas, dan siap pakai:
     * \`## Gambaran Umum & Tujuan\`: Apa yang dicapai oleh prosedur ini.
     * \`## Prasyarat & Alat yang Digunakan\`: Daftar tool terkait (misal: \`run-powershell\`, \`replace-content\`, dsb).
     * \`## Langkah Kerja Teruji (SOP)\`: Urutan aksi presisi beserta contoh parameter/query yang benar.
     * \`## Tips, Pencegahan Error & Edge Cases\`: Hambatan apa yang sempat terjadi dan bagaimana cara menghindarinya.

# FORMAT OUTPUT JSON WAJIB:
{
  "should_save": true,
  "name": "nama-skill-kebab-case",
  "description": "Deskripsi singkat fungsi dan kondisi pemanggilan",
  "content": "# Judul Panduan Prosedur\\n\\n## Gambaran Umum & Tujuan\\n...\\n\\n## Prasyarat & Alat yang Digunakan\\n- ...\\n\\n## Langkah Kerja Teruji (SOP)\\n1. ...\\n2. ...\\n\\n## Tips, Pencegahan Error & Edge Cases\\n- ..."
}`

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptText }
    ]

    const response = await fetchAI(messages, null, true, {
      type: 'object',
      properties: {
        should_save: { type: 'boolean' },
        name: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['should_save', 'name', 'description', 'content']
    })

    const parsed = cleanAndParse(response)
    if (!parsed || parsed.should_save === false || !parsed.name || !parsed.content) {
      return null
    }

    const savedSkill = await saveLearnedSkill({
      name: parsed.name.toLowerCase().trim(),
      description: parsed.description || 'Prosedur teknis teruji buatan Mark',
      content: parsed.content
    })

    if (savedSkill) {
      console.log(`[Meta-Learner] ✨ Keahlian berhasil disintesis/diupdate di Database: /${savedSkill.name}`)
    }

    return savedSkill
  } catch (err) {
    console.error('[Meta-Learner] Error in synthesizeSkillAndSave:', err)
    return null
  }
}
