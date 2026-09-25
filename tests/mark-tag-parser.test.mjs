import assert from 'node:assert/strict'
import {
  parseMarkTag,
  stripMarkTags,
  createMarkStreamFilter,
  MARK_TAG_SCHEMA
} from '../src/shared/parsers/mark-tag-parser.js'

console.log('Testing mark-tag-parser.js...')

// 1. Test parseMarkTag standard
{
  const input = '<mark mood="happy" done="true" />Halo dunia! Ini respon saya.'
  const res = parseMarkTag(input)
  assert.equal(res.meta.mood, 'joy') // 'happy' dinormalisasi ke mood avatar 'joy'
  assert.equal(res.meta.done, true)
  assert.equal(res.cleanContent, 'Halo dunia! Ini respon saya.')
  console.log('Test 1 Passed: standard tag & mood normalization')
}

// 2. Test parseMarkTag done=false and case-insensitivity
{
  const input = '<MARK MOOD="Thinking" DONE="false"/>Saya sedang berpikir dan butuh tool.'
  const res = parseMarkTag(input)
  assert.equal(res.meta.mood, 'thinking')
  assert.equal(res.meta.done, false)
  assert.equal(res.cleanContent, 'Saya sedang berpikir dan butuh tool.')
  console.log('Test 2 Passed: case-insensitivity & done=false')
}

// 3. Test parseMarkTag with reasoning <think>
{
  const input =
    '<think>Ini CoT reasoning internal.</think><mark mood="sarcasm" done="true" />Bagus sekali kodenya.'
  const res = parseMarkTag(input)
  assert.equal(res.meta.mood, 'sarcasm')
  assert.equal(res.meta.done, true)
  assert.equal(res.reasoning, 'Ini CoT reasoning internal.')
  assert.equal(res.cleanContent, 'Bagus sekali kodenya.')
  console.log('Test 3 Passed: CoT reasoning extraction')
}

// 4. Test invalid mood fallback to default
{
  const input = '<mark mood="hyper_furious" done="true" />Teks respons.'
  const res = parseMarkTag(input)
  assert.equal(res.meta.mood, 'neutral')
  assert.equal(res.meta.done, true)
  console.log('Test 4 Passed: invalid mood fallback')
}

// 5. Test strip legacy tags
{
  const input = '<mood:happy>Halo teman [mood:sad] <done> selesai</done>'
  const clean = stripMarkTags(input)
  assert.equal(clean, 'Halo teman   selesai')
  const parsed = parseMarkTag(input)
  assert.equal(parsed.meta.mood, 'neutral') // legacy mood not parsed functionally
  assert.equal(parsed.meta.done, false)
  console.log('Test 5 Passed: legacy tags stripped and not functionally parsed')
}

// 6. Test stream filter with fragmented chunks
{
  let metaReceived = null
  let textReceived = ''

  const filter = createMarkStreamFilter({
    onMeta: (meta) => {
      metaReceived = meta
    },
    onChunk: (chunk) => {
      textReceived += chunk
    }
  })

  const streamChunks = ['<mar', 'k mood="excited" ', 'done="false" />\n\nHa', 'lo ', 'dunia!']
  for (const chunk of streamChunks) {
    filter.write(chunk)
  }
  filter.flush()

  assert.deepEqual(metaReceived, { mood: 'excited', done: false })
  assert.equal(textReceived, 'Halo dunia!')
  console.log('Test 6 Passed: stream filter chunk fragmentation')
}

// 7. Test stream filter without mark tag (plain text)
{
  let metaReceived = null
  let textReceived = ''

  const filter = createMarkStreamFilter({
    onMeta: (meta) => {
      metaReceived = meta
    },
    onChunk: (chunk) => {
      textReceived += chunk
    }
  })

  filter.write('Halo, saya langsung bicara tanpa tag.')
  filter.flush()

  assert.deepEqual(metaReceived, { mood: 'neutral', done: false })
  assert.equal(textReceived, 'Halo, saya langsung bicara tanpa tag.')
  console.log('Test 7 Passed: stream filter plain text fallback')
}

console.log('All tests passed successfully!')
