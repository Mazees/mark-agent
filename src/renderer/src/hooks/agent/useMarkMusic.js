import { getBestMusicMatch } from '../../api/ai/tools'

export const useMarkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playUrl, nextTrack, prevTrack, playPause } = youtubeMusicTools

  const handleMusic = async (action, query) => {
    if (action === 'music-next') return nextTrack()
    if (action === 'music-prev') return prevTrack()
    if (action === 'music-toggle') return playPause()

    setChatData((prev) => [...prev, { role: 'ai', content: 'Mencari lagu...', isSearchingMusic: true }])
    const music = await window.api.searchMusic(query)
    const isAutoplay = action === 'music-play'

    let selectedMusicList = [...music]
    let selectedId = music[0]?.id

    if (isAutoplay && music.length > 0) {
      setChatData((prev) => [
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

    setChatData((prev) => [
      ...prev.filter((item) => !item.isSearchingMusic),
      {
        role: 'ai',
        content: isAutoplay && selectedMusicList.length > 0
            ? `Memutar lagu: **${selectedMusicList[0].title}** oleh ${selectedMusicList[0].artist}`
            : `Hasil Pencarian Lagu untuk "${query}": \n ${music.map((item) => item.title).join('\n')}`,
        isMusic: true,
        isMusicAutoplay: isAutoplay,
        musicQuery: query,
        musicList: isAutoplay ? selectedMusicList : [...music]
      }
    ])

    if (isAutoplay && selectedId) {
      playUrl(`https://music.youtube.com/watch?v=${selectedId}`, selectedMusicList[0])
    }
  }


  return { handleMusic }
}
