import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Copy, Search, X } from 'lucide-react'
import { guideArticles, guideArticleId, guideCategories, searchGuide } from '../data/guidebookData'
import { faqs } from '../data/faqData'
import { builtinToolGroups, toolSearchText } from '../components/guidebook/guidebookTools'
import ToolReference from '../components/guidebook/ToolReference'

const articleById = new Map(guideArticles.map((article) => [article.id, article]))
const toolText = toolSearchText(builtinToolGroups)
const faqText = faqs.map((faq) => `${faq.q} ${faq.a}`).join(' ')

export default function Guidebook() {
  const [params, setParams] = useSearchParams()
  const currentId = guideArticleId(params.get('section'))
  const article = articleById.get(currentId)
  const [query, setQuery] = useState('')
  const [contentsOpen, setContentsOpen] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const [copied, setCopied] = useState('')
  const contentRef = useRef(null)
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const searchActive = Boolean(query.trim())
  const results = useMemo(() => searchGuide(query, { toolText, faqText }), [query])
  const index = guideArticles.findIndex((item) => item.id === currentId)

  const openArticle = (id, toolQuery = '') => {
    setQuery('')
    setCopyNotice('')
    setCopied('')
    setContentsOpen(false)
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('section', id)
      if (toolQuery) next.set('tool', toolQuery)
      else next.delete('tool')
      return next
    })
    requestAnimationFrame(() => {
      contentRef.current?.focus({ preventScroll: true })
      rootRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    })
  }
  const copyExample = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setCopyNotice('Contoh permintaan disalin.')
    } catch {
      setCopied('')
      setCopyNotice('Contoh belum dapat disalin. Silakan pilih teks dan salin secara manual.')
    }
  }

  return (
    <main
      ref={rootRef}
      className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar"
    >
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={17} />
          Kembali
        </Link>
        <header>
          <h1 className="text-2xl font-semibold text-white">Mark Guidebook</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
            Panduan fitur, langkah penggunaan, dan bantuan untuk Mark Agent.
          </p>
        </header>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <label className="relative block w-full sm:max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              ref={searchRef}
              type="search"
              aria-label="Cari panduan"
              placeholder="Cari fitur, cara penggunaan, atau kendala…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setCopyNotice('')
              }}
              className="h-10 w-full rounded-full border border-white/15 bg-transparent pl-10 pr-10 text-sm outline-none focus:border-primary/60 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Hapus pencarian"
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                className="absolute inset-y-0 right-1 flex w-9 items-center justify-center rounded-full text-white/50 hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </label>
          <p className="text-xs text-white/40">
            {guideArticles.length} topik · Referensi tool dan bantuan
          </p>
        </div>
        <div className="grid gap-8 pt-7 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <aside className="min-w-0 self-start lg:sticky lg:top-7">
            <button
              type="button"
              aria-expanded={contentsOpen}
              aria-controls="guidebook-navigation"
              onClick={() => setContentsOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-lg border border-white/15 px-4 py-3 text-sm text-white/80 lg:hidden"
            >
              Daftar isi{contentsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <nav
              id="guidebook-navigation"
              aria-label="Daftar isi Guidebook"
              className={`${contentsOpen ? 'block' : 'hidden'} mt-5 space-y-6 lg:mt-0 lg:block lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto custom-scrollbar`}
            >
              {guideCategories.map((category) => (
                <div key={category.id}>
                  <h2 className="mb-2 px-3 text-xs font-medium text-white/40">{category.title}</h2>
                  <div className="space-y-0.5">
                    {guideArticles
                      .filter((item) => item.category === category.id)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={!searchActive && currentId === item.id ? 'page' : undefined}
                          onClick={() => openArticle(item.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-primary ${!searchActive && currentId === item.id ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}
                        >
                          {item.title}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
          <div
            ref={contentRef}
            tabIndex={-1}
            className="min-w-0 outline-none"
            id="guidebook-content"
          >
            {searchActive ? (
              <section aria-labelledby="guidebook-results">
                <h2 id="guidebook-results" className="text-lg font-semibold text-white">
                  Hasil pencarian
                </h2>
                <p role="status" className="mt-3 text-xs text-white/45">
                  {results.length} topik untuk “{query.trim()}”
                </p>
                {results.length ? (
                  <div className="mt-6 divide-y divide-white/10">
                    {results.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => openArticle(item.id, item.id === 'tools' ? query : '')}
                        className="flex w-full items-start justify-between gap-5 py-5 text-left hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <span>
                          <span className="block text-sm font-medium text-white/85">
                            {item.title}
                          </span>
                          <span className="mt-2 block text-sm leading-relaxed text-white/50">
                            {item.summary}
                          </span>
                        </span>
                        <ArrowRight size={16} className="mt-1 shrink-0 text-white/40" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-10">
                    <p className="text-sm leading-relaxed text-white/55">
                      Belum ada panduan yang cocok. Coba nama fitur seperti Chrome Bridge,
                      workspace, suara, atau izin akses.
                    </p>
                    <button
                      type="button"
                      className="btn btn-ghost mt-4 rounded-full border-white/15 text-sm"
                      onClick={() => setQuery('')}
                    >
                      Tampilkan panduan
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <article aria-labelledby="guidebook-article-title">
                <p className="mb-3 text-xs text-white/40">
                  {guideCategories.find((category) => category.id === article.category)?.title}
                </p>
                <h2
                  id="guidebook-article-title"
                  className="text-xl font-semibold leading-snug text-white"
                >
                  {article.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/55">{article.summary}</p>
                {article.id === 'overview' && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openArticle('getting-started')}
                      className="btn rounded-full border-white bg-white px-5 text-sm text-neutral-900 hover:bg-white/90"
                    >
                      Mulai menggunakan Mark
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openArticle('tools')}
                      className="btn btn-ghost rounded-full border-white/15 text-sm"
                    >
                      Lihat referensi tool
                    </button>
                  </div>
                )}
                <div className="mt-8 space-y-8">
                  {article.sections.map((section) => (
                    <section key={section.title}>
                      <h3 className="text-sm font-medium text-white/90">{section.title}</h3>
                      {section.paragraphs?.map((paragraph) => (
                        <p key={paragraph} className="mt-3 text-sm leading-7 text-white/65">
                          {paragraph}
                        </p>
                      ))}
                      {section.bullets && (
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-white/65 marker:text-white/30">
                          {section.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                      {section.steps && (
                        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-7 text-white/65 marker:text-white/50">
                          {section.steps.map((item) => (
                            <li key={item} className="pl-1">
                              {item}
                            </li>
                          ))}
                        </ol>
                      )}
                      {section.example && (
                        <div className="mt-5 rounded-xl border border-white/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-white/40">Contoh permintaan</p>
                            <button
                              type="button"
                              aria-label={`Salin contoh: ${section.title}`}
                              onClick={() => copyExample(section.example)}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <Copy size={13} />
                              {copied === section.example ? 'Disalin' : 'Salin'}
                            </button>
                          </div>
                          <p className="mt-3 select-text whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                            {section.example}
                          </p>
                        </div>
                      )}
                      {section.links && (
                        <div className="mt-4 flex flex-wrap gap-4">
                          {section.links.map((link) => (
                            <Link
                              key={link.to}
                              to={link.to}
                              className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                            >
                              {link.label}
                              <ArrowRight size={14} />
                            </Link>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
                {article.id === 'tools' && (
                  <ToolReference
                    key={params.get('tool') || 'all'}
                    initialQuery={params.get('tool') || ''}
                  />
                )}
                {article.id === 'faq' && (
                  <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
                    {faqs.map((faq) => (
                      <details key={faq.q} className="py-4">
                        <summary className="cursor-pointer text-sm font-medium leading-relaxed text-white/80 focus-visible:outline-2 focus-visible:outline-primary">
                          {faq.q}
                        </summary>
                        <p className="mt-3 text-sm leading-7 text-white/60">{faq.a}</p>
                      </details>
                    ))}
                  </div>
                )}
                {copyNotice && (
                  <p role="status" className="mt-5 text-xs text-white/55">
                    {copyNotice}
                  </p>
                )}
                {article.related?.length > 0 && (
                  <nav aria-label="Panduan terkait" className="mt-9 border-t border-white/10 pt-6">
                    <h3 className="mb-3 text-xs font-medium text-white/40">Panduan terkait</h3>
                    <div className="flex flex-wrap gap-2">
                      {article.related.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => openArticle(id)}
                          className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/65 hover:border-white/25 hover:text-white"
                        >
                          {articleById.get(id)?.title}
                        </button>
                      ))}
                    </div>
                  </nav>
                )}
                <nav
                  aria-label="Urutan panduan"
                  className="mt-8 flex justify-between gap-5 border-t border-white/10 pt-5 pb-6"
                >
                  {index > 0 ? (
                    <button
                      type="button"
                      onClick={() => openArticle(guideArticles[index - 1].id)}
                      className="flex min-w-0 items-start gap-2 text-left text-xs leading-relaxed text-white/55 hover:text-white"
                    >
                      <ArrowLeft size={14} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="mb-1 block text-white/35">Sebelumnya</span>
                        {guideArticles[index - 1].title}
                      </span>
                    </button>
                  ) : (
                    <span />
                  )}
                  {index < guideArticles.length - 1 && (
                    <button
                      type="button"
                      onClick={() => openArticle(guideArticles[index + 1].id)}
                      className="flex min-w-0 items-start gap-2 text-right text-xs leading-relaxed text-white/55 hover:text-white"
                    >
                      <span>
                        <span className="mb-1 block text-white/35">Berikutnya</span>
                        {guideArticles[index + 1].title}
                      </span>
                      <ArrowRight size={14} className="mt-0.5 shrink-0" />
                    </button>
                  )}
                </nav>
              </article>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
