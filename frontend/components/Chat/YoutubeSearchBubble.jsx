import React from 'react'

export const YoutubeSearchBubble = ({ queryYoutube, youtubeLink }) => {
  return (
    <>
      <h1 className="text-xs font-bold mt-2 flex items-center gap-1 uppercase tracking-wider">
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            fillRule="evenodd"
            d="M21.7 8.037a4.26 4.26 0 0 0-.789-1.964 2.84 2.84 0 0 0-1.984-.839c-2.767-.2-6.926-.2-6.926-.2s-4.157 0-6.928.2a2.836 2.836 0 0 0-1.983.839 4.225 4.225 0 0 0-.79 1.965 30.146 30.146 0 0 0-.2 3.206v1.5a30.12 30.12 0 0 0 .2 3.206c.094.712.364 1.39.784 1.972.604.536 1.38.837 2.187.848 1.583.151 6.731.2 6.731.2s4.161 0 6.928-.2a2.844 2.844 0 0 0 1.985-.84 4.27 4.27 0 0 0 .787-1.965 30.12 30.12 0 0 0 .2-3.206v-1.516a30.672 30.672 0 0 0-.202-3.206Zm-11.692 6.554v-5.62l5.4 2.819-5.4 2.801Z"
            clipRule="evenodd"
          />
        </svg>
        {`Pencarian: ${queryYoutube.slice(0, 40)}`}
        {queryYoutube.length > 40 ? '...' : ''}
      </h1>
      <div className="p-3 bg-base-300 flex flex-wrap rounded-2xl mt-2">
        {youtubeLink.map((item, idx) => {
          const id = typeof item === 'object' ? item.videoId : item
          return (
            <iframe
              key={idx}
              className="w-1/2 aspect-video rounded-lg"
              src={`https://www.youtube.com/embed/${id}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
          )
        })}
      </div>
    </>
  )
}
