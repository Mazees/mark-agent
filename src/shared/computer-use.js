export function validateComputerUseArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || 'query' in args)
    throw new Error(
      'Argumen computer_use wajib objek JSON sesuai schema, misalnya {"action":"open_session"}. Teks dan pembungkus query tidak diterima.'
    )
  if (args.actions !== undefined) {
    if (
      args.action !== undefined ||
      !Array.isArray(args.actions) ||
      !args.actions.length ||
      args.actions.length > 30
    )
      throw new Error(
        'Gunakan action untuk aksi tunggal atau actions berisi 1 hingga 30 objek aksi, bukan keduanya.'
      )
    for (const action of args.actions) {
      if (action?.actions !== undefined) throw new Error('Array actions tidak boleh bersarang.')
      validateComputerUseArgs(action)
      if (action.action === 'open_session')
        throw new Error('Buka sesi dengan {"action":"open_session"} sebagai aksi tunggal.')
    }
  } else if (
    typeof args.action !== 'string' ||
    !args.action.trim() ||
    args.action !== args.action.trim()
  ) {
    throw new Error(
      'Parameter action wajib diisi sesuai schema, misalnya {"action":"open_session"}.'
    )
  }
  return args
}

export function isComputerUseSessionOpen(tool, args) {
  if (!['computer_use', 'computer-use'].includes(tool)) return false
  try {
    return validateComputerUseArgs(args).action === 'open_session'
  } catch {
    return false
  }
}
