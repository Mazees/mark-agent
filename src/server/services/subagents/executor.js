import {
  createProgressGuard,
  createVerificationGate,
  verificationStepsFromMessages
} from '../../../shared/agent/execution-quality.js'
import { resolveEffort } from '../../../shared/agent/effort.js'
import {
  buildSkillCatalog,
  parseSkillRequest,
  restoreSkillContext,
  skillSummary
} from '../../../shared/skill-context.js'
import { countTokens } from 'gpt-tokenizer'
import { jsonrepair } from 'jsonrepair'
import { buildSubagentSystemPrompt } from '../../../shared/agent/subagent-prompt.js'
import { CODING_INSTRUCTIONS } from '../../../shared/agent/coding-prompt.js'
import { projectContext } from '../coding-workspace.js'

export const forbiddenTools = new Set([
  'spawn_subagent',
  'kill_subagent',
  'wait_subagents',
  'send_message',
  'create_agent_task',
  'mark_done_task',
  'resume_agent_task',
  'update_task_plan'
])

export function normalizeCompletion(result) {
  let content = result?.content || ''
  let calls = result?.toolCalls || result?.tool_calls || []
  if (!calls.length && typeof content === 'string') {
    const candidate = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    try {
      const data = JSON.parse(jsonrepair(candidate))
      const actions = data.tool_calls || (data.action ? [data.action] : [])
      if (actions.length)
        calls = actions.map((action, index) => ({
          id: action.id || `fallback_${Date.now()}_${index}`,
          type: 'function',
          function: {
            name: action.function?.name || action.tool || action.name,
            arguments:
              typeof action.function?.arguments === 'string'
                ? action.function.arguments
                : JSON.stringify(
                    action.function?.arguments || action.query || action.arguments || {}
                  )
          }
        }))
      if (data.answer != null)
        content = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer)
    } catch {
      /* Provider may return a normal final answer. */
    }
  }
  return { content: typeof content === 'string' ? content : JSON.stringify(content), calls }
}

export async function compactMessages(messages, fetch, options) {
  let payload = messages.map((m) => ({
    role: m.role,
    content: m.content || '',
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
  }))
  const count = () => countTokens(JSON.stringify(payload))
  if (count() < 230400) return payload
  payload = payload.map((m, index) =>
    m.role === 'tool' && index < payload.length - 8
      ? { ...m, content: String(m.content).slice(0, 200) }
      : m
  )
  if (count() < 230400) return payload
  let boundary = Math.max(1, payload.length - 8)
  while (boundary > 1 && payload[boundary]?.role === 'tool') boundary--
  const old = payload.slice(1, boundary)
  const summary = await fetch(
    [
      {
        role: 'system',
        content:
          'Ringkas checkpoint pekerjaan: tujuan, fakta, hasil tool, path artefak, kesalahan, dan hal yang belum selesai. Jangan mengarang hasil.'
      },
      { role: 'user', content: JSON.stringify(old) }
    ],
    false,
    { ...options, isSmallTask: true }
  )
  const text = typeof summary === 'string' ? summary : summary?.content
  if (!text) throw new Error('Konteks penuh dan checkpoint tidak berhasil diringkas.')
  payload = [
    payload[0],
    { role: 'user', content: `[CHECKPOINT KONTEKS]: ${text}` },
    ...payload.slice(boundary)
  ]
  if (count() >= 256000)
    throw new Error('Konteks pekerjaan melebihi kapasitas. Perlu peninjauan Mark.')
  return payload
}

export function createJobExecutor({ fetch, schemas, dispatch, config, skills = null }) {
  return async function executeJob(ctx) {
    const project = await projectContext(ctx.job.parentSessionId || '1')
    const available = await schemas()
    const agentTools = ctx.agent.allowedTools || ['*']
    const jobTools = ctx.job.allowedTools || agentTools
    const permitted = (list, name) => list.includes('*') || list.includes(name)
    const tools = available.filter(
      (t) =>
        !forbiddenTools.has(t.function.name) &&
        permitted(agentTools, t.function.name) &&
        permitted(jobTools, t.function.name)
    )
    const effortLevel = resolveEffort(ctx.job.effortLevel)
    const checkVerification = createVerificationGate()
    const checkProgress = createProgressGuard()
    const verification = () => checkVerification(verificationStepsFromMessages(ctx.messages()))
    const verificationNote = (missing) =>
      missing
        ? '\n\nCatatan pemeriksaan: ' +
          missing.instruction +
          ' Pemeriksaan hasil belum tersedia; jangan menganggap hasil ini terverifikasi.'
        : ''
    const allowed = new Set(tools.map((t) => t.function.name))
    const options = { config: config(), signal: ctx.signal, sessionId: `subagent_${ctx.runId}` }
    const catalog = skills ? await skills.catalog() : []
    const initialRefs = [...(ctx.job.skillRefs || [])]
    if (skills) {
      for (const name of parseSkillRequest(ctx.job.goal).names) {
        const skill = await skills.read(name)
        if (!initialRefs.some((ref) => ref.id === skill.id)) initialRefs.push(skillSummary(skill))
      }
      if (initialRefs.length) ctx.update({ skillRefs: initialRefs })
    }
    const system =
      buildSubagentSystemPrompt({ role: ctx.agent.role, goal: ctx.job.goal, effortLevel }) +
      '\n' +
      buildSkillCatalog(catalog) +
      `\nID agent: ${ctx.agent.id}; job_id: ${ctx.job.id}. Workspace: ${project.root}.\n` +
      `Kepemilikan berkas: ${JSON.stringify(ctx.job.ownedFiles || [])}. Checkpoint masukan: ${ctx.job.contextSummary || '(tidak ada)'}` +
      '\n' +
      CODING_INSTRUCTIONS +
      '\n' +
      JSON.stringify(project)

    while (true) {
      ctx.check()
      let history = ctx.messages()
      const results = new Set(history.filter((m) => m.role === 'tool').map((m) => m.tool_call_id))
      const unresolved = history
        .flatMap((m) => m.tool_calls || [])
        .filter((call) => !results.has(call.id))
      if (unresolved.length) {
        let progressWarning = false
        for (const call of unresolved) {
          ctx.check()
          const name = call.function?.name
          let args
          try {
            args = JSON.parse(call.function.arguments || '{}')
          } catch {
            args = { raw: call.function.arguments }
          }
          if (!allowed.has(name)) {
            ctx.append({
              sender: 'tool',
              role: 'tool',
              tool_call_id: call.id,
              name,
              content: '[DITOLAK] Tool tidak diizinkan.'
            })
            continue
          }
          if (name === 'report_to_lead') {
            if (ctx.runtime.job(ctx.job.id).waitingForJobId) {
              ctx.append({
                sender: 'tool',
                role: 'tool',
                tool_call_id: call.id,
                name,
                content:
                  '[DITUNDA] Pertanyaan ke kolega belum terjawab. Evaluasi jawaban sebelum melaporkan hasil final.'
              })
              continue
            }
            if (!String(args.summary || '').trim()) {
              ctx.append({
                sender: 'tool',
                role: 'tool',
                tool_call_id: call.id,
                name,
                content: '[ERROR] Ringkasan akhir wajib diisi.'
              })
              continue
            }
            const { missing, retry } = verification()
            if (missing && retry) {
              ctx.append({
                sender: 'tool',
                role: 'tool',
                tool_call_id: call.id,
                name,
                content:
                  '[PEMERIKSAAN HASIL]: ' +
                  missing.instruction +
                  ' Gunakan bukti yang sudah ada jika cukup, atau jelaskan batas pemeriksaan.'
              })
              continue
            }
            const summary = args.summary + verificationNote(missing)
            // Complete every tool pair without executing later calls after a terminal report.
            for (const rest of unresolved.slice(unresolved.indexOf(call)))
              ctx.append({
                sender: 'tool',
                role: 'tool',
                tool_call_id: rest.id,
                name: rest.function?.name,
                content:
                  rest === call ? 'Laporan akhir tersimpan.' : 'Dilewati: pekerjaan sudah selesai.'
              })
            ctx.append({ sender: 'subagent', role: 'assistant', content: summary })
            return { answer: summary, artifact: args.artifact || null }
          }
          if (name === 'request_lead_input') {
            ctx.append({
              sender: 'tool',
              role: 'tool',
              tool_call_id: call.id,
              name,
              content: 'Permintaan keputusan disimpan. Pekerjaan menunggu Mark atau pengguna.'
            })
            return {
              wait: {
                status: 'waiting_user',
                error: args.question || 'Agent meminta keputusan Mark.'
              }
            }
          }
          ctx.phase('using_tool', name)
          let result
          try {
            if (name === 'message_agent') {
              const message = ctx.runtime.sendMessage(
                args.target_agent || args.targetAgent,
                {
                  requestId: `${ctx.job.id}_${call.id}`,
                  message: args.message,
                  kind: args.kind || 'info',
                  replyTo: args.reply_to,
                  jobId: args.job_id
                },
                ctx.job.id
              )
              result = {
                success: true,
                data: { messageId: message.id, jobId: message.targetJobId, status: message.status }
              }
            } else if (name === 'list_subagents') {
              result = {
                success: true,
                data: ctx.runtime.profiles().map((p) => ({
                  id: p.id,
                  name: p.name,
                  role: p.role,
                  jobId: p.activeJobId,
                  status: p.status
                }))
              }
            } else {
              result = await dispatch(name, args, ctx, call)
              if (result?.wait) return result
            }
          } catch (error) {
            ctx.check()
            result = { success: false, error: error.message }
          }
          ctx.check()
          const image =
            result?.dataUrl ||
            result?.image ||
            result?.screenshot ||
            result?.imageUrl ||
            result?.data?.dataUrl ||
            result?.data?.screenshot
          const visual =
            typeof image === 'string' &&
            (image.startsWith('data:image/') || image.startsWith('http'))
              ? image
              : null
          const persistedResult =
            result?.skill && !result.skill.isResource
              ? { success: result.success, data: { ...skillSummary(result.skill), loaded: true } }
              : result
          const text = JSON.stringify(persistedResult, (key, value) =>
            typeof value === 'string' && value.startsWith('data:image/')
              ? '[Gambar diteruskan ke observasi visual]'
              : value
          )
          ctx.toolResult({
            sender: 'tool',
            role: 'tool',
            tool_call_id: call.id,
            name,
            content: text,
            action: visual ? { imageUrl: visual } : null
          })
          const progress = checkProgress(name, args, text, result?.success !== false)
          if (progress.stalled) {
            for (const rest of unresolved.slice(unresolved.indexOf(call) + 1))
              ctx.append({
                sender: 'tool',
                role: 'tool',
                tool_call_id: rest.id,
                name: rest.function?.name,
                content: '[DILEWATI] Pekerjaan dijeda karena tindakan berulang tanpa kemajuan.'
              })
            return {
              wait: {
                status: 'waiting_user',
                error:
                  'Tindakan berulang tidak menghasilkan kemajuan. Perlu arahan Mark sebelum mencoba lagi.'
              }
            }
          }
          if (progress.warn) progressWarning = true
        }
        if (progressWarning)
          ctx.append({
            sender: 'runtime',
            role: 'user',
            content:
              '[KEMAJUAN PEKERJAAN]: Hasil tindakan sama sudah berulang. Gunakan bukti baru atau pendekatan yang relevan; jangan mengulang tindakan identik.'
          })
        // Keep all tool results adjacent before adding visual observations for their batch.
        const all = ctx.messages()
        const unresolvedIds = new Set(unresolved.map((c) => c.id))
        const batches = all.filter((m) => m.tool_calls?.some((c) => unresolvedIds.has(c.id)))
        const ids = new Set(batches.flatMap((m) => m.tool_calls.map((c) => c.id)))
        const visuals = all.filter((m) => ids.has(m.tool_call_id) && m.action?.imageUrl)
        if (visuals.length)
          ctx.append({
            sender: 'tool-observation',
            role: 'user',
            content: [
              { type: 'text', text: 'Observasi visual aktual dari tool pada langkah ini.' },
              ...visuals.map((m) => ({ type: 'image_url', image_url: { url: m.action.imageUrl } }))
            ]
          })
      }
      ctx.inbox()
      const current = ctx.runtime.job(ctx.job.id)
      if (current.waitingForJobId)
        return {
          wait: {
            status: 'waiting_peer',
            waitDeadline: current.waitDeadline || Date.now() + 120000
          }
        }
      history = ctx.messages()
      ctx.phase('thinking')
      ctx.update({ turnCount: (current.turnCount || 0) + 1 })
      let messages = await compactMessages(
        [{ role: 'system', content: system }, ...history],
        fetch,
        options
      )
      if (skills) {
        const active = await Promise.all(
          (ctx.runtime.job(ctx.job.id).skillRefs || []).map((ref) => skills.read(ref.id))
        )
        messages = restoreSkillContext(messages, active)
        if (countTokens(JSON.stringify(messages)) >= 256000)
          throw new Error('Instruksi skill aktif melebihi kapasitas konteks.')
      }
      const result = await fetch(messages, true, { ...options, tools })
      ctx.check()
      const { content, calls } = normalizeCompletion(result)
      if (result?.meta?.await_user) {
        ctx.append({ sender: 'subagent', role: 'assistant', content })
        return {
          wait: {
            status: 'waiting_user',
            error: content || 'Agent membutuhkan informasi pengguna.'
          }
        }
      }
      if (calls.length) {
        ctx.append({
          sender: 'subagent',
          role: 'assistant',
          content: content || '',
          thought: result?.reasoning || null,
          tool_calls: calls
        })
        continue
      }
      // A message arriving during inference must be handled before accepting the final answer.
      if (ctx.inbox().length) continue
      if (!content.trim()) throw new Error('Model mengembalikan jawaban kosong tanpa aksi.')
      const { missing, retry } = verification()
      if (missing && retry) {
        ctx.append({
          sender: 'runtime',
          role: 'user',
          content:
            '[PEMERIKSAAN HASIL]: ' +
            missing.instruction +
            ' Gunakan bukti yang sudah tersedia; jika pemeriksaan tidak dapat dilakukan, jelaskan kendalanya.'
        })
        continue
      }
      const answer = content + verificationNote(missing)
      ctx.append({
        sender: 'subagent',
        role: 'assistant',
        content: answer,
        thought: result?.reasoning || null
      })
      return { answer }
    }
  }
}
