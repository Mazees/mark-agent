import { useState, useEffect, useRef, useCallback } from 'react'
import { findSimilarMemoryClusters } from '../api/oramaStore'
import { runBatchConsolidation } from '../api/ai/memoryGroomer'
import { updateMemory, deleteMemory } from '../api/db'

// Shared in-memory event listener so any component using useMemoryGroomer stays in sync
const groomListeners = new Set()
let isAutoGroomScheduled = false

function notifyListeners(state) {
  groomListeners.forEach(listener => listener(state))
}

export function useMemoryGroomer(enableAutoOnStartup = false) {
  const [isGrooming, setIsGrooming] = useState(false)
  const [groomResult, setGroomResult] = useState(() => {
    try {
      const saved = localStorage.getItem('mark_last_groom_result')
      return saved ? JSON.parse(saved) : {
        timestamp: null,
        mergedCount: 0,
        deletedCount: 0,
        details: [],
        lastChecked: null
      }
    } catch {
      return {
        timestamp: null,
        mergedCount: 0,
        deletedCount: 0,
        details: [],
        lastChecked: null
      }
    }
  })

  const hasAutoGroomedRef = useRef(false)

  useEffect(() => {
    const listener = (nextState) => {
      if (nextState.isGrooming !== undefined) setIsGrooming(nextState.isGrooming)
      if (nextState.groomResult !== undefined) setGroomResult(nextState.groomResult)
    }
    groomListeners.add(listener)
    return () => groomListeners.delete(listener)
  }, [])

  const triggerGrooming = useCallback(async (force = false) => {
    if (isGrooming) return null
    setIsGrooming(true)
    notifyListeners({ isGrooming: true })

    try {
      console.log('[Hippocampus Engine] Memulai scan konsolidasi memori...')
      const clusters = await findSimilarMemoryClusters(0.60)

      if (!clusters || clusters.length === 0) {
        console.log('[Hippocampus Engine] Ingatan sudah bersih & terstruktur. Tidak ada cluster yang perlu digabung.')
        const currentRes = {
          ...groomResult,
          lastChecked: Date.now()
        }
        setGroomResult(currentRes)
        localStorage.setItem('mark_last_groom_result', JSON.stringify(currentRes))
        notifyListeners({ groomResult: currentRes, isGrooming: false })
        setIsGrooming(false)
        return currentRes
      }

      console.log(`[Hippocampus Engine] Ditemukan ${clusters.length} cluster. Mengirim ke LLM...`)
      const consolidations = await runBatchConsolidation(clusters)

      let mergedCount = 0
      let deletedCount = 0
      const details = []

      for (const item of consolidations) {
        const { keep_id, merged_text, delete_ids } = item
        if (!keep_id || !merged_text) continue

        try {
          // 1. Update memori utama dengan narasi kronologis yang sudah digabungkan
          await updateMemory(keep_id, merged_text)
          mergedCount++

          // 2. Hapus duplikat setelah merge sukses
          if (Array.isArray(delete_ids)) {
            for (const delId of delete_ids) {
              if (delId && delId !== keep_id) {
                await deleteMemory(delId)
                deletedCount++
              }
            }
          }

          details.push({
            keep_id,
            merged_text,
            delete_ids: delete_ids || []
          })
        } catch (err) {
          console.error(`[Hippocampus Engine] Gagal mengaplikasikan konsolidasi untuk id ${keep_id}:`, err)
        }
      }

      const updatedResult = {
        timestamp: Date.now(),
        lastChecked: Date.now(),
        mergedCount,
        deletedCount,
        details
      }

      setGroomResult(updatedResult)
      localStorage.setItem('mark_last_groom_result', JSON.stringify(updatedResult))
      notifyListeners({ groomResult: updatedResult, isGrooming: false })
      setIsGrooming(false)

      console.log(`[Hippocampus Engine] Selesai! ${mergedCount} ingatan dikonsolidasi kronologis, ${deletedCount} duplikat dihapus.`)
      return updatedResult
    } catch (err) {
      console.error('[Hippocampus Engine] Error selama proses grooming:', err)
      setIsGrooming(false)
      notifyListeners({ isGrooming: false })
      return null
    }
  }, [isGrooming, groomResult])

  const triggerGroomingRef = useRef(triggerGrooming)
  useEffect(() => {
    triggerGroomingRef.current = triggerGrooming
  }, [triggerGrooming])

  useEffect(() => {
    if (!enableAutoOnStartup || isAutoGroomScheduled) return
    isAutoGroomScheduled = true

    console.log('[Hippocampus Engine] Timer otomatis grooming dijadwalkan dalam 10 detik setelah startup...')
    setTimeout(() => {
      console.log('[Hippocampus Engine] Menjalankan automatic background memory grooming...')
      if (triggerGroomingRef.current) {
        triggerGroomingRef.current(false)
      }
    }, 10000)
  }, [enableAutoOnStartup])

  return {
    isGrooming,
    groomResult,
    triggerGrooming
  }
}
