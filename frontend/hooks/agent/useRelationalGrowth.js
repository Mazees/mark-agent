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
        if (lastEvalChatLenRef.current === 0) {
          lastEvalChatLenRef.current = oldTraits.lastChatIndex || 0
        }

        // Trigger evaluasi setiap selisih 15 pesan
        if (currentCleanLen - lastEvalChatLenRef.current >= 15) {
          console.log('[Relational Growth] Threshold 15 chat tercapai. Mengevaluasi mood...')
          
          const recentForEval = allCleanChats
            .slice(lastEvalChatLenRef.current)
            .map(m => {
              let timeStr = ''
              if (m.timestamp) {
                timeStr = typeof m.timestamp === 'number' 
                  ? `[${new Date(m.timestamp).toLocaleString('id-ID')}] ` 
                  : `[${m.timestamp}] `
              }
              return `${timeStr}${m.role === 'user' ? 'User' : 'Mark'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
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
            lastChatIndex: currentCleanLen
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
