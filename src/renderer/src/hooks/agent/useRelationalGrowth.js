import { useEffect, useRef } from 'react'
import { getRelationship, saveRelationship, insertMemory, normalizeDbId } from '../../api/db'
import { evaluateTraitDrift } from '../../api/ai/relationship'

export const useRelationalGrowth = ({
  chatData,
  currentActiveSessionId = '1',
  isLoading = false
}) => {
  const lastEvalChatLenRef = useRef(0)

  // --- RELATIONAL GROWTH EVALUATION (Event-Based) ---
  useEffect(() => {
    // Evaluasi hubungan emosi HANYA dilakukan di sesi utama ('1') dan saat turn chat selesai (tidak sedang loading)
    if (normalizeDbId(currentActiveSessionId) !== '1' || isLoading) {
      return
    }

    const evaluateGrowth = async () => {
      try {
        const allCleanChats = (chatData || []).filter(
          (m) => !m.isThinking && !m.isSearching && !m.isSummarizing
        )
        const currentCleanLen = allCleanChats.length
        if (currentCleanLen === 0) return

        // Initialize state dari database saat pertama kali jalan
        const oldTraits = await getRelationship('owner')
        const dbLastIndex = oldTraits.lastChatIndex ?? oldTraits.last_chat_index ?? 0

        if (lastEvalChatLenRef.current === 0) {
          // Jika dbLastIndex belum diset (0) atau melebihi jumlah chat saat ini (karena prune/archive),
          // set baseline awal ke currentCleanLen saat ini
          if (dbLastIndex === 0 || dbLastIndex > currentCleanLen) {
            lastEvalChatLenRef.current = currentCleanLen
            await saveRelationship({
              userId: 'owner',
              ...oldTraits,
              lastChatIndex: currentCleanLen,
              last_chat_index: currentCleanLen
            })
          } else {
            lastEvalChatLenRef.current = dbLastIndex
          }
        }

        // Jika chat pernah dibersihkan/dipangkas sehingga lebih kecil dari baseline sebelumnya
        if (currentCleanLen < lastEvalChatLenRef.current) {
          lastEvalChatLenRef.current = currentCleanLen
          await saveRelationship({
            userId: 'owner',
            ...oldTraits,
            lastChatIndex: currentCleanLen,
            last_chat_index: currentCleanLen
          })
          return
        }

        // Trigger evaluasi setiap selisih 15 pesan
        if (currentCleanLen - lastEvalChatLenRef.current >= 15) {
          console.log(
            '[Relational Growth] Threshold 15 chat tercapai di sesi utama. Mengevaluasi mood...'
          )

          // Batasi maksimal 20 pesan terbaru dan batasi panjang teks per pesan
          const startIndex = Math.max(lastEvalChatLenRef.current, currentCleanLen - 20)
          const recentForEval = allCleanChats
            .slice(startIndex)
            .map((m) => {
              let timeStr = ''
              if (m.timestamp) {
                timeStr =
                  typeof m.timestamp === 'number'
                    ? `[${new Date(m.timestamp).toLocaleString('id-ID')}] `
                    : `[${m.timestamp}] `
              }
              const rawContent =
                typeof m.content === 'string'
                  ? m.content
                  : m.content
                    ? JSON.stringify(m.content)
                    : ''
              const safeContent =
                rawContent.length > 500 ? `${rawContent.slice(0, 500)}... [dipotong]` : rawContent
              return `${timeStr}${m.role === 'user' ? 'User' : 'Mark'}: ${safeContent}`
            })
            .join('\n')

          // Simpan state panjang chat saat ini untuk evaluasi berikutnya
          lastEvalChatLenRef.current = currentCleanLen

          // Evaluasi AI
          const newTraits = await evaluateTraitDrift(oldTraits, recentForEval, 'owner')
          console.log('[Relational Growth] Trait shift:', newTraits)

          // Simpan trait baru ke database
          const updatedRecord = {
            userId: 'owner',
            ...newTraits,
            lastEvaluation: new Date().toISOString(),
            evalCount: (oldTraits.evalCount || 0) + 1,
            lastChatIndex: currentCleanLen,
            last_chat_index: currentCleanLen
          }
          await saveRelationship(updatedRecord)

          window.dispatchEvent(
            new CustomEvent('relationship-updated', {
              detail: updatedRecord
            })
          )

          // Simpan relational memory jika AI merasa ada hal penting
          if (newTraits.new_relational_memory) {
            await insertMemory({
              type: 'notes',
              summary: '[Relational] Catatan hubungan otomatis',
              memory: newTraits.new_relational_memory
            })
            console.log(
              '[Relational Growth] Relational memory tersimpan:',
              newTraits.new_relational_memory
            )
          }
        }
      } catch (err) {
        console.error('[Relational Growth] Gagal mengevaluasi hubungan:', err)
      }
    }

    evaluateGrowth()
  }, [chatData, currentActiveSessionId, isLoading])

  // Listener untuk evaluasi relasi berbasis event (misal dari Private Journal / akhir sesi)
  useEffect(() => {
    const handleForceRelationalEval = async (e) => {
      try {
        const oldTraits = await getRelationship('owner')
        const contextText =
          e.detail?.summary || 'Sesi kerja panjang dan refleksi batin harian bersama pengguna.'
        const newTraits = await evaluateTraitDrift(oldTraits, contextText, 'owner')
        const updatedRecord = {
          userId: 'owner',
          ...newTraits,
          lastEvaluation: new Date().toISOString(),
          evalCount: (oldTraits.evalCount || 0) + 1
        }
        await saveRelationship(updatedRecord)
        window.dispatchEvent(
          new CustomEvent('relationship-updated', {
            detail: updatedRecord
          })
        )
        if (newTraits.new_relational_memory) {
          await insertMemory({
            type: 'notes',
            summary: '[Relational] Catatan hubungan otomatis',
            memory: newTraits.new_relational_memory
          })
        }
      } catch (err) {
        console.warn('[Relational Growth] Gagal evaluasi relasi dari event:', err)
      }
    }
    window.addEventListener('mark:evaluate-relationship', handleForceRelationalEval)
    return () => window.removeEventListener('mark:evaluate-relationship', handleForceRelationalEval)
  }, [])

  // --- TACTILE INTERACTION DRIFT (Touch, Pet, Bonk) ---
  useEffect(() => {
    const handleTactile = async (e) => {
      const type = e.detail?.type
      if (!type) return
      try {
        const current = await getRelationship('owner')
        let { warmth = 0.5, trust = 0.5, sarcasm_level = 0.5 } = current || {}
        if (type === 'petting' || type === 'pet_purr') {
          warmth = Math.min(1.0, warmth + 0.005)
          trust = Math.min(1.0, trust + 0.005)
        } else if (type === 'bonk_annoyed') {
          sarcasm_level = Math.min(1.0, sarcasm_level + 0.005)
        } else if (type === 'bonk_dizzy' || type === 'shield_block') {
          sarcasm_level = Math.min(1.0, sarcasm_level + 0.01)
          trust = Math.max(0.15, trust - 0.005)
        }
        const updatedRecord = {
          ...current,
          userId: 'owner',
          warmth,
          trust,
          sarcasm_level,
          lastEvaluation: new Date().toISOString()
        }
        await saveRelationship(updatedRecord)
        window.dispatchEvent(new CustomEvent('relationship-updated', { detail: updatedRecord }))
      } catch (_) {}
    }
    window.addEventListener('mark-tactile-interaction', handleTactile)
    return () => window.removeEventListener('mark-tactile-interaction', handleTactile)
  }, [])
}
