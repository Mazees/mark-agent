/* eslint-disable react/prop-types */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { FileText } from 'lucide-react'

const readText = (node) => {
  if (node.nodeType === 3) return node.textContent || ''
  if (node.nodeType === 1 && node.hasAttribute('data-skill-name')) {
    return `/${node.getAttribute('data-skill-name')}`
  }
  if (node.nodeName === 'BR') return node.hasAttribute('data-trailing') ? '' : '\n'
  return Array.from(node.childNodes).map(readText).join('')
}

const getOffsets = (root) => {
  const selection = window.getSelection()
  if (
    !selection?.rangeCount ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    const end = readText(root).length
    return { start: end, end }
  }
  const range = selection.getRangeAt(0)
  const prefix = range.cloneRange()
  prefix.selectNodeContents(root)
  prefix.setEnd(range.startContainer, range.startOffset)
  const start = readText(prefix.cloneContents()).length
  return { start, end: start + readText(range.cloneContents()).length }
}

const setOffsets = (root, start, end = start) => {
  const point = (position) => {
    let remaining = Math.max(0, position)
    for (let i = 0; i < root.childNodes.length; i++) {
      const node = root.childNodes[i]
      const length = readText(node).length
      if (remaining <= length) {
        if (node.nodeType === 3) return [node, remaining]
        return [root, i + (remaining > 0 ? 1 : 0)]
      }
      remaining -= length
    }
    return [root, root.childNodes.length]
  }
  const range = document.createRange()
  range.setStart(...point(start))
  range.setEnd(...point(end))
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

const findSkills = (text, skills) => {
  const byName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]))
  return Array.from(text.matchAll(/(^|\s)\/([a-zA-Z0-9_-]+)(?=\s|$)/g)).flatMap((match) => {
    const skill = byName.get(match[2].toLowerCase())
    const start = match.index + match[1].length
    return skill ? [{ skill, start, end: start + match[2].length + 1 }] : []
  })
}

const SkillComposer = forwardRef(function SkillComposer(
  { value, skills, onChange, onKeyDown, onPaste, placeholder, className },
  ref
) {
  const editorRef = useRef(null)
  const iconsRef = useRef(null)
  const valueRef = useRef(value)
  const pendingSelectionRef = useRef(null)
  const composingRef = useRef(false)
  const initiallyFocusedRef = useRef(false)
  const historyRef = useRef([{ value, start: value.length, end: value.length }])
  const historyIndexRef = useRef(0)
  valueRef.current = value

  useImperativeHandle(
    ref,
    () => ({
      get value() {
        return valueRef.current
      },
      get selectionStart() {
        return getOffsets(editorRef.current).start
      },
      focus() {
        const root = editorRef.current
        if (document.activeElement !== root) {
          root.focus()
          setOffsets(root, valueRef.current.length)
        }
      },
      setSelectionRange(start, end) {
        setOffsets(editorRef.current, start, end)
      }
    }),
    []
  )

  useLayoutEffect(() => {
    if (composingRef.current) return
    const root = editorRef.current
    const focused = document.activeElement === root
    const selection = pendingSelectionRef.current || getOffsets(root)
    pendingSelectionRef.current = null
    if (historyRef.current[historyIndexRef.current].value !== value) {
      const history = historyRef.current.slice(0, historyIndexRef.current + 1)
      history.push({ value, ...selection })
      historyRef.current = history.slice(-100)
      historyIndexRef.current = historyRef.current.length - 1
    }
    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (const { skill, start, end } of findSkills(value, skills)) {
      fragment.append(document.createTextNode(value.slice(cursor, start)))
      const token = document.createElement('span')
      token.contentEditable = 'false'
      token.setAttribute('data-skill-name', skill.name)
      token.setAttribute('aria-label', `Skill: ${skill.title || skill.name}`)
      token.title = `/${skill.name}`
      token.className = 'inline text-primary font-medium select-none'
      const icon = Array.from(iconsRef.current.children).find(
        (item) => item.getAttribute('data-icon-name') === skill.name
      )?.firstChild
      if (icon) {
        const inlineIcon = icon.cloneNode(true)
        inlineIcon.style.display = 'inline-block'
        inlineIcon.style.verticalAlign = '-0.125em'
        inlineIcon.style.marginRight = '0.25rem'
        token.append(inlineIcon)
      }
      const label = document.createElement('span')
      label.className = 'break-words'
      label.textContent = skill.title || skill.name
      token.append(label)
      fragment.append(token)
      cursor = end
    }
    fragment.append(document.createTextNode(value.slice(cursor)))
    if (value.endsWith('\n')) {
      const trailing = document.createElement('br')
      trailing.setAttribute('data-trailing', '')
      fragment.append(trailing)
    }
    root.replaceChildren(fragment)
    if (focused)
      setOffsets(
        root,
        Math.min(selection.start, value.length),
        Math.min(selection.end, value.length)
      )
  }, [value, skills])

  const emitChange = (next, selection) => {
    valueRef.current = next
    pendingSelectionRef.current = selection
    onChange({ target: { value: next, selectionStart: selection.start } })
  }

  const handleInput = () => {
    if (composingRef.current) return
    const root = editorRef.current
    const isEmpty = root.childNodes.length === 1 && root.firstChild.nodeName === 'BR'
    emitChange(isEmpty ? '' : readText(root), isEmpty ? { start: 0, end: 0 } : getOffsets(root))
  }

  const insertText = (text) => {
    const { start, end } = getOffsets(editorRef.current)
    const next = valueRef.current.slice(0, start) + text + valueRef.current.slice(end)
    const cursor = start + text.length
    emitChange(next, { start: cursor, end: cursor })
  }

  return (
    <div className="relative w-full min-w-0">
      <span ref={iconsRef} hidden aria-hidden="true">
        {skills.map((skill) => {
          const Icon = skill.icon && typeof skill.icon !== 'string' ? skill.icon : FileText
          return (
            <span key={skill.name} data-icon-name={skill.name}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
            </span>
          )
        })}
      </span>
      {!value && (
        <span className="pointer-events-none absolute left-2 top-1.5 text-sm leading-normal text-white/30">
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={placeholder || 'Pesan untuk Mark'}
        aria-multiline="true"
        className={`${className} whitespace-pre-wrap break-words overflow-x-hidden`}
        onFocus={() => {
          if (!initiallyFocusedRef.current) {
            initiallyFocusedRef.current = true
            setOffsets(editorRef.current, valueRef.current.length)
          }
        }}
        onInput={handleInput}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          composingRef.current = false
          handleInput()
        }}
        onKeyDown={(event) => {
          if (composingRef.current || event.nativeEvent.isComposing) return
          const key = event.key.toLowerCase()
          if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(key)) {
            event.preventDefault()
            const forward = key === 'y' || event.shiftKey
            const index = historyIndexRef.current + (forward ? 1 : -1)
            const entry = historyRef.current[index]
            if (entry) {
              historyIndexRef.current = index
              emitChange(entry.value, { start: entry.start, end: entry.end })
            }
            return
          }
          onKeyDown(event)
          if (event.defaultPrevented) return
          if (event.key === 'Enter') {
            event.preventDefault()
            insertText('\n')
          } else if (event.key === 'Backspace' || event.key === 'Delete') {
            const selection = getOffsets(editorRef.current)
            if (selection.start !== selection.end) return
            const token = findSkills(valueRef.current, skills).find((item) =>
              event.key === 'Backspace'
                ? item.end === selection.start
                : item.start === selection.start
            )
            if (!token) return
            event.preventDefault()
            const next = valueRef.current.slice(0, token.start) + valueRef.current.slice(token.end)
            emitChange(next, { start: token.start, end: token.start })
          }
        }}
        onPaste={(event) => {
          onPaste(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          insertText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
        }}
        onCopy={(event) => {
          const { start, end } = getOffsets(editorRef.current)
          if (start === end) return
          event.preventDefault()
          event.clipboardData.setData('text/plain', valueRef.current.slice(start, end))
        }}
        onCut={(event) => {
          const { start, end } = getOffsets(editorRef.current)
          if (start === end) return
          event.preventDefault()
          event.clipboardData.setData('text/plain', valueRef.current.slice(start, end))
          insertText('')
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) event.preventDefault()
        }}
      />
    </div>
  )
})

export default SkillComposer
