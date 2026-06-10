import React from 'react'

export const ThinkingBubble = ({ isThinking, isSummarizing, isSearchingMusic, youtubeLink }) => {
  const getVideoId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const videoId = isSummarizing ? getVideoId(youtubeLink) : null;

  return (
    <div className="flex flex-col gap-2 py-1 animate-pulse">
      <div className="flex items-center gap-2">
        {!isSummarizing && <span className="loading loading-dots loading-xs"></span>}
        <span className="text-xs italic opacity-70 flex items-center gap-1">
          {isThinking && 'Mark is thinking...'}
          {isSummarizing && (
            <>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1.2em"
                height="1.2em"
                fill="currentColor"
                viewBox="0 0 24 24"
                className="text-red-500"
              >
                <path
                  fillRule="evenodd"
                  d="M21.7 8.037a4.26 4.26 0 0 0-.789-1.964 2.84 2.84 0 0 0-1.984-.839c-2.767-.2-6.926-.2-6.926-.2s-4.157 0-6.928.2a2.836 2.836 0 0 0-1.983.839 4.225 4.225 0 0 0-.79 1.965 30.146 30.146 0 0 0-.2 3.206v1.5a30.12 30.12 0 0 0 .2 3.206c.094.712.364 1.39.784 1.972.604.536 1.38.837 2.187.848 1.583.151 6.731.2 6.731.2s4.161 0 6.928-.2a2.844 2.844 0 0 0 1.985-.84 4.27 4.27 0 0 0 .787-1.965 30.12 30.12 0 0 0 .2-3.206v-1.516a30.672 30.672 0 0 0-.202-3.206Zm-11.692 6.554v-5.62l5.4 2.819-5.4 2.801Z"
                  clipRule="evenodd"
                />
              </svg>
              Sedang menonton video youtube (hal ini akan membutuhkan waktu beberapa saat mohon ditunggu)...
            </>
          )}
          {isSearchingMusic && 'Mark is searching music...'}
        </span>
      </div>
      
      {isSummarizing && videoId && (
        <button 
          onClick={() => window.api.openExternal(youtubeLink)}
          className="rounded-xl overflow-hidden w-80 sm:w-96 aspect-video opacity-90 border border-base-300 ml-1 mt-1 bg-base-300 shadow-sm relative hover:opacity-100 transition-all hover:scale-[1.02] cursor-pointer group/vid"
          title="Buka video di YouTube"
        >
          <img 
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} 
            alt="Youtube Preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover/vid:bg-black/0 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-14 h-14 opacity-90 group-hover/vid:opacity-100 drop-shadow-lg group-hover/vid:scale-110 transition-transform"
            >
              <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
              <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
        </button>
      )}
    </div>
  )
}
