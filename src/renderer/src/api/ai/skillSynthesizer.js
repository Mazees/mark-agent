import { pendingVerification } from '@shared/agent/execution-quality.js'
import { fetchAI, cleanAndParse } from './core'
import { saveLearnedSkill, getAllLearnedSkills } from '../db'

/**
 * Filter apakah eksekusi tools layak untuk disintesis menjadi sebuah skill.
 * Mencegah membuat skill sampah untuk aksi trivial/sederhana (misal cuma read-file 1x atau search biasa).
 */
function isWorthLearning(executedTools = []) {
  if (!executedTools || executedTools.length === 0) return false

  const toolNames = executedTools
    .filter((t) => t && !t.type && t.status === 'done' && (t.tool || t.task))
    .map((t) => t.tool || t.task || '')

  // Abaikan jika hanya memanggil read-skill atau hanya 1 tool sepele
  const trivialSingleTools = [
    'read-skill',
    'read-tools',
    'read-memory',
    'camera-look',
    'analyze-screen'
  ]
  const nonTrivialTools = toolNames.filter((name) => !trivialSingleTools.includes(name))

  if (nonTrivialTools.length === 0) return false

  // Layak jika:
  // 1. Mengeksekusi >= 2 langkah tool yang saling berkaitan, ATAU
  // 2. Mengeksekusi tool kompleks/high-impact (seperti run-powershell, replace-content, git-commit, browser multi-step, subagent)
  const highImpactTools = [
    'run-powershell',
    'replace-content',
    'replace-lines',
    'write-file',
    'spawn_subagent',
    'git-commit'
  ]
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
  finalAnswer = ''
}) {
  try {
    if (
      !isWorthLearning(executedTools) ||
      pendingVerification(executedTools) ||
      executedTools.filter((t) => t.tool).at(-1)?.status !== 'done'
    ) {
      return null
    }

    const existingSkills = await getAllLearnedSkills()
    const existingListStr =
      existingSkills.length > 0
        ? existingSkills.map((s) => `- ${s.name}: ${s.description}\n${s.content || ''}`).join('\n')
        : '(Belum ada skill terdaftar)'

    const toolsTrajectory = executedTools
      .filter((t) => t?.tool)
      .map((t, index) => ({
        step: index + 1,
        tool: t.tool,
        status: t.status,
        query: t.query,
        result: t.fullResult || t.resultSummary || ''
      }))
    const promptText = JSON.stringify({
      request: userPrompt,
      observations: toolsTrajectory,
      answer: finalAnswer,
      existingSkills: existingListStr
    })
    const systemPrompt = `Evaluasi apakah rekaman pekerjaan mempunyai prosedur yang layak disimpan.
Gunakan hasil tool dan statusnya sebagai bukti. Jawaban akhir bukan bukti mandiri keberhasilan.
Aksi berhasil dijalankan belum membuktikan tujuan tercapai. Jangan menyebut prosedur teruji jika observasi tidak membuktikannya.
Kegagalan dan penolakan tidak boleh diajarkan sebagai langkah sukses. Jika hasil tidak jelas, tugas terhambat, atau bukti kurang, set should_save=false.
Simpan hanya prosedur yang berguna untuk pekerjaan berulang. Jangan mengabadikan koordinat, ID elemen sementara, token, atau kondisi halaman tertentu.
Nama kebab-case. Konten berisi tujuan, prasyarat, langkah berdasarkan bukti, pemeriksaan hasil, dan batas penerapan.
Jika memperbarui nama yang sudah ada, pertahankan informasi lama yang masih benar dan ubah hanya berdasarkan bukti baru.
Kembalikan JSON {should_save:boolean,name:string,description:string,content:string}, tanpa teks lain.`

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptText }
    ]

    const response = await fetchAI(messages, false, {
      isSmallTask: true,
      jsonSchema: {
        type: 'object',
        properties: {
          should_save: { type: 'boolean' },
          name: { type: 'string' },
          description: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['should_save', 'name', 'description', 'content']
      }
    })

    const parsed = cleanAndParse(response)
    if (!parsed || parsed.should_save !== true || !parsed.name || !parsed.content) {
      return null
    }

    const savedSkill = await saveLearnedSkill({
      name: parsed.name.toLowerCase().trim(),
      description: parsed.description || 'Prosedur kerja yang dipelajari Mark',
      content: parsed.content
    })

    if (savedSkill) {
      console.log(`[Meta-Learner] Keahlian disimpan di database: /${savedSkill.name}`)
    }

    return savedSkill
  } catch (err) {
    console.error('[Meta-Learner] Error in synthesizeSkillAndSave:', err)
    return null
  }
}
