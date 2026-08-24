/**
 * Workspace RAG & Working Memory Service (Renderer API)
 * Menghubungkan UI/Planning Engine dengan .mark/ Codebase Index & Scratchpad
 */

let lastIndexScanTime = {}

/**
 * Mengambil konteks RAG dan Working Memory aktif untuk disuntikkan ke System Prompt AI
 * @param {string} workspaceRoot Direktori root proyek aktif
 * @param {string} userInput Pesan / perintah dari pengguna
 * @returns {Promise<{ workingMemoryText: string, codeRagText: string }>}
 */
export async function getWorkspaceContext(workspaceRoot, userInput) {
  if (!workspaceRoot || typeof window === 'undefined' || !window.api?.workspaceQuery) {
    return { workingMemoryText: '', codeRagText: '' }
  }

  try {
    // 1. Pastikan folder .mark ada
    await window.api.workspaceEnsure(workspaceRoot)

    // 2. Trigger scan inkremental jika sudah lebih dari 60 detik sejak scan terakhir
    const now = Date.now()
    if (!lastIndexScanTime[workspaceRoot] || now - lastIndexScanTime[workspaceRoot] > 60000) {
      lastIndexScanTime[workspaceRoot] = now
      // Jalankan background tanpa memblokir
      window.api.workspaceIndex(workspaceRoot).catch(() => {})
    }

    // 3. Baca Working Memory
    const workingMemory = await window.api.workspaceGetMemory(workspaceRoot)
    let workingMemoryText = ''
    if (workingMemory && (workingMemory.notes || workingMemory.activeObjective)) {
      const parts = []
      if (workingMemory.activeObjective) parts.push(`- Target/Tujuan Aktif: ${workingMemory.activeObjective}`)
      if (workingMemory.recentFiles && workingMemory.recentFiles.length > 0) {
        parts.push(`- Berkas yang Baru Dimodifikasi: ${workingMemory.recentFiles.join(', ')}`)
      }
      if (workingMemory.notes) parts.push(`- Catatan Konteks: ${workingMemory.notes}`)
      workingMemoryText = parts.join('\n')
    }

    // 4. Query Codebase RAG jika ada input user
    let codeRagText = ''
    if (userInput && userInput.trim().length > 3) {
      const chunks = await window.api.workspaceQuery(workspaceRoot, userInput, 4)
      if (chunks && chunks.length > 0) {
        codeRagText = chunks
          .map(
            (c, idx) =>
              `[KODE RELEVAN #${idx + 1} (${c.filePath})]:\n\`\`\`\n${c.content}\n\`\`\``
          )
          .join('\n\n')
      }
    }

    return { workingMemoryText, codeRagText }
  } catch (err) {
    console.warn('[WorkspaceRAG] Gagal mengambil workspace context:', err.message)
    return { workingMemoryText: '', codeRagText: '' }
  }
}

/**
 * Menyimpan pembaruan Working Memory ke .mark/working-memory.json
 */
export async function saveWorkspaceWorkingMemory(workspaceRoot, data) {
  if (!workspaceRoot || !window.api?.workspaceSaveMemory) return false
  try {
    return await window.api.workspaceSaveMemory(workspaceRoot, data)
  } catch (err) {
    console.warn('[WorkspaceRAG] Gagal menyimpan working memory:', err.message)
    return false
  }
}
