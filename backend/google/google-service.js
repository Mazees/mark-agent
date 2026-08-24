import { app, shell } from '../electron-compat.js'
import { google } from 'googleapis'
import http from 'http'
import url from 'url'
import path from 'path'
import fs from 'fs/promises'

// File to store the OAuth tokens safely
const TOKEN_PATH = path.join(app.getPath('userData'), 'google-tokens.json')

// Scopes we need access to
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify'
]

export async function saveTokens(tokens) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens))
}

export async function getTokens() {
  try {
    const data = await fs.readFile(TOKEN_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return null
  }
}

/**
 * Validates and returns an authenticated OAuth2 client if tokens exist.
 */
export async function getAuthClient(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null
  
  const tokens = await getTokens()
  if (!tokens) return null

  const cleanId = clientId.trim()
  const cleanSecret = clientSecret.trim()

  const oAuth2Client = new google.auth.OAuth2(
    cleanId,
    cleanSecret,
    'http://localhost' // Redirect URI is not needed here once we have tokens
  )
  
  oAuth2Client.setCredentials(tokens)

  // Handle automatic token refresh
  oAuth2Client.on('tokens', async (newTokens) => {
    const currentTokens = await getTokens() || {}
    // Only update if we received new tokens (sometimes refresh_token is not sent back)
    if (newTokens.refresh_token) {
      currentTokens.refresh_token = newTokens.refresh_token
    }
    currentTokens.access_token = newTokens.access_token
    currentTokens.expiry_date = newTokens.expiry_date
    await saveTokens(currentTokens)
  })

  return oAuth2Client
}

let currentAuthServer = null

export async function connectGoogle(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    if (!clientId || !clientSecret) {
      return reject(new Error('Client ID and Client Secret are required.'))
    }

    const cleanId = clientId.trim()
    const cleanSecret = clientSecret.trim()

    if (currentAuthServer) {
      try { currentAuthServer.close() } catch (e) {}
      currentAuthServer = null
    }

    let oAuth2Client = null

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/oauth2callback') > -1) {
          const qs = new url.URL(req.url, 'http://127.0.0.1').searchParams
          const code = qs.get('code')
          
          if (!code) {
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Mark AI - Auth Failed</title>
                <style>
                  body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b110e; color: #ebecf0; font-family: 'Poppins', system-ui, sans-serif; }
                  .card { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(20px); padding: 40px; border-radius: 16px; text-align: center; border: 1px solid rgba(255, 82, 82, 0.3); box-shadow: 0 0 25px rgba(255, 82, 82, 0.15); }
                  .icon { width: 60px; height: 60px; background: #ff5252; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 30px; font-weight: bold; color: #000; box-shadow: 0 0 20px rgba(255, 82, 82, 0.4); }
                  h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0.5px; }
                  p { color: #cac9c9; margin: 0; }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </div>
                  <h1>Authentication Failed</h1>
                  <p>No code received from Google. Please try again.</p>
                </div>
              </body>
              </html>
            `)
            server.close()
            currentAuthServer = null
            return reject(new Error('No code received from Google.'))
          }

          const { tokens } = await oAuth2Client.getToken(code)
          await saveTokens(tokens)

          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Mark AI - Connected</title>
              <style>
                body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b110e; color: #ebecf0; font-family: 'Poppins', system-ui, sans-serif; }
                .card { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(20px); padding: 40px 50px; border-radius: 16px; text-align: center; box-shadow: 0 0 35px rgba(30, 184, 84, 0.2); border: 1px solid rgba(30, 184, 84, 0.3); animation: holo-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
                .icon { width: 65px; height: 65px; background: #1eb854; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 35px; color: #000; font-weight: bold; box-shadow: 0 0 20px rgba(30, 184, 84, 0.4); }
                h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0.5px; }
                p { color: #cac9c9; margin: 0; line-height: 1.6; }
                .loader { margin-top: 25px; font-size: 13px; color: #888; font-family: monospace; letter-spacing: 1px; }
                @keyframes holo-enter { 0% { opacity: 0; transform: scale(0.9) translateY(20px); filter: blur(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
                <h1>Authentication Successful</h1>
                <p>Mark AI is now connected to your Google Workspace.<br/>You can safely close this window.</p>
                <div class="loader">Closing tab automatically in 3 seconds...</div>
              </div>
              <script>setTimeout(() => window.close(), 3000)</script>
            </body>
            </html>
          `)
          server.close()
          currentAuthServer = null
          
          resolve(true)
        }
      } catch (e) {
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Mark AI - Error</title>
            <style>
              body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b110e; color: #ebecf0; font-family: 'Poppins', system-ui, sans-serif; }
              .card { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(20px); padding: 40px; border-radius: 16px; text-align: center; border: 1px solid rgba(255, 82, 82, 0.3); box-shadow: 0 0 25px rgba(255, 82, 82, 0.15); max-width: 500px; }
              .icon { width: 60px; height: 60px; background: #ff5252; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 30px; font-weight: bold; color: #000; box-shadow: 0 0 20px rgba(255, 82, 82, 0.4); }
              h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0.5px; }
              p { color: #cac9c9; margin: 0; line-height: 1.5; }
              .error-box { margin-top: 20px; padding: 15px; background: rgba(255, 82, 82, 0.05); border: 1px solid rgba(255, 82, 82, 0.2); border-radius: 8px; font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; color: #ff8f8f; text-align: left; max-height: 150px; overflow-y: auto; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </div>
              <h1>Authentication Error</h1>
              <p>Something went wrong during the connection process.</p>
              <div class="error-box">
                <strong>Error:</strong> ${e.message || String(e)}<br/><br/>
                <strong>Stack:</strong><br/>${(e.stack || 'No stack').replace(/\n/g, '<br/>')}
              </div>
            </div>
          </body>
          </html>
        `)
        server.close()
        currentAuthServer = null
        reject(e)
      }
    })

    server.on('error', (e) => {
      reject(e)
      currentAuthServer = null
    })

    // listen(0) automatically finds an open, available port. Force IPv4 127.0.0.1 to avoid production IPv6 ::1 issues
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      currentAuthServer = server

      // Now we know the exact port, initialize OAuth client
      oAuth2Client = new google.auth.OAuth2(
        cleanId,
        cleanSecret,
        `http://127.0.0.1:${port}/oauth2callback`
      )

      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      })

      shell.openExternal(authorizeUrl)
    })
  })
}

/**
 * Logs out by deleting the token file.
 */
export async function disconnectGoogle() {
  try {
    await fs.unlink(TOKEN_PATH)
    return true
  } catch (error) {
    // If file doesn't exist, it's already disconnected
    return true
  }
}

/**
 * Checks if the user is currently connected (has saved tokens).
 */
export async function getGoogleStatus() {
  const tokens = await getTokens()
  return !!tokens
}
