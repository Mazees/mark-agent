import { webApi } from './web-bridge.js'

export async function getWorkspaceContext(sessionId = '1') {
  const project = await webApi.codingRequest('/workspace/context', sessionId, {}, 'POST')
  return {
    project,
    workingMemoryText: project.memory ? JSON.stringify(project.memory) : '',
    codeRagText: `Proyek: ${project.name}\nWorkspace efektif: ${project.root}\nManifest: ${project.manifests.join(', ')}\nPackage manager: ${project.packageManager || 'belum diketahui'}\nScripts: ${JSON.stringify(project.scripts)}\nStruktur: ${project.structure.join(', ')}\nInstruksi yang berlaku:\n${project.instructions.map((item) => `${item.path}\n${item.content}`).join('\n\n')}`
  }
}
export async function saveWorkspaceWorkingMemory(sessionId, data) {
  return webApi.codingRequest('/workspace/memory', sessionId, { memory: data }, 'PATCH')
}
