import { Hono } from 'hono'
import { sha256 } from 'hono/utils/crypto'
import { sign, verify } from 'hono/jwt'

const JWT_ALG = 'HS256'

export async function verifyCookie(token: string, c: any){
  return await verify(token, c.env.JWT_SECRET, JWT_ALG)
}

export function getTokenFromCookie(c: any): string | null {
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