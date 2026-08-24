import { getBestMusicMatch } from '../../api/ai/tools'

export const useMarkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playUrl, nextTrack, prevTrack, playPause } = youtubeMusicTools

  const handleMusic = async (action, query, customSetChatData) => {
    const targetSet = customSetChatData || setChatData
    if (action === 'music-next') { nextTrack(); return 'Memutar lagu selanjutnya.' }
    if (action === 'music-prev') { prevTrack(); return 'Memutar lagu sebelumnya.' }
    if (action === 'music-toggle') { playPause(); return 'Pause/Resume lagu.' }

    targetSet((prev) => [...prev, { role: 'ai', content: 'Mencari lagu...', isSearchingMusic: true }])
    const music = await window.api.searchMusic(query)
    const isAutoplay = action === 'music-play'

    let selectedMusicList = [...music]
    let selectedId = music[0]?.id

    if (isAutoplay && music.length > 0) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        { role: 'ai', content: 'Menganalisis versi lagu terbaik...', isSearchingMusic: true }
      ])
      
      const bestMatch = await getBestMusicMatch(query, music.slice(0, 10), abortControllerRef.current?.signal)
      if (bestMatch && bestMatch.selectedId) {
        selectedId = bestMatch.selectedId
        const found = music.find((m) => m.id === selectedId)
        if (found) {
          selectedMusicList = [found]
        } else {
          selectedMusicList = [music[0]]
          selectedId = music[0].id
        }
      } else {
        selectedMusicList = [music[0]]
      }
    }

    if (!isAutoplay) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        {
          role: 'ai',
          content: `Hasil Pencarian Lagu untuk "${query}": \n ${music.map((item) => item.title).join('\n')}`,
          isMusic: true,
          isMusicAutoplay: false,
          musicQuery: query,
          musicList: [...music]
        }
      ])
    } else {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
    }

    if (isAutoplay && selectedId) {
      playUrl(`https://music.youtube.com/watch?v=${selectedId}`, selectedMusicList[0])
      return `[SYSTEM LOG] Berhasil memutar lagu: ${selectedMusicList[0].title} oleh ${selectedMusicList[0].artist}`
    }

    const resultText = music.slice(0, 5).map(m => `${m.title} oleh ${m.artist}`).join(', ')
    return `[SYSTEM LOG] Hasil pencarian lagu untuk "${query}": ${resultText}`
  }


  return { handleMusic }
}
