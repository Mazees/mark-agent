import { exec } from 'child_process'
import util from 'util'
import path from 'path'
import fs from 'fs'

const execPromise = util.promisify(exec)

/**
 * Universal Delimiter & Bracket Balancer
 * Memindai kode sambil mengabaikan string literal dan komentar,
 * lalu memeriksa pasangan { }, [ ], ( ).
 */
function checkBracketBalance(content, commentType = 'c-style') {
  const stack = []
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inSingleLineComment = false
  let inMultiLineComment = false
  let inPythonTripleDouble = false
  let inPythonTripleSingle = false

  let line = 1
  let col = 0

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = i + 1 < content.length ? content[i + 1] : ''
    const prevChar = i > 0 ? content[i - 1] : ''
    const isEscaped = prevChar === '\\' && (i < 2 || content[i - 2] !== '\\')

    if (char === '\n') {
      line++
      col = 0
      inSingleLineComment = false
      continue
    }
    col++

    // --- State: Dalam komentar satu baris ---
    if (inSingleLineComment) {
      continue
    }

    // --- State: Dalam komentar multi-baris C-Style /* ... */ ---
    if (inMultiLineComment) {
      if (char === '*' && nextChar === '/') {
        inMultiLineComment = false
        i++
        col++
      }
      continue
    }

    // --- State: Dalam Python Triple Quotes """ ... """ ---
    if (inPythonTripleDouble) {
      if (char === '"' && nextChar === '"' && i + 2 < content.length && content[i + 2] === '"' && !isEscaped) {
        inPythonTripleDouble = false
        i += 2
        col += 2
      }
      continue
    }

    // --- State: Dalam Python Triple Quotes ''' ... ''' ---
    if (inPythonTripleSingle) {
      if (char === "'" && nextChar === "'" && i + 2 < content.length && content[i + 2] === "'" && !isEscaped) {
        inPythonTripleSingle = false
        i += 2
        col += 2
      }
      continue
    }

    // --- State: Dalam String ---
    if (inSingleQuote) {
      if (char === "'" && !isEscaped) inSingleQuote = false
      continue
    }
    if (inDoubleQuote) {
      if (char === '"' && !isEscaped) inDoubleQuote = false
      continue
    }
    if (inBacktick) {
      if (char === '`' && !isEscaped) inBacktick = false
      continue
    }

    // --- Deteksi Pembuka Komentar ---
    if (commentType === 'c-style' || commentType === 'slash-only') {
      if (char === '/' && nextChar === '/') {
        inSingleLineComment = true
        i++
        col++
        continue
      }
      if (char === '/' && nextChar === '*') {
        inMultiLineComment = true
        i++
        col++
        continue
      }
    }

    if (commentType === 'hash-style' || commentType === 'python') {
      if (commentType === 'python') {
        if (char === '"' && nextChar === '"' && i + 2 < content.length && content[i + 2] === '"') {
          inPythonTripleDouble = true
          i += 2
          col += 2
          continue
        }
        if (char === "'" && nextChar === "'" && i + 2 < content.length && content[i + 2] === "'") {
          inPythonTripleSingle = true
          i += 2
          col += 2
          continue
        }
      }
      if (char === '#') {
        inSingleLineComment = true
        continue
      }
    }

    if (commentType === 'sql') {
      if (char === '-' && nextChar === '-') {
        inSingleLineComment = true
        i++
        col++
        continue
      }
      if (char === '/' && nextChar === '*') {
        inMultiLineComment = true
        i++
        col++
        continue
      }
    }

    if (commentType === 'html') {
      if (char === '<' && nextChar === '!' && content.slice(i, i + 4) === '<!--') {
        const closeIdx = content.indexOf('-->', i + 4)
        if (closeIdx === -1) {
          return { valid: false, error: `Unclosed HTML comment '<!--' at line ${line}` }
        }
        i = closeIdx + 2
        continue
      }
    }

    // --- Deteksi Pembuka String ---
    if (char === "'" && !isEscaped) {
      inSingleQuote = true
      continue
    }
    if (char === '"' && !isEscaped) {
      inDoubleQuote = true
      continue
    }
    if (char === '`' && !isEscaped) {
      inBacktick = true
      continue
    }

    // --- Deteksi Kurung Buka / Tutup ---
    if (char === '{' || char === '[' || char === '(') {
      stack.push({ char, line, col })
    } else if (char === '}' || char === ']' || char === ')') {
      if (stack.length === 0) {
        return {
          valid: false,
          error: `Unmatched closing delimiter '${char}' at line ${line}, col ${col}`
        }
      }
      const last = stack.pop()
      const pairs = { '}': '{', ']': '[', ')': '(' }
      if (last.char !== pairs[char]) {
        return {
          valid: false,
          error: `Mismatched delimiter: expected closing for '${last.char}' (from line ${last.line}), but found '${char}' at line ${line}, col ${col}`
        }
      }
    }
  }

  if (inSingleQuote) {
    return { valid: false, error: "Unclosed single quote (') string literal" }
  }
  if (inDoubleQuote) {
    return { valid: false, error: 'Unclosed double quote (") string literal' }
  }
  if (inBacktick) {
    return { valid: false, error: 'Unclosed backtick (`) template literal' }
  }
  if (inMultiLineComment) {
    return { valid: false, error: 'Unclosed multi-line comment (/* ... */)' }
  }
  if (inPythonTripleDouble || inPythonTripleSingle) {
    return { valid: false, error: 'Unclosed Python triple-quoted string' }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1]
    return {
      valid: false,
      error: `Unclosed opening delimiter '${unclosed.char}' at line ${unclosed.line}, col ${unclosed.col}`
    }
  }

  return { valid: true }
}

/**
 * Validasi Pasangan Tag HTML / XML / SVG / Vue / Svelte
 */
function checkXmlTagBalance(content) {
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ])

  // Hapus komentar HTML
  let sanitized = content.replace(/<!--[\s\S]*?-->/g, '')
  // Hapus konten script & style
  sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
  sanitized = sanitized.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')

  const tagRegex = /<\/?([a-zA-Z0-9_\-:]+)([^>]*?)(\/?)>/g
  const stack = []
  let match

  while ((match = tagRegex.exec(sanitized)) !== null) {
    const fullTag = match[0]
    const tagName = match[1].toLowerCase()
    const isClosing = fullTag.startsWith('</')
    const isSelfClosing = match[3] === '/' || fullTag.endsWith('/>') || voidTags.has(tagName)

    if (isSelfClosing && !isClosing) {
      continue
    }

    if (!isClosing) {
      stack.push(tagName)
    } else {
      if (stack.length === 0) {
        return {
          valid: false,
          error: `Unexpected closing tag </${tagName}> without matching opening tag`
        }
      }
      const last = stack.pop()
      if (last !== tagName && !voidTags.has(last)) {
        return {
          valid: false,
          error: `Tag mismatch: expected </${last}>, but found </${tagName}>`
        }
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.filter((t) => !voidTags.has(t))
    if (unclosed.length > 0) {
      return {
        valid: false,
        error: `Unclosed tag(s): <${unclosed.join('>, <')}>`
      }
    }
  }

  return { valid: true }
}

/**
 * Memvalidasi sintaks file berdasarkan ekstensi secara lokal
 * Mendukung 20+ bahasa dan format file
 * @param {string} filePath Path absolut ke berkas
 * @param {string} content Konten berkas
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateFileSyntax(filePath, content) {
  if (!filePath || !content) return { valid: true }
  const ext = path.extname(filePath).toLowerCase()

  try {
    // 1. JSON & JSONC
    if (['.json', '.jsonc', '.json5'].includes(ext)) {
      try {
        const cleanJson = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
        JSON.parse(cleanJson)
        return { valid: true }
      } catch (jsonErr) {
        return { valid: false, error: `JSON Parse Error: ${jsonErr.message}` }
      }
    }

    // 2. YAML (.yaml, .yml)
    if (['.yaml', '.yml'].includes(ext)) {
      const yamlBracket = checkBracketBalance(content, 'hash-style')
      if (!yamlBracket.valid) return yamlBracket
      // Cek indentasi tab terlarang di YAML
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('\t')) {
          return {
            valid: false,
            error: `YAML SyntaxError: Tab character used for indentation at line ${i + 1}`
          }
        }
      }
      return { valid: true }
    }

    // 3. JavaScript (.js, .mjs, .cjs)
    if (['.js', '.mjs', '.cjs'].includes(ext)) {
      const bracketCheck = checkBracketBalance(content, 'c-style')
      if (!bracketCheck.valid) return bracketCheck

      if (fs.existsSync(filePath)) {
        try {
          await execPromise(`node -c "${filePath}"`)
        } catch (nodeErr) {
          const cleanErr = (nodeErr.stderr || nodeErr.message || '').trim()
          return { valid: false, error: `JavaScript SyntaxError:\n${cleanErr}` }
        }
      }
      return { valid: true }
    }

    // 4. JSX, TypeScript (.jsx, .ts, .tsx)
    if (['.jsx', '.ts', '.tsx'].includes(ext)) {
      const bracketCheck = checkBracketBalance(content, 'c-style')
      if (!bracketCheck.valid) return bracketCheck
      return { valid: true }
    }

    // 5. Python (.py, .pyw)
    if (['.py', '.pyw'].includes(ext)) {
      const bracketCheck = checkBracketBalance(content, 'python')
      if (!bracketCheck.valid) return bracketCheck

      if (fs.existsSync(filePath)) {
        try {
          await execPromise(`python -m py_compile "${filePath}"`)
        } catch (_) {
          try {
            await execPromise(`py -m py_compile "${filePath}"`)
          } catch (pyErr) {
            const cleanErr = (pyErr.stderr || pyErr.message || '').trim()
            if (cleanErr && !cleanErr.includes('not found') && !cleanErr.includes('is not recognized')) {
              return { valid: false, error: `Python SyntaxError:\n${cleanErr}` }
            }
          }
        }
      }
      return { valid: true }
    }

    // 6. HTML, XML, SVG, Vue, Svelte
    if (['.html', '.htm', '.xml', '.svg', '.vue', '.svelte'].includes(ext)) {
      const tagCheck = checkXmlTagBalance(content)
      if (!tagCheck.valid) return tagCheck
      return { valid: true }
    }

    // 7. CSS, SCSS, LESS
    if (['.css', '.scss', '.less'].includes(ext)) {
      const bracketCheck = checkBracketBalance(content, 'c-style')
      if (!bracketCheck.valid) return bracketCheck
      return { valid: true }
    }

    // 8. PHP (.php)
    if (ext === '.php') {
      const bracketCheck = checkBracketBalance(content, 'c-style')
      if (!bracketCheck.valid) return bracketCheck
      if (fs.existsSync(filePath)) {
        try {
          await execPromise(`php -l "${filePath}"`)
        } catch (phpErr) {
          const cleanErr = (phpErr.stderr || phpErr.stdout || phpErr.message || '').trim()
          if (cleanErr && !cleanErr.includes('not found') && !cleanErr.includes('is not recognized')) {
            return { valid: false, error: `PHP SyntaxError:\n${cleanErr}` }
          }
        }
      }
      return { valid: true }
    }

    // 9. Ruby (.rb)
    if (ext === '.rb') {
      const bracketCheck = checkBracketBalance(content, 'hash-style')
      if (!bracketCheck.valid) return bracketCheck
      if (fs.existsSync(filePath)) {
        try {
          await execPromise(`ruby -c "${filePath}"`)
        } catch (rbErr) {
          const cleanErr = (rbErr.stderr || rbErr.message || '').trim()
          if (cleanErr && !cleanErr.includes('not found') && !cleanErr.includes('is not recognized')) {
            return { valid: false, error: `Ruby SyntaxError:\n${cleanErr}` }
          }
        }
      }
      return { valid: true }
    }

    // 10. Go (.go)
    if (ext === '.go') {
      const bracketCheck = checkBracketBalance(content, 'c-style')
      if (!bracketCheck.valid) return bracketCheck
      if (fs.existsSync(filePath)) {
        try {
          await execPromise(`gofmt -e "${filePath}"`)
        } catch (goErr) {
          const cleanErr = (goErr.stderr || goErr.message || '').trim()
          if (cleanErr && !cleanErr.includes('not found') && !cleanErr.includes('is not recognized')) {
            return { valid: false, error: `Go SyntaxError:\n${cleanErr}` }
          }
        }
      }
      return { valid: true }
    }

    // 11. SQL (.sql)
    if (ext === '.sql') {
      const bracketCheck = checkBracketBalance(content, 'sql')
      if (!bracketCheck.valid) return bracketCheck
      return { valid: true }
    }

    // 12. C, C++, C#, Java, Kotlin, Rust, Swift, Dart
    if (['.c', '.cpp', '.h', '.hpp', '.cs', '.java', '.kt', '.rs', '.swift', '.dart'].includes(ext)) {
      const bracketCheck = checkBracketBalance(content, 'c-style')
      if (!bracketCheck.valid) return bracketCheck
      return { valid: true }
    }

    // 13. Shell & PowerShell (.sh, .bash, .ps1, .psm1)
    if (['.sh', '.bash', '.ps1', '.psm1'].includes(ext)) {
      const bracketCheck = checkBracketBalance(content, ext.startsWith('.ps') ? 'c-style' : 'hash-style')
      if (!bracketCheck.valid) return bracketCheck
      return { valid: true }
    }

    // Default: Universal bracket balance check
    const genericBracket = checkBracketBalance(content, 'c-style')
    if (!genericBracket.valid) return genericBracket

    return { valid: true }
  } catch (err) {
    return { valid: true } // Jangan halangi jika terjadi error internal pada validator
  }
}

