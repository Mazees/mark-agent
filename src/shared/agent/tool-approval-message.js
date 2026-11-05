export function toolApprovalMessage(tool, args, actorName, toolName) {
  const message = tool?.approvalMessage?.(args)
  return message
    ? message.replace(/^Mark(?=\s)/i, () => actorName)
    : `${actorName} meminta persetujuan untuk menjalankan ${toolName}.`
}
