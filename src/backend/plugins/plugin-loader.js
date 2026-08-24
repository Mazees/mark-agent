import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, ipcMain, shell } from '../electron-compat.js'
import { execSync } from 'child_process'

let loadedPlugins = []
let pluginHandlers = {}

export const getPluginsDir = () => {
  const docPath = app.getPath('documents')
  const pluginDir = path.join(docPath, 'Mark Plugins')
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true })
  }
  return pluginDir
}

export const loadPlugins = async () => {
  const pluginDir = getPluginsDir()
  loadedPlugins = []
  pluginHandlers = {}

  const folders = fs.readdirSync(pluginDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  for (const folder of folders) {
    const pluginPath = path.join(pluginDir, folder)
    const manifestPath = path.join(pluginPath, 'plugin.json')
    const indexPath = path.join(pluginPath, 'index.js')

    if (fs.existsSync(manifestPath) && fs.existsSync(indexPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        
        // Gunakan dynamic import (file://) untuk module eksternal di Windows
        // Cache-busting dengan timestamp agar selalu load file terbaru pas di-save
        const moduleUrl = pathToFileURL(indexPath).href + '?t=' + Date.now()
        const handler = await import(moduleUrl)
        
        const indexContent = fs.readFileSync(indexPath, 'utf8')
        
        manifest.folderPath = pluginPath
        
        // Daftarkan semua action ke dictionary global HANYA JIKA plugin diaktifkan
        if (manifest.isEnabled !== false && manifest.actions && Array.isArray(manifest.actions)) {
          manifest.actions.forEach(act => {
             // asumsikan handler di-export secara default
             if (handler.default && handler.default[act.name]) {
               pluginHandlers[act.name] = handler.default[act.name]
             }
             
             // Extract code from index.js for UI Editor
             const searchStr1 = `'${act.name}': async ({ query }) => {`
             const searchStr2 = `"${act.name}": async ({ query }) => {`
             const searchStr3 = `${act.name}: async ({ query }) => {`
             
             let startIdx = indexContent.indexOf(searchStr1)
             if (startIdx === -1) startIdx = indexContent.indexOf(searchStr2)
             if (startIdx === -1) startIdx = indexContent.indexOf(searchStr3)
             
             if (startIdx !== -1) {
               const len = startIdx === indexContent.indexOf(searchStr1) ? searchStr1.length : 
                           startIdx === indexContent.indexOf(searchStr2) ? searchStr2.length : searchStr3.length
               let i = startIdx + len
               let openBrackets = 1
               for (; i < indexContent.length; i++) {
                 if (indexContent[i] === '{') openBrackets++
                 if (indexContent[i] === '}') {
                   openBrackets--
                   if (openBrackets === 0) break
                 }
               }
               
               let rawCode = indexContent.substring(startIdx + len, i)
               // remove 4 spaces indentation if present
               act.code = rawCode.split('\n').map(l => l.startsWith('    ') ? l.substring(4) : l).join('\n').trim()
             }
          })
        }
        
        loadedPlugins.push(manifest)
      } catch (err) {
        console.error(`Gagal load plugin ${folder}:`, err)
      }
    }
  }
  return loadedPlugins
}

export const getLoadedPlugins = () => loadedPlugins
export const getPluginHandlers = () => pluginHandlers

// Inisialisasi IPC Bridge
export const executePlugin = async (action, query) => {
  if (pluginHandlers[action]) {
    try {
      const result = await pluginHandlers[action]({ query })
      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
  return { success: false, error: 'Action tidak ditemukan' }
}

export const togglePlugin = async (pluginName, isEnabled) => {
  const pluginPath = path.join(getPluginsDir(), pluginName)
  const manifestPath = path.join(pluginPath, 'plugin.json')
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.isEnabled = isEnabled
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    await loadPlugins()
    return { success: true }
  }
  return { success: false, error: 'Plugin not found' }
}

export const createPlugin = async (payload) => {
  try {
    const { name, description, actions, isEdit } = payload
    const kebabPluginName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    
    const pDir = getPluginsDir()
    const newPluginDir = path.join(pDir, kebabPluginName)
    
    if (!isEdit && fs.existsSync(newPluginDir)) {
      return { success: false, error: 'Plugin dengan nama tersebut sudah ada' }
    }
    
    fs.mkdirSync(newPluginDir, { recursive: true })
    
    const manifestActions = actions.map(act => ({
      name: act.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      description: act.description,
      triggerHint: act.triggerHint,
      code: act.code
    }))

    const manifest = {
      name: kebabPluginName,
      version: "1.0.0",
      description: description,
      dependencies: payload.dependencies ? payload.dependencies.split(',').map(d => d.trim()).filter(d => d) : [],
      actions: manifestActions
    }
    
    fs.writeFileSync(path.join(newPluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2))
    
    let codeTemplate = `module.exports = {\n`
    actions.forEach((act, index) => {
      const actionKebabName = act.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
      codeTemplate += `  '${actionKebabName}': async ({ query }) => {\n${act.code.split('\\n').map(line => '    ' + line).join('\\n')}\n  }`
      if (index < actions.length - 1) codeTemplate += `,\n`
      else codeTemplate += `\n`
    })
    codeTemplate += `}`
    
    fs.writeFileSync(path.join(newPluginDir, 'index.js'), codeTemplate)

    // Install dependencies if specified
    if (manifest.dependencies.length > 0) {
      try {
        if (!fs.existsSync(path.join(newPluginDir, 'package.json'))) {
          execSync('npm init -y', { cwd: newPluginDir, stdio: 'ignore' })
        }
        execSync(`npm install ${manifest.dependencies.join(' ')}`, { cwd: newPluginDir, stdio: 'ignore' })
      } catch (npmErr) {
        console.error('Gagal install dependencies:', npmErr)
        return { success: false, error: 'Gagal menginstall dependencies npm: ' + npmErr.message }
      }
    }
    
    await loadPlugins()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export const deletePlugin = async (pluginName) => {
  try {
    const pluginPath = path.join(getPluginsDir(), pluginName)
    if (fs.existsSync(pluginPath)) {
      fs.rmSync(pluginPath, { recursive: true, force: true })
      await loadPlugins()
      return { success: true }
    }
    return { success: false, error: 'Plugin tidak ditemukan' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export const initPluginIPC = () => {
  ipcMain.handle('plugin:get-list', () => loadedPlugins)
  ipcMain.handle('plugin:execute', async (event, action, query) => executePlugin(action, query))
  ipcMain.handle('plugin:open-folder', () => shell.openPath(getPluginsDir()))
  ipcMain.handle('plugin:toggle', async (event, pluginName, isEnabled) => togglePlugin(pluginName, isEnabled))
  ipcMain.handle('plugin:open-specific-folder', (event, targetPath) => shell.openPath(targetPath))
  ipcMain.handle('plugin:reload', async () => loadPlugins())
  ipcMain.handle('plugin:create', async (event, payload) => createPlugin(payload))
  ipcMain.handle('plugin:delete', async (event, pluginName) => deletePlugin(pluginName))
}
