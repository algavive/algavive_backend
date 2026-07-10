import { Hono } from 'hono'
import { verifyCookie, getTokenFromCookie } from '../utils/cookie'
import validTypes from '../config'
import {CHECK_ALLOWED_URLS} from '../config'

async function verifyTurnstile(token: string, secret: string) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token })
  })
  const data = await res.json()
  return data.success
}


const MAX_PROJECTS = 25

export function my_projects(app: Hono) {

app.post('/api/create/project', async (c) => {
  try {
    const token = getTokenFromCookie(c)
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const payload = await verifyCookie(token, c)

    const banned = await c.env.DB.prepare(
      'SELECT * FROM admin_ban WHERE user_id = ? AND (duration IS NULL OR duration > datetime("now"))'
    ).bind(payload.id).first()
    if (banned) {
      return c.json({ error: 'You banned' }, 403)
    }

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO users_api_limits (user_id) VALUES (?)`
    ).bind(payload.id).run()

    const limits = await c.env.DB.prepare(
      'SELECT api_limit_create_projects_per_minute, api_limit_projects_exempt FROM users_api_limits WHERE user_id = ?'
    ).bind(payload.id).first()

    let limitPerMinute = 1
    let isExempt = 0
    if (limits) {
      limitPerMinute = limits.api_limit_create_projects_per_minute
      isExempt = limits.api_limit_projects_exempt
    }

    if (isExempt === 0) {
      const count = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users_api_limits_use
         WHERE user_id = ? AND action = 2 AND created_at >= datetime('now', '-1 minute')`
      ).bind(payload.id).first()

      if (count.cnt >= limitPerMinute) {
        return c.json({ error: 'Подождите немного' }, 429)
      }
    }

    const { title, type, imageUrl, turnstileToken } = await c.req.json()

    const check = CHECK_ALLOWED_URLS(c, imageUrl);
    if (check !== true) return check;

    if (!title || title.length < 1 || title.length > 100) {
      return c.json({ error: 'Название должно быть от 1 до 100 символов' }, 400)
    }

    const validTypes = ['Пост', 'Scratch', 'Видео', 'Web']
    if (!validTypes.includes(type)) {
      return c.json({ error: 'Неверный тип проекта' }, 400)
    }

    if (imageUrl && imageUrl.length > 256) {
      return c.json({ error: 'Ссылка на изображение должно от 1 до 256 символов' }, 400)
    }

    if (!turnstileToken) {
      return c.json({ error: 'Captcha required' }, 400)
    }

    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
    if (!isHuman) {
      return c.json({ error: 'Invalid captcha' }, 400)
    }

    const now = new Date().toISOString()
    const result = await c.env.DB.prepare(
      `INSERT INTO projects (user_id, title, type, imageUrl, content, created_at, updated_at, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      payload.id,
      title,
      type,
      imageUrl || null,
      null,
      now,
      now,
      0
    ).run()

    await c.env.DB.prepare(
      'INSERT INTO users_api_limits_use (user_id, action) VALUES (?, 2)'
    ).bind(payload.id).run()

    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(result.meta?.last_row_id || result.lastInsertRowid).first()

    return c.json({ success: true, project })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to create project' }, 500)
  }
})


app.get("/api/my-projects", async(c) => {
  const token = getTokenFromCookie(c)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  
  const payload = await verifyCookie(token, c)
  
  const page = parseInt(c.req.query('page') || '1')
  let limit = parseInt(c.req.query('limit') || `${MAX_PROJECTS}`)
  if (limit > MAX_PROJECTS) limit = MAX_PROJECTS
  if (limit < 1) limit = 1
  const offset = (page - 1) * limit

  const sort = c.req.query('sort') || 'new'
  let orderBy = 'p.created_at DESC'

  if (sort === 'popular') {
    orderBy = 'p.likes_count DESC'
  } else if (sort === 'discussed') {
    orderBy = 'p.comments_count DESC'
  }

  const result = await c.env.DB.prepare(
    `SELECT 
      p.*,
      u.username as author,
      u.avatarUrl as authorProfile,
      u.userIcon as authorIcon,
      u.userTitle as authorTitle,
      p.likes_count as likes,
      p.comments_count as comments,
      p.views_count as views
    FROM projects p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`
  ).bind(payload.id, limit, offset).all()

  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM projects WHERE user_id = ?'
  ).bind(payload.id).first()

  return c.json({ 
    projects: result.results || [],
    total: total?.count || 0,
    page,
    limit,
    totalPages: Math.ceil((total?.count || 0) / limit)
  })
})

}