import { getBestMusicMatch } from '../../api/ai/tools'

export const useMarkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playTrack, playUrl, nextTrack, prevTrack, playPause } = youtubeMusicTools

  const handleMusic = async (action, query, customSetChatData) => {
    const targetSet = customSetChatData || setChatData
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

    targetSet((prev) => [...prev, { role: 'ai', content: 'Mencari lagu...', isSearchingMusic: true }])
    const searchQuery = (query || '').trim() || 'Lagu Indonesia Pop Hits Santai'
    const music = await window.api.searchMusic(searchQuery)
    const isAutoplay = action === 'music-play'

    let selectedMusicList = [...music]
    let selectedTrack = music[0]

    if (isAutoplay && music.length > 0) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        { role: 'ai', content: 'Menganalisis versi lagu terbaik...', isSearchingMusic: true }
      ])

      const bestMatch = await getBestMusicMatch(searchQuery, music.slice(0, 10), abortControllerRef.current?.signal)
      if (bestMatch && bestMatch.selectedId) {
        const found = music.find((m) => (m.videoId || m.id) === bestMatch.selectedId)
        if (found) {
          selectedTrack = found
          selectedMusicList = [found]
        }
      }
    }

    if (!isAutoplay) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        {
          role: 'ai',
          content: `Hasil Pencarian Lagu untuk "${searchQuery}": \n ${music.map((item) => item.title).join('\n')}`,
          isMusic: true,
          isMusicAutoplay: false,
          musicQuery: searchQuery,
          musicList: [...music]
        }
      ])
    } else {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
    }

    if (isAutoplay && selectedTrack) {
      if (typeof playTrack === 'function') {
        playTrack(selectedTrack, music)
      } else {
        playUrl(selectedTrack.url || `https://www.youtube.com/watch?v=${selectedTrack.videoId || selectedTrack.id}`, selectedTrack)
      }
      return `[SYSTEM LOG] Berhasil memutar lagu: ${selectedTrack.title} oleh ${selectedTrack.artist || selectedTrack.author}`
    }

    const resultText = music.slice(0, 5).map((m) => `${m.title} oleh ${m.artist || m.author}`).join(', ')
    return `[SYSTEM LOG] Hasil pencarian lagu untuk "${searchQuery}": ${resultText}`
  }

  return { handleMusic }
}
