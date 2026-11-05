/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ChevronLeft, ChevronRight, Minus, Plus, Search, RefreshCw } from 'lucide-react'
import { webApi, SERVER_CONFIG } from '../../api/web-bridge.js'
GlobalWorkerOptions.workerSrc = worker
export default function WorkspaceDocument({ tab, sessionId }) {
  const canvas = useRef(null),
    generation = useRef(0)
  const [pdf, setPdf] = useState(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState([]),
    [searching, setSearching] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    let disposed = false,
      loading,
      loaded
    webApi
      .codingRequest('/workspace/document', sessionId, { path: tab.path }, 'POST')
      .then(async (value) => {
        if (disposed) return
        const params = new URLSearchParams({
          sessionId: String(sessionId),
          path: value.path,
          hash: value.hash
        })
        loading = getDocument({
          url: `${SERVER_CONFIG.apiBase}/api/workspace/document/content?${params}`,
          cMapUrl: '/pdf-assets/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdf-assets/standard_fonts/',
          wasmUrl: '/pdf-assets/wasm/',
          isEvalSupported: false
        })
        loaded = await loading.promise
        if (!disposed) {
          setPdf(loaded)
          setPage(1)
        } else await loaded.destroy()
      })
      .catch((e) => {
        if (!disposed) setError(e.message)
      })
    return () => {
      disposed = true
      loaded?.destroy()
      if (!loaded) loading?.destroy()
    }
  }, [sessionId, tab.path, retry])
  useEffect(() => {
    if (!pdf || !canvas.current) return
    let task,
      disposed = false
    pdf
      .getPage(page)
      .then(async (value) => {
        if (disposed) return
        const viewport = value.getViewport({ scale: zoom * 1.15 }),
          ratio = window.devicePixelRatio || 1
        const element = canvas.current
        element.width = Math.floor(viewport.width * ratio)
        element.height = Math.floor(viewport.height * ratio)
        element.style.width = `${viewport.width}px`
        element.style.height = `${viewport.height}px`
        task = value.render({
          canvasContext: element.getContext('2d'),
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0]
        })
        await task.promise
      })
      .catch((e) => {
        if (!disposed && e.name !== 'RenderingCancelledException') setError(e.message)
      })
    return () => {
      disposed = true
      task?.cancel()
    }
  }, [pdf, page, zoom])
  useEffect(() => {
    const id = ++generation.current
    if (!pdf || !query.trim()) return
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const found = []
        for (let index = 1; index <= pdf.numPages; index++) {
          if (generation.current !== id) return
          const text = await (await pdf.getPage(index)).getTextContent()
          if (
            text.items
              .map((item) => item.str || '')
              .join(' ')
              .toLowerCase()
              .includes(query.toLowerCase())
          )
            found.push(index)
        }
        if (generation.current === id) {
          setMatches(found)
          if (found.length) setPage(found[0])
          setSearching(false)
        }
      } catch (e) {
        if (generation.current === id) {
          setError(e.message)
          setSearching(false)
        }
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      generation.current++
    }
  }, [pdf, query])
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-2">
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          disabled={!pdf || page <= 1}
          onClick={() => setPage(page - 1)}
          className="p-1 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pdf?.numPages || '—'}
        </span>
        <button
          type="button"
          aria-label="Halaman berikutnya"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage(page + 1)}
          className="p-1 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          aria-label="Perkecil dokumen"
          onClick={() => setZoom(Math.max(0.4, zoom - 0.2))}
          className="ml-2 p-1"
        >
          <Minus size={15} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Perbesar dokumen"
          onClick={() => setZoom(Math.min(3, zoom + 0.2))}
          className="p-1"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            setPdf(null)
            setRetry(retry + 1)
          }}
          aria-label="Muat ulang preview"
          className="ml-auto p-1"
        >
          <RefreshCw size={15} />
        </button>
        <div className="flex min-w-0 basis-full items-center gap-2 rounded border border-white/10 px-2">
          <Search size={14} />
          <input
            aria-label="Cari teks dalam dokumen"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setMatches([])
              setSearching(false)
            }}
            placeholder="Cari teks…"
            className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                const next = matches.find((n) => n > page) || matches[0]
                if (next) setPage(next)
              }}
              className="shrink-0 text-white/55"
            >
              {searching ? 'Mencari…' : `${matches.length} halaman`}
            </button>
          )}
        </div>
      </div>
      {error ? (
        <div role="alert" className="p-4 text-error">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError('')
              setPdf(null)
              setRetry(retry + 1)
            }}
            className="mt-3 text-primary"
          >
            Coba lagi
          </button>
        </div>
      ) : !pdf ? (
        <p role="status" className="p-4 text-white/55">
          Menyiapkan pratinjau lokal…
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto bg-black/20 p-4">
        {pdf && (
          <canvas
            ref={canvas}
            className="mx-auto bg-white shadow-lg"
            aria-label={`Halaman ${page} dokumen ${tab.path}`}
          />
        )}
      </div>
    </div>
  )
}
