import axios from 'axios'
import { getYoutubeSummary } from '../../api/ai/tools'

export const useMarkYoutube = (setChatData) => {
  const handleYoutubeSearch = async (answer, signal, customSetChatData) => {
    const targetSet = customSetChatData || setChatData
    try {
      const searchResults = await window.api.searchYoutube(answer.command.query)
      targetSet((prev) => [
        ...prev.filter((item) => !item.isThinking),
        {
          role: 'ai',
          content: answer.answer,
          isYoutubeSearch: true,
          youtubeLink: [...searchResults],
          queryYoutube: answer.command.query
        }
      ])
    } catch (error) {
      console.error('Youtube Search Error:', error)
      if (error.name === 'AbortError') {
        targetSet((prev) => [...prev.filter((item) => !item.isThinking)])
        targetSet((prev) => prev.slice(0, -1))
      } else {
        targetSet((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content: 'Gagal dapet info dari youtube nih, koneksi atau captcha mungkin bermasalah.'
          }
        ])
      }
    }
  }

  const getYoutubeData = async (url) => {
    try {
      const endpoint = `https://www.youtube.com/embed?url=${encodeURIComponent(url)}&format=json`
      const response = await axios.get(endpoint)
      const data = response.data
      return {
        judul: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url,
        success: true
      }
    } catch (error) {
      console.error('Gagal ambil data YouTube:', error.message)
      return { judul: 'Video Tidak Ditemukan', author: '-', thumbnail: null, success: false }
    }
  }

  const handleYoutubeSummary = async (url, signal, customSetChatData) => {
    const targetSet = customSetChatData || setChatData
    targetSet((prev) => [...prev, { role: 'ai', content: 'Sedang menonton video youtube (hal ini akan membutuhkan waktu beberapa saat mohon ditunggu)...', isSummarizing: true, youtubeLink: url }])
    try {
      const data = await getYoutubeData(url)
      const searchResults = await getYoutubeSummary(url, data, signal)
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSummarizing),
        { role: 'ai', content: searchResults, isYoutubeSummary: true, youtubeLink: url }
      ])
    } catch (error) {
      console.error('Youtube Summary Error:', error)
      if (error.name === 'AbortError') {
        targetSet((prev) => [...prev.filter((item) => !item.isSummarizing)])
        targetSet((prev) => prev.slice(0, -1))
      } else {
        targetSet((prev) => [
          ...prev.filter((item) => !item.isSummarizing),
          {
            role: 'ai',
            content: 'Gagal dapet info dari youtube nih, koneksi atau captcha mungkin bermasalah.'
          }
        ])
      }
    }
  }


  return { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData }
}
