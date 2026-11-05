import {
  createAgentTask,
  getAgentTaskWithSteps,
  listAgentTasks,
  reviseAgentTask,
  workflowMutation,
  taskRequestId
} from '../../api/taskStore.js'

export function workflowMessage(task) {
  return {
    taskId: task.id,
    taskTitle: task.title,
    taskObjective: task.objective,
    taskStatus: task.status,
    taskSessionId: task.sessionId,
    planVersion: task.planVersion,
    artifactRoot: task.artifactRoot,
    plan: task.steps,
    currentStep: task.currentStepIndex,
    planRevisions: task.planRevisions
  }
}

export async function executeWorkflowTool({
  tool,
  args,
  context,
  activeSessionNum,
  userInput,
  durableTask,
  targetSetChatData,
  getCurrentTimeInfo,
  requestId
}) {
  const input = args && typeof args === 'object' ? args : {}
  const sessionId = String(context?.sessionId || activeSessionNum || 1)
  let task = durableTask
  try {
    if (tool === 'read_task' && !input.taskId && !task) {
      const tasks = await listAgentTasks({ sessionId })
      return {
        durableTask,
        durableActiveStep: null,
        res: {
          success: true,
          data: {
            tasks: tasks.map((item) => ({
              taskId: item.id,
              title: item.title,
              objective: item.objective,
              status: item.status,
              planVersion: item.planVersion,
              currentStepIndex: item.currentStepIndex,
              error: item.error,
              updatedAt: item.updatedAt
            })),
            instruction:
              'Daftar ini hanya milik sesi saat ini dan tidak mengaktifkan workflow. Baca checkpoint dengan read_task(taskId). Jika pengguna meminta melanjutkan, gunakan resume_agent_task dengan taskId dan planVersion dari snapshot. Jika target ambigu, minta pengguna memilih.'
          }
        }
      }
    }
    if (tool === 'create_agent_task') {
      if (task)
        throw new Error(
          'Workflow sudah tersedia. Gunakan update_task_plan untuk merevisi langkah mendatang.'
        )
      task = await createAgentTask({
        ...input,
        sessionId,
        contextSummary: userInput,
        objective: input.objective || userInput,
        requestId: requestId || taskRequestId()
      })
      targetSetChatData?.((prev) => [
        ...prev.filter((m) => !m.isThinking && m.id !== `plan-${task.id}`),
        {
          id: `plan-${task.id}`,
          role: 'ai',
          isPlanSteps: true,
          ...workflowMessage(task),
          timestamp: getCurrentTimeInfo?.(),
          created_at: Date.now()
        }
      ])
    } else {
      if (
        !['read_task', 'resume_agent_task'].includes(tool) &&
        (!task || (input.taskId && input.taskId !== task.id))
      )
        throw new Error('Lanjutkan workflow yang dipilih terlebih dahulu.')
      const id = input.taskId || task?.id
      if (!id) throw new Error('taskId wajib disertakan.')
      task = await getAgentTaskWithSteps(id)
      if (!task || (task.sessionId != null && String(task.sessionId) !== sessionId))
        throw new Error('Workflow tidak ditemukan dalam sesi ini.')
      if (tool === 'resume_agent_task') {
        if (durableTask && durableTask.id !== task.id)
          throw new Error('Selesaikan workflow aktif sebelum melanjutkan workflow lain.')
        if (!Number.isInteger(input.planVersion))
          throw new Error('Baca checkpoint melalui read_task dan sertakan planVersion.')
        task = await workflowMutation(task, 'control', {
          action: 'resume',
          planVersion: input.planVersion,
          requestId: requestId || taskRequestId()
        })
      }
      if (tool === 'mark_done_task')
        task = await workflowMutation(task, 'complete', {
          ...input,
          planVersion: input.planVersion ?? task.planVersion,
          requestId: requestId || taskRequestId()
        })
      if (tool === 'update_task_plan')
        task = await reviseAgentTask(task, { ...input, requestId: requestId || taskRequestId() })
      targetSetChatData?.((prev) => {
        const messages = prev.map((m) =>
          m.isPlanSteps && m.taskId === task.id ? { ...m, ...workflowMessage(task) } : m
        )
        if (
          tool === 'resume_agent_task' &&
          !messages.some((m) => m.isPlanSteps && m.taskId === task.id)
        )
          messages.push({
            id: `plan-${task.id}`,
            role: 'ai',
            isPlanSteps: true,
            ...workflowMessage(task),
            timestamp: getCurrentTimeInfo?.(),
            created_at: Date.now()
          })
        return messages
      })
      if (tool === 'update_task_plan')
        targetSetChatData?.((prev) => [
          ...prev.filter((m) => m.id !== `revision-${task.id}-${task.planVersion}`),
          {
            id: `revision-${task.id}-${task.planVersion}`,
            role: 'ai',
            content: `Rencana diperbarui: ${input.explanation}`,
            created_at: Date.now()
          }
        ])
    }
    const active = task.steps.find((s) => s.id === task.activeStepId) || null
    const selectedStep =
      tool === 'read_task' && input.stepIndex != null
        ? task.steps.find((s) => s.stepIndex + 1 === input.stepIndex)
        : null
    if (tool === 'read_task' && input.stepIndex != null && !selectedStep)
      throw new Error('Nomor langkah tidak ditemukan.')
    return {
      durableTask: tool === 'read_task' ? durableTask : task,
      durableActiveStep:
        tool === 'read_task'
          ? durableTask?.steps?.find((s) => s.id === durableTask.activeStepId) || null
          : active,
      res: {
        success: true,
        data: selectedStep
          ? {
              taskId: task.id,
              title: task.title,
              status: task.status,
              planVersion: task.planVersion,
              step: selectedStep
            }
          : {
              ...task,
              instruction:
                task.status === 'completed'
                  ? 'Checklist selesai. Susun jawaban penutup untuk pengguna berdasarkan hasil tersimpan.'
                  : task.status === 'running'
                    ? `Kerjakan hanya langkah aktif ${active?.stepIndex + 1}: ${active?.title}. Sebelum mengulang aksi yang hasilnya belum diketahui, periksa keadaan terakhir. Pertahankan hasil langkah selesai. Periksa hasil sesuai jenis pekerjaan. Ringkasan dan bukti wajib; berkas hanya bila diperlukan. Jika menugaskan Minibot, tunggu laporannya sebelum menyelesaikan langkah.`
                    : task.status === 'cancelled'
                      ? 'Workflow sudah berakhir dan tidak dapat dilanjutkan.'
                      : `Workflow berstatus ${task.status}. Jika pengguna meminta melanjutkan, panggil resume_agent_task dengan taskId dan planVersion ini sebelum bekerja. Jangan membuat workflow pengganti atau mengulang langkah selesai.`
            }
      }
    }
  } catch (error) {
    return {
      durableTask,
      durableActiveStep: durableTask?.steps?.find((s) => s.id === durableTask.activeStepId) || null,
      res: { success: false, error: error.message }
    }
  }
}
