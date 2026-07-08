import { Hono } from 'hono'
import { sha256 } from 'hono/utils/crypto'
import { sign, verify } from 'hono/jwt'

const JWT_ALG = 'HS256'

const SimpleRegistration: boolean = false 

function getTokenFromCookie(c: any): string | null {
  const cookie = c.req.header('Cookie')
  if (!cookie) return null
  const match = cookie.split(';').find(c => c.trim().startsWith('token='))
  if (!match) return null
  return match.split('=')[1].trim()
}

function setAuthCookie(c: any, token: string) {
  const isProduction = c.req.url.includes('workers.dev') || c.req.url.includes('algavive')
  const sameSite = isProduction ? 'None' : 'Lax'
  const secure = isProduction ? 'Secure; ' : ''
  
  c.header('Set-Cookie', `token=${token}; HttpOnly; ${secure}SameSite=${sameSite}; Path=/; Max-Age=2592000`)
}
function clearAuthCookie(c: any) {
  const isProduction = c.req.url.includes('workers.dev') || c.req.url.includes('algavive')
  const sameSite = isProduction ? 'None' : 'Lax'
  const secure = isProduction ? 'Secure; ' : ''
  
  c.header('Set-Cookie', `token=; HttpOnly; ${secure}SameSite=${sameSite}; Path=/; Max-Age=0`)
}

async function verifyTurnstile(token: string, secret: string) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token })
  })
  const data = await res.json()
  return data.success
}

async function verifyGoogleToken(token: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + token)
  const data = await res.json()
  if (!data.sub) throw new Error('Invalid Google token')
  return data
}

export function auth(app: Hono) {
  app.post('/api/register', async (c) => {
    try {
      const { login, pass, turnstileToken } = await c.req.json()
      if (!login || !pass || !turnstileToken) {
        return c.json({ error: 'Missing required fields' }, 400)
      }
      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400)
      }
      if (!c.env.SIMPREG) {
        return c.json({ error: 'Владелец выключил обычную регистрацию' }, 400)
      }
      const existing = await c.env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(login).first()
      if (existing) {
        return c.json({ error: 'User already exists' }, 400)
      }
      const passHash = await sha256(pass)
      const now = new Date().toISOString()
      await c.env.DB.prepare(
        'INSERT INTO users (login, pass_hash, google_id, username, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(login, passHash, null, null, now).run()
      const user = await c.env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(login).first()
      await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(`User${user.id}`, user.id).run()
      const token = await sign({
        id: user.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
      }, c.env.JWT_SECRET, JWT_ALG)
      setAuthCookie(c, token)
      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Registration failed' }, 500)
    }
  })

  app.post('/api/login', async (c) => {
    try {
      const { login, pass, turnstileToken } = await c.req.json()
      if (!login || !pass || !turnstileToken) {
        return c.json({ error: 'Missing required fields' }, 400)
      }
      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400)
      }
      const passHash = await sha256(pass)
      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE login = ? AND pass_hash = ? AND google_id IS NULL'
      ).bind(login, passHash).first()
      if (!user) {
        return c.json({ error: 'Invalid credentials or account uses Google login' }, 401)
      }
      const token = await sign({
        id: user.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
      }, c.env.JWT_SECRET, JWT_ALG)
      setAuthCookie(c, token)
      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Login failed' }, 500)
    }
  })

  app.post('/api/logout', async (c) => {
    clearAuthCookie(c)
    return c.json({ success: true })
  })

  app.post('/api/auth/google', async (c) => {
    try {
      const { googleToken, turnstileToken, mode, login, password } = await c.req.json()
      if (!googleToken || !turnstileToken || !mode) {
        return c.json({ error: 'Missing required fields' }, 400)
      }
      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400)
      }
      const googleData = await verifyGoogleToken(googleToken)
      const googleId = googleData.sub

      if (mode === 'register') {
        const existingGoogle = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first()
        if (existingGoogle) {
          return c.json({ error: 'Google account already linked' }, 400)
        }

        let loginToInsert = null
        let passHashToInsert = null

        if (login && password) {
          const existingLogin = await c.env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(login).first()
          if (existingLogin) {
            return c.json({ error: 'Login already taken' }, 400)
          }
          loginToInsert = login
          passHashToInsert = await sha256(password)
        }

        const now = new Date().toISOString()
        await c.env.DB.prepare(
          'INSERT INTO users (login, pass_hash, google_id, username, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(loginToInsert, passHashToInsert, googleId, null, now).run()

        const user = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first()
        await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(`User${user.id}`, user.id).run()

        const token = await sign({
          id: user.id,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
        }, c.env.JWT_SECRET, JWT_ALG)
        setAuthCookie(c, token)
        return c.json({ success: true })
      } else if (mode === 'login') {
        const user = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first()
        if (!user) {
          return c.json({ error: 'User not found' }, 404)
        }
        const token = await sign({
          id: user.id,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
        }, c.env.JWT_SECRET, JWT_ALG)
        setAuthCookie(c, token)
        return c.json({ success: true })
      } else {
        return c.json({ error: 'Invalid mode' }, 400)
      }
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Google auth failed' }, 500)
    }
  })
  app.post('/api/link-google', async (c) => {
  try {
    const token = getTokenFromCookie(c)
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const payload = await verify(token, c.env.JWT_SECRET, JWT_ALG)
    const { googleToken, turnstileToken } = await c.req.json()

    if (!googleToken || !turnstileToken) {
      return c.json({ error: 'Missing required fields' }, 400)
    }

    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
    if (!isHuman) {
      return c.json({ error: 'Invalid captcha' }, 400)
    }

    const googleData = await verifyGoogleToken(googleToken)
    const googleId = googleData.sub

    
    const existingGoogle = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ? AND id != ?')
      .bind(googleId, payload.id).first()

    if (existingGoogle) {
      return c.json({ error: 'Google account already linked to another user' }, 400)
    }


    await c.env.DB.prepare(
      'UPDATE users SET google_id = ?, login = ?, pass_hash = ? WHERE id = ?'
    ).bind(googleId, null, null, payload.id).run()

    const updatedUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.id).first()

    const newToken = await sign({
      id: updatedUser.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
    }, c.env.JWT_SECRET, JWT_ALG)

    setAuthCookie(c, newToken)
    return c.json({ success: true })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to link Google' }, 500)
  }
  })
}