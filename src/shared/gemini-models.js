export const DEFAULT_GEMINI_WEB_MODEL = 'gemini-3.6-flash'
export const GEMINI_WEB_MODELS = {
  'gemini-3.8-flash': {
    mode: 1,
    think: 4,
    header: '56fdd199312815e2',
    label: 'Gemini 3.8 Flash',
    requiresLogin: true,
    expected: '3.8 Flash'
  },
  'gemini-3.8-flash-thinking': {
    mode: 1,
    think: 0,
    extended: true,
    header: '56fdd199312815e2',
    label: 'Gemini 3.8 Flash · Thinking',
    requiresLogin: true,
    expected: '3.8 Flash'
  },
  'gemini-4-argon': {
    mode: 8,
    think: 4,
    header: '95a4c0abcba24364',
    label: 'Gemini 4 Argon',
    requiresLogin: true,
    expected: 'Argon'
  },
  'gemini-4-argon-thinking': {
    mode: 8,
    think: 0,
    extended: true,
    header: '95a4c0abcba24364',
    label: 'Gemini 4 Argon · Thinking',
    requiresLogin: true,
    expected: 'Argon'
  },
  'gemini-3.6-flash': { mode: 1, think: 4, header: 'fbb127bbb056c959', label: 'Gemini 3.6 Flash' },
  'gemini-3.5-flash': {
    mode: 1,
    think: 4,
    header: 'fbb127bbb056c959',
    label: 'Gemini 3.5 Flash (legacy)'
  },
  'gemini-3.5-flash-thinking': {
    mode: 2,
    think: 0,
    header: 'fbb127bbb056c959',
    label: 'Gemini 3.5 Flash · Thinking (legacy)'
  },
  'gemini-3.5-flash-thinking-lite': {
    mode: 5,
    think: 0,
    header: 'fbb127bbb056c959',
    label: 'Gemini 3.5 Flash · Thinking Lite (legacy)'
  },
  'gemini-auto': { mode: 4, think: 4, header: 'fbb127bbb056c959', label: 'Otomatis (Google)' },
  'gemini-flash-lite': { mode: 6, think: 4, header: 'cf41b0e0dd7d53e5', label: 'Gemini Flash Lite' }
}
