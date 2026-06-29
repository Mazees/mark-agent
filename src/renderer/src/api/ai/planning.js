import { fetchAI, cleanAndParse } from './core'
import { getAllConfig } from '../db'
import { getCurrentTimeInfo } from './utils'

// Inline helper to get plugin actions (replaces pluginHelper.js)
const getPluginActions = async () => {
  try {
    const plugins = await window.api.getPlugins()
    if (!plugins || plugins.length === 0) return []
    const actions = []
    plugins.forEach((plugin) => {
      if (plugin.actions) {
        plugin.actions.forEach((act) => {
          actions.push({ name: act.name, description: act.description, triggerHint: act.triggerHint })
        })
      }
    })
    return actions
  } catch (e) {
    console.error(e)
    return []
  }
}

export const getPlan = async (
  userInput,
  isWebSearch,
  signal,
  chatSession = [],
  memoryReference = [],
  contextMsg = ''
) => {
  try {
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}
    const pluginActions = await getPluginActions()

    // Build plugin capabilities string for the prompt
    const pluginCapabilities = pluginActions.length > 0
      ? pluginActions.map(a => `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`).join('\n')
      : ''

    const systemPrompt = `
You are Mark, a smart, assertive, and straightforward local assistant. Address the user as "bro".
Personality and Communication Style: ${conf.personality || 'Casual like a friend, likes to joke around.'}
${contextMsg ? `\n# CURRENT CONTEXT\n${contextMsg}\nCRITICAL: Even if the user is asking from WhatsApp, you have full access to execute commands on the host Windows machine using the tools provided below!` : ''}

Your main task here is to design (plan) systematic steps to execute the user's instructions.
Break instructions into an ordered array of small tasks. If your model has reasoning capabilities (<think>), think in accordance with your personality and communication style!

# CURRENT DATE & TIME
${getCurrentTimeInfo()}

# USER MEMORY
${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'No relevant memory found.'}
Use the memory data above as a reference if the user's instructions mention pronouns or references ("that", "my favorite", "earlier", etc).


# AVAILABLE CAPABILITIES / TOOLS
The system has the following capabilities:
- search: Search for general information on Google. This tool will browse Google search by opening the top 5 websites and Google's AI summary, then summarize findings from all 5 sites and the AI summary. However, this tool cannot explicitly open a specific page directly.
- yt-search: Search for videos on YouTube. This feature retrieves titles, IDs, and duration but cannot read video content.
- yt-summary: Summarize video content from a YouTube link.
- music-play: Play songs on YouTube Music.
- music-toggle: Pause or resume the current song.
- music-search: Search for a specific song on YT Music.
- summary: Identify, filter, or summarize data from a previous step.
- screenshot: Take a screenshot of the computer screen (returns image directly).
${pluginCapabilities ? pluginCapabilities + '\n' : ''}
CRITICAL RULE FOR PLUGINS: Only use tools/plugins when EXPLICITLY requested in the user's LAST message. Previous messages are ONLY conversation context. If the LAST message is casual or does not give a new instruction, you MUST use action "none".
Design a logical plan that *can be* executed using a combination of the capabilities above.

# JIT QUERY GENERATION RULES
1. Output MUST be ONLY a valid JSON with a "plan" property containing an array of objects.
2. Each object must have "task" (short sentence description), "action" (tool name from the list above), "query" (text parameter for the tool), and "is_dynamic" (boolean).
3. Set "is_dynamic" to true IF AND ONLY IF "query" absolutely depends on the text result of a previous task that is not yet known. If true, leave "query" as an empty string.
4. If the task can be executed directly without waiting for previous results (e.g., searching for weather, playing a specific song, or searching the web), formulate "query" with the correct keywords and set "is_dynamic" to false.
5. WEB SEARCH USAGE: Use Web Search ("search") ONLY for searching real-time information, news, product prices, or latest public facts. DO NOT use it for coding/basic theory, just use "summary".
6. FAST BYPASS (SINGLE TOOL): If the user's instruction ONLY requires 1 tool usage (e.g., just setting volume, just playing music), RETURN an empty plan array '{"plan": []}', AND fill the 'command' field with the tool details, AND fill 'direct_answer' with the textual response!
# OUTPUT EXAMPLE
Output: 
\`\`\`json
{
  "plan": [
    { "task": "Cari pemenang piala dunia 2022", "action": "search", "query": "pemenang piala dunia 2022", "is_dynamic": false },
    { "task": "Putar lagu kebangsaan negara pemenang", "action": "music-play", "query": "", "is_dynamic": true }
  ]
}
\`\`\`
`
    console.log(systemPrompt)
    const previousTurns = chatSession.length > 0 ? chatSession.slice(0, -1) : []
    const lastUserMsg =
      chatSession.length > 0
        ? chatSession[chatSession.length - 1]
        : { role: 'user', content: userInput }

    const messages = [{ role: 'system', content: systemPrompt }, ...previousTurns, lastUserMsg]
    const schema = {
      type: 'object',
      properties: {
        plan: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              action: {
                type: 'string',
                enum: [
                  'search',
                  'music-play',
                  'music-search',
                  'music-next',
                  'music-prev',
                  'music-toggle',
                  'yt-search',
                  'yt-summary',
                  'summary',
                  'screenshot',
                  'none',
                  ...pluginActions.map(a => a.name)
                ]
              },
              query: { type: 'string' },
              is_dynamic: { type: 'boolean' }
            },
            required: ['task', 'action', 'query', 'is_dynamic'],
            additionalProperties: false
          }
        },
        direct_answer: {
          type: ['string', 'null'],
          description: 'Berikan balasan natural JIKA plan kosong. CRITICAL: JIKA user memberikan info untuk diingat, biarkan INI NULL!'
        },
        command: {
          type: ['object', 'null'],
          description: 'Jika kamu menggunakan FAST BYPASS (plan kosong tapi butuh 1 tool), isi nama tool di action dan parameter di query.',
          properties: {
            action: { type: 'string' },
            query: { type: 'string' }
          }
        }
      },
      required: ['plan', 'direct_answer', 'command'],
      additionalProperties: false
    }

    console.log('\n=== GETPLAN SYSTEM PROMPT ===')
    console.log(systemPrompt)
    console.log('=============================\n')

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (data && Array.isArray(data.plan)) {
      return { 
        plan: data.plan, 
        direct_answer: data.direct_answer, 
        command: data.command,
        reasoning: response.reasoning 
      }
    }
    return { plan: [], direct_answer: null, command: null }
  } catch (error) {
    console.error('Error in getPlan:', error)
    throw error
  }
}


export const getTaskAction = async (task, previousContext, isWebSearch, signal) => {
  try {
    const pluginActions = await getPluginActions()

    // Build plugin actions string for the ACTION LIST
    const pluginActionsList = pluginActions.length > 0
      ? pluginActions.map(a => `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`).join('\n')
      : ''

    const systemPrompt = `
You are Mark, a smart AI assistant.
Your task is to determine ONE action that the system must execute to complete the current task, based on previous context history (if available).

# CURRENT DATE & TIME
${getCurrentTimeInfo()}

# ACTION LIST
${isWebSearch ? '- search: Perform a general web search (Google) to find info, tutorials, coding, news, etc.' : ''}
- music-play: Play a song (ONLY if the task is related to music/songs).
- music-search: Search for song titles/playlists (ONLY if the task is related to music/songs).
- music-next: Skip to the next song.
- music-prev: Go back to the previous song.
- music-toggle: Pause or resume a song.
- yt-search: Search for tutorial or entertainment videos on YouTube.
- yt-summary: Summarize YouTube video content.
- summary: Summarize/answer the task directly using your knowledge (without searching), useful for coding or basic theory.
- none: No relevant action.
${pluginActionsList}

CRITICAL RULE FOR PLUGINS: Only use tools/plugins when EXPLICITLY requested in the user's LAST message. Previous messages are ONLY conversation context.

# RULES
1. Output MUST be valid JSON with the format { "action": "action-name", "query": "string" }.
2. Use "previousContext" to complete the "query". Example: if previousContext says "The hit song is Kangen", and the task is "Play the song", then the query should be "Kangen Dewa 19", not just "song".
3. SPECIFICALLY for the "yt-summary" action, the query MUST contain the YouTube URL/Link from previousContext. Do not fill it with a video title or search keywords.
`
    const userPrompt = `
# PREVIOUS CONTEXT (Summary of previous tasks)
${previousContext.length > 0 ? previousContext.join('\\\\n') : 'None yet.'}

# CURRENT TASK
${task}

# INSTRUCTION
Determine the action and its query.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'search',
            'music-play',
            'music-search',
            'music-next',
            'music-prev',
            'music-toggle',
            'yt-search',
            'yt-summary',
            'summary',
            'none',
            ...pluginActions.map(a => a.name)
          ]
        },
        query: { type: 'string' }
      },
      required: ['action', 'query'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    if (!data) throw new Error('Failed to parse getTaskAction AI response into valid JSON. Output: ' + response.content)
    return data
  } catch (error) {
    console.error('Error in getTaskAction:', error)
    throw error
  }
}


export const getTaskSummary = async (task, actionResult, previousContext, signal) => {
  try {
    const systemPrompt = `
You are an executor and summarizer assistant.
Your task is to complete and summarize the execution of a task.
Output ONLY a summary/answer that is DEEPLY THOROUGH and COMPREHENSIVE (multiple paragraphs are allowed). Perform deep analysis, dissect the information in detail. Never answer with a sentence like "The task has been completed". Provide REAL, highly informative RESULTS!
`
    const userPrompt = `
# PREVIOUS CONTEXT
${previousContext && previousContext.length > 0 ? previousContext.join('\\\\n') : 'None yet.'}

# CURRENT TASK
${task}

# SYSTEM / TOOL RESULT
${JSON.stringify(actionResult)}

Create an informative 1-sentence summary from the system result above to answer the current task.
If the system result provides a list of URLs/Links (such as YouTube or web results), you MUST select and include at least 1 best URL in your summary so the URL can be used in the next step. Do not let the URL get lost!
If the system result is only an internal thought, use the Previous Context to summarize and answer the task.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
    const response = await fetchAI(messages, signal, true)
    return response.content.trim()
  } catch (error) {
    console.error('Error in getTaskSummary:', error)
    return 'Task execution completed.'
  }
}


export const getPlanConclusion = async (
  userInput,
  taskSummaries,
  signal,
  chatSession = [],
  memoryReference = []
) => {
  try {
    const config = await getAllConfig()
    const systemPrompt = `
You are Mark, a smart, assertive, and straightforward local assistant. Address the user as "bro".
Personality and Communication Style: ${config[0]?.personality || 'Casual like a friend, likes to joke around.'}

LANGUAGE RULE: You MUST ALWAYS reply in the SAME LANGUAGE the user is using.

# CURRENT DATE & TIME
${getCurrentTimeInfo()}

# MEMORY REFERENCE (Existing memories)
${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Empty.'}

# WRITING & COMMUNICATION STYLE RULES
1. **ADAPTIVE BASED ON THE QUESTION**: 
   - If the user asks for a full summary of a video/text, provide a LONG and COMPREHENSIVE answer complete with *timestamps* (if available in the Execution History).
   - However, if the user ONLY asks for specific information (e.g., "What's the initial capital from this video?"), answer the question *to-the-point* and logically WITHOUT summarizing the entire video.
2. **PROFESSIONAL BUT CASUAL**: Maintain your communication style (address as "bro", be assertive), but don't overdo the slang. Stay focused on the substance of the information.
3. **FORMATTING**: Use neat paragraphs and bullet points (markdown \`-\` or \`*\`).
4. **SOURCE PRIORITY**: Use data from "Execution History" as the primary reference. Add your own insights to enrich the explanation if needed.
5. **VOICE-EXPRESSIVE**: Write "answer" as if you are speaking (it will be read aloud by TTS).

# AUTO-MEMORY EVALUATION (CRITICAL)
Your main task is to summarize the system's work results, BUT you must also self-evaluate: "Is there any important information about the user from this conversation or work results that is worth saving?"
1. You MUST ONLY save memories about the USER (hobbies, preferences, traits, routines, personal life) OR notes/reminders/schedules/to-do lists that are explicitly requested.
2. STRICTLY PROHIBITED from saving general facts from the internet, lessons, tutorials, recipes, song lyrics, news, or programming code.
3. PROHIBITED from saving if the info already exists or is similar in Memory Reference.
4. If there IS user info worth saving/updating, fill the "memory" property. You MUST write the 'memory' content in the SAME LANGUAGE the user is using.
5. If there is NONE, you must set "memory" to null.
6. You MUST write the 'memory' content as a FULL DESCRIPTIVE SENTENCE. (Wrong example: "Mada". Correct example: "The user's name is Mada"). This is crucial so the vector system can match context keywords (like the word "name").
7. If the memory is a note, event, or info that needs time context, you MUST include the current Date & Time within the memory sentence. (Example: "On June 9, 2026, the user said that...")

# OUTPUT MUST BE JSON
{
  "answer": "string (Long, substantive, and comprehensive explanation)",
  "memory": { "id": number|null, "type": "profile|preference|skill|project|transaction|goal|relationship|fact|other", "key": "string", "memory": "string", "action": "insert|update|delete" } or null
}
`
    const userPrompt = `
User's Original Instruction: "${userInput}"

Execution History (Summary):
${taskSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Provide your final response in JSON format according to the schema.
`
    const previousTurns = chatSession.length > 0 ? chatSession.slice(0, -1) : []
    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        memory: {
          type: ['object', 'null'],
          properties: {
            action: { type: 'string' },
            key: { type: 'string' },
            memory: { type: 'string' },
            oldKey: { type: 'string' }
          },
          required: ['action', 'key', 'memory', 'oldKey'],
          additionalProperties: false
        }
      },
      required: ['answer', 'memory'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (!data) throw new Error('Failed to parse AI response into valid JSON.')
    return {
      answer: data.answer || 'Task completed bro!',
      memory: data.memory || null,
      reasoning: response.reasoning
    }
  } catch (error) {
    console.error('Error in getPlanConclusion:', error)
    return {
      answer: 'Alright bro, I\'ve completed all your instructions!',
      memory: null,
      reasoning: null
    }
  }
}
