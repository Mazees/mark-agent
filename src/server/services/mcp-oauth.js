import http from 'node:http'
import { randomBytes } from 'node:crypto'

export async function createMcpOAuth({ id, vault, onComplete }) {
  const state = randomBytes(24).toString('hex')
  const secrets = await vault.read(id)
  const oauth = secrets.oauth || {}
  let authorizationUrl = null
  let verifier = ''
  let finished = false
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/callback' || url.searchParams.get('state') !== state || finished) {
      res.writeHead(400)
      res.end('Permintaan tidak valid.')
      return
    }
    finished = true
    const code = url.searchParams.get('code')
    if (!code || url.searchParams.get('error')) {
      res.writeHead(400)
      res.end('Login tidak selesai. Kembali ke Mark.')
      await onComplete(null)
      server.close()
      return
    }
    try {
      await onComplete(code)
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Login selesai. Kembali ke Mark.')
    } catch {
      res.writeHead(500)
      res.end('Login gagal. Kembali ke Mark dan coba lagi.')
    } finally {
      server.close()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const redirectUrl = `http://127.0.0.1:${server.address().port}/callback`
  const persist = async () => {
    const latest = await vault.read(id)
    await vault.write(id, { ...latest, oauth })
  }
  const provider = {
    get redirectUrl() {
      return redirectUrl
    },
    get clientMetadata() {
      return {
        client_name: 'Mark Agent',
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      }
    },
    state: () => state,
    clientInformation: () => oauth.clientInformation,
    async saveClientInformation(info) {
      oauth.clientInformation = info
      await persist()
    },
    tokens: () => oauth.tokens,
    async saveTokens(tokens) {
      oauth.tokens = tokens
      await persist()
    },
    async redirectToAuthorization(url) {
      const parsed = new URL(url)
      if (
        parsed.username ||
        parsed.password ||
        (parsed.protocol !== 'https:' &&
          !(
            parsed.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
          ))
      )
        throw new Error('URL login OAuth tidak aman.')
      authorizationUrl = parsed.toString()
    },
    async saveCodeVerifier(value) {
      verifier = value
    },
    codeVerifier: () => {
      if (!verifier) throw new Error('PKCE verifier tidak tersedia.')
      return verifier
    },
    async invalidateCredentials(scope) {
      if (scope === 'all' || scope === 'tokens') delete oauth.tokens
      if (scope === 'all' || scope === 'client') delete oauth.clientInformation
      if (scope === 'all' || scope === 'verifier') verifier = ''
      await persist()
    }
  }
  const timer = setTimeout(() => server.close(), 5 * 60 * 1000)
  timer.unref()
  server.on('close', () => clearTimeout(timer))
  return { provider, getAuthorizationUrl: () => authorizationUrl, close: () => server.close() }
}
