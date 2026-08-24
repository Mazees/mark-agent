import { getBestMusicMatch } from '../../api/ai/tools'
import { extractYouTubeVideoId } from '../../contexts/YoutubeMusicContext'

export const useMarkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playUrl, nextTrack, prevTrack, playPause } = youtubeMusicTools

  const handleMusic = async (action, query, customSetChatData) => {
    const targetSet = customSetChatData || setChatData
    const cleanQuery = (query || '').trim()

    if (action === 'music-next') {
      nextTrack()
      return 'Memutar lagu selanjutnya.'
    }
    if (action === 'music-prev') {
      prevTrack()
      return 'Memutar lagu sebelumnya.'
    }
    if (action === 'music-toggle') {
      playPause()
      return 'Pause/Resume lagu.'
    }

    // Jika query adalah URL YouTube langsung atau Video ID 11 karakter
    const directVideoId = extractYouTubeVideoId(cleanQuery)
    if (directVideoId && (cleanQuery.includes('http') || /^[a-zA-Z0-9_-]{11}$/.test(cleanQuery))) {
      playUrl(directVideoId, { title: 'YouTube Video', artist: 'YouTube', id: directVideoId, videoId: directVideoId })
      return `[SYSTEM LOG] Berhasil memutar video YouTube (ID: ${directVideoId})`
    }

    targetSet((prev) => [...prev, { role: 'ai', content: 'Mencari lagu...', isSearchingMusic: true }])

    let music = []
    try {
      const res = await window.api.searchMusic(cleanQuery)
      if (Array.isArray(res)) {
        music = res
      } else if (res && Array.isArray(res.data)) {
        music = res.data
      }
    } catch (err) {
      console.warn('[useMarkMusic] Error searching music:', err)
      music = []
    }

    const isAutoplay = action === 'music-play'

    if (music.length === 0) {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
      return `[SYSTEM LOG] Tidak ditemukan hasil lagu untuk "${cleanQuery}". Silakan coba dengan judul atau nama artis yang lebih spesifik.`
    }

    let selectedMusicList = [...music]
    let selectedId = music[0]?.id || music[0]?.videoId

    if (isAutoplay && music.length > 1) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        { role: 'ai', content: 'Menganalisis versi lagu terbaik...', isSearchingMusic: true }
      ])

      try {
        const bestMatch = await getBestMusicMatch(cleanQuery, music.slice(0, 10), abortControllerRef.current?.signal)
        if (bestMatch && bestMatch.selectedId) {
          const found = music.find((m) => (m.id || m.videoId) === bestMatch.selectedId)
          if (found) {
            selectedId = bestMatch.selectedId
            selectedMusicList = [found]
          }
        }
      } catch (_) {}
    }

    targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))

    if (!isAutoplay) {
      targetSet((prev) => [
        ...prev,
        {
          role: 'ai',
          content: `Hasil Pencarian Lagu untuk "${cleanQuery}":\n${music.map((item, idx) => `${idx + 1}. ${item.title} - ${item.artist}`).join('\n')}`,
          isMusic: true,
          isMusicAutoplay: false,
          musicQuery: cleanQuery,
          musicList: [...music]
        }
      ])
    }

    if (isAutoplay && selectedId) {
      const trackToPlay = selectedMusicList[0] || music[0]
      playUrl(selectedId, trackToPlay)
      return `[SYSTEM LOG] Berhasil memutar lagu: ${trackToPlay.title} oleh ${trackToPlay.artist}`
    }

    const resultText = music.slice(0, 5).map((m) => `${m.title} oleh ${m.artist}`).join(', ')
    return `[SYSTEM LOG] Hasil pencarian lagu untuk "${cleanQuery}": ${resultText}`
  }

  return { handleMusic }
}
