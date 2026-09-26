import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

/**
 * Memproses string Markdown untuk menormalisasi notasi LaTeX seperti:
 * - Block math: \[ ... \] -> $$ ... $$
 * - Inline math: \( ... \) -> $ ... $
 * Tanpa merusak isi di dalam blok kode (fenced code blocks atau inline code).
 *
 * @param {string} content
 * @returns {string}
 */
export function preprocessLaTeX(content) {
  if (typeof content !== 'string' || !content) return content
  if (
    !content.includes('\\(') &&
    !content.includes('\\[') &&
    !content.includes('$$') &&
    !content.includes('$')
  ) {
    return content
  }

  // Pisahkan blok kode terlebih dahulu agar delimiter LaTeX di dalam kode tidak tersentuh
  const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g
  const parts = content.split(codeBlockRegex)

  return parts
    .map((part) => {
      // Jika merupakan blok kode, kembalikan apa adanya
      if (part.startsWith('`')) {
        return part
      }

      // Normalisasi block math: \[ ... \] -> \n\n$$\n...\n$$\n\n
      let res = part.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`)

      // Normalisasi inline math: \( ... \) -> $...$
      res = res.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`)

      return res
    })
    .join('')
}

export const mathRemarkPlugins = [remarkMath]
export const mathRehypePlugins = [[rehypeKatex, { output: 'htmlAndMathml', throwOnError: false }]]
