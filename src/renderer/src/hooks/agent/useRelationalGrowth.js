import { useEffect, useRef } from 'react'
import { getRelationship, saveRelationship, insertMemory } from '../../api/db'
import { evaluateTraitDrift } from '../../api/ai/relationship'

export const useRelationalGrowth = ({ chatData }) => {
  const lastEvalChatLenRef = useRef(0)

  // --- RELATIONAL GROWTH EVALUATION (Event-Based) ---
  useEffect(() => {
    const evaluateGrowth = async () => {
      try {
        const allCleanChats = chatData.filter(m => !m.isThinking && !m.isSearching && !m.isSummarizing)
        const currentCleanLen = allCleanChats.length

        // Initialize state dari database saat pertama kali jalan
        const oldTraits = await getRelationship('owner')
        const dbLastIndex = oldTraits.lastChatIndex ?? oldTraits.last_chat_index ?? 0

        if (lastEvalChatLenRef.current === 0) {
          // Jika belum pernah diset, set baseline awal
          lastEvalChatLenRef.current = dbLastIndex > 0 ? dbLastIndex : currentCleanLen
          if (dbLastIndex === 0 && currentCleanLen > 0) {
            await saveRelationship({
              userId: 'owner',
              ...oldTraits,
              lastChatIndex: currentCleanLen,
              last_chat_index: currentCleanLen
            })
          }
        }

        // Trigger evaluasi setiap selisih 15 pesan
        if (currentCleanLen - lastEvalChatLenRef.current >= 15) {
          console.log('[Relational Growth] Threshold 15 chat tercapai. Mengevaluasi mood...')

          // Batasi maksimal 20 pesan terbaru dan batasi panjang teks per pesan
          const startIndex = Math.max(lastEvalChatLenRef.current, currentCleanLen - 20)
          const recentForEval = allCleanChats
            .slice(startIndex)
            .map(m => {
              let timeStr = ''
              if (m.timestamp) {
                timeStr = typeof m.timestamp === 'number'
                  ? `[${new Date(m.timestamp).toLocaleString('id-ID')}] `
                  : `[${m.timestamp}] `
              }
              const rawContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
              const safeContent = rawContent.length > 500 ? `${rawContent.slice(0, 500)}... [dipotong]` : rawContent
              return `${timeStr}${m.role === 'user' ? 'User' : 'Mark'}: ${safeContent}`
            })
            .join('\n')

          // Simpan state panjang chat saat ini untuk evaluasi berikutnya
          lastEvalChatLenRef.current = currentCleanLen

          // Evaluasi AI
          const newTraits = await evaluateTraitDrift(oldTraits, recentForEval, 'owner')
          console.log('[Relational Growth] Trait shift:', newTraits)

          // Simpan trait baru ke database
          await saveRelationship({
            userId: 'owner',
            ...newTraits,
            lastEvaluation: new Date().toISOString(),
            evalCount: (oldTraits.evalCount || 0) + 1,
            lastChatIndex: currentCleanLen,
            last_chat_index: currentCleanLen
          })

          // Simpan relational memory jika AI merasa ada hal penting
          if (newTraits.new_relational_memory) {
            await insertMemory({
              type: 'notes',
              summary: '[Relational] Catatan hubungan otomatis',
              memory: newTraits.new_relational_memory
            })
            console.log('[Relational Growth] Relational memory tersimpan:', newTraits.new_relational_memory)
          }
        }
      } catch (err) {
        console.error('[Relational Growth] Gagal mengevaluasi hubungan:', err)
      }
    }

    evaluateGrowth()
  }, [chatData])
}
