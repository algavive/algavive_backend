import { Hono } from 'hono'
import { getTokenFromCookie, verifyCookie } from '../utils/cookie'
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

function canAct(actorLevel: number, targetLevel: number, action: string): boolean {
  if (actorLevel === 9) return true

  if (['set_icon', 'set_title'].includes(action) && actorLevel <= 3) return true
  if (targetLevel >= actorLevel) return false

  if (actorLevel === 3) {
    if (action === 'set_role' && targetLevel <= 2) return true
    if (action === 'remove_role' && targetLevel <= 2 && targetLevel > 0) return true
    if (['ban', 'unban', 'set_icon', 'set_title', 'reset_profile'].includes(action)) return true
    return false
  }

  if (actorLevel === 2) {
    if (action === 'set_role' && targetLevel === 1) return true
    if (action === 'remove_role' && targetLevel === 1) return true
    if (['ban', 'unban', 'set_icon', 'set_title', 'reset_profile'].includes(action)) return true
    return false
  }

  if (actorLevel === 1) return false
  return false
}

function canAssignRole(actorLevel: number, newRole: number): boolean {
  if (actorLevel === 9) return true
  if (newRole === 9) return false
  if (actorLevel === 3) return newRole <= 2
  if (actorLevel === 2) return newRole <= 1
  return false
}

export function admin(app: Hono) {
  app.get('/api/admin/logs', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)
      const payload = await verifyCookie(token, c)
      const user = await c.env.DB.prepare('SELECT admin FROM users WHERE id = ?').bind(payload.id).first()
      if (!user || user.admin < 2) return c.json({ error: 'Forbidden' }, 403)

      const page = parseInt(c.req.query('page') || '1')
      const limit = parseInt(c.req.query('limit') || '20')
      const offset = (page - 1) * limit

      const logs = await c.env.DB.prepare(
        `SELECT al.*, u.username as admin_name 
         FROM admin_log al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.created_at DESC 
         LIMIT ? OFFSET ?`
      ).bind(limit, offset).all()

      const total = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM admin_log'
      ).first()

      return c.json({
        logs: logs.results || [],
        total: total?.count || 0,
        page,
        limit,
        totalPages: Math.ceil((total?.count || 0) / limit)
      })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to fetch logs' }, 500)
    }
  })

  app.post('/api/admin/action', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)
      const payload = await verifyCookie(token, c)
      const actor = await c.env.DB.prepare('SELECT id, admin, username FROM users WHERE id = ?').bind(payload.id).first()
      if (!actor || actor.admin < 2) return c.json({ error: 'Forbidden' }, 403)

      const { action, targetUserId, value, turnstileToken } = await c.req.json()

      if (!action || !targetUserId) return c.json({ error: 'Missing fields' }, 400)

      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400)
      }

      const target = await c.env.DB.prepare('SELECT id, admin, username FROM users WHERE id = ?').bind(targetUserId).first()
      if (!target) return c.json({ error: 'User not found' }, 404)

      const actorLevel = actor.admin
      const targetLevel = target.admin

      if (!canAct(actorLevel, targetLevel, action)) {
        return c.json({ error: 'Insufficient permissions to act on this user' }, 403)
      }

      let logMessage = ''

      switch (action) {
        case 'set_role': {
          const newRole = parseInt(value)
          if (isNaN(newRole) || newRole < 0 || newRole > 9) return c.json({ error: 'Invalid role' }, 400)
          if (!canAssignRole(actorLevel, newRole)) {
            return c.json({ error: 'Cannot assign this role' }, 403)
          }
          await c.env.DB.prepare('UPDATE users SET admin = ? WHERE id = ?').bind(newRole, targetUserId).run()
          logMessage = `Админ ${actor.username} (${actor.id}) установил роль ${newRole} у ${target.username} (${target.id})`
          break
        }
        case 'remove_role': {
          if (targetLevel === 0) return c.json({ error: 'User has no role to remove' }, 400)
          await c.env.DB.prepare('UPDATE users SET admin = 0 WHERE id = ?').bind(targetUserId).run()
          logMessage = `Админ ${actor.username} (${actor.id}) убрал роль ${targetLevel} у ${target.username} (${target.id})`
          break
        }
        case 'ban': {
          const duration = value || '1d'
          let until = null
          if (duration === 'always') {
            until = '9999-12-31 23:59:59'
          } else if (duration === 'never') {
            await c.env.DB.prepare('DELETE FROM admin_ban WHERE user_id = ?').bind(targetUserId).run()
            logMessage = `Админ ${actor.username} (${actor.id}) разбанил ${target.username} (${target.id})`
            break
          } else {
            const match = duration.match(/^(\d+)([hd])$/)
            if (!match) return c.json({ error: 'Неправильный часовой формат, используйте "5h" или "7d"' }, 400)
            const num = parseInt(match[1])
            const unit = match[2]
            const now = new Date()
            if (unit === 'h') now.setHours(now.getHours() + num)
            else if (unit === 'd') now.setDate(now.getDate() + num)
            until = now.toISOString()
          }
          await c.env.DB.prepare(
            'INSERT INTO admin_ban (user_id, user_id_who_baned, duration) VALUES (?, ?, ?)'
          ).bind(targetUserId, actor.id, until).run()
          logMessage = `Админ ${actor.username} (${actor.id}) забанил ${target.username} (${target.id}) до ${until}`
          break
        }
        case 'unban': {
          await c.env.DB.prepare('DELETE FROM admin_ban WHERE user_id = ?').bind(targetUserId).run()
          logMessage = `Админ ${actor.username} (${actor.id}) разбанил ${target.username} (${target.id})`
          break
        }
        case 'set_icon': {
          const iconValue = (value === "null") ? null : value
          if (iconValue !== null && (typeof iconValue !== 'string' || iconValue.length > 256)) {
            return c.json({ error: 'Invalid icon URL' }, 400)
          }
          const check = CHECK_ALLOWED_URLS(c, iconValue);
          if (check !== true) return check;
          await c.env.DB.prepare('UPDATE users SET userIcon = ? WHERE id = ?').bind(iconValue, targetUserId).run()
          logMessage = iconValue === null
            ? `Админ ${actor.username} (${actor.id}) убрал иконку у ${target.username} (${target.id})`
            : `Админ ${actor.username} (${actor.id}) установил иконку ${iconValue} у ${target.username} (${target.id})`
          break
        }
        case 'set_title': {
          const titleValue = (value === "null") ? null : value
          if (titleValue !== null && (typeof titleValue !== 'string' || titleValue.length > 64)) {
            return c.json({ error: 'Invalid title' }, 400)
          }
          await c.env.DB.prepare('UPDATE users SET userTitle = ? WHERE id = ?').bind(titleValue, targetUserId).run()
          logMessage = titleValue === null
            ? `Админ ${actor.username} (${actor.id}) убрал титул у ${target.username} (${target.id})`
            : `Админ ${actor.username} (${actor.id}) поставил титул "${titleValue}" у ${target.username} (${target.id})`
          break
        }
        case 'reset_profile': {
          const defaultUsername = `User${target.id}`
          await c.env.DB.prepare(
            'UPDATE users SET username = ?, avatarUrl = NULL, description = NULL WHERE id = ?'
          ).bind(defaultUsername, targetUserId).run()
          logMessage = `Админ ${actor.username} (${actor.id}) сбросил профиль у ${target.username} (${target.id})`
          break
        }
        default:
          return c.json({ error: 'Unknown action' }, 400)
      }

      if (logMessage) {
        await c.env.DB.prepare(
          'INSERT INTO admin_log (user_id, content) VALUES (?, ?)'
        ).bind(actor.id, logMessage).run()
      }

      await c.env.DB.prepare(
        'DELETE FROM admin_log WHERE created_at < datetime("now", "-2 days")'
      ).run()

      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Action failed' }, 500)
    }
  })

  app.get('/api/admin/users/:id', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)
      const payload = await verifyCookie(token, c)
      const actor = await c.env.DB.prepare('SELECT admin FROM users WHERE id = ?').bind(payload.id).first()
      if (!actor || actor.admin < 2) return c.json({ error: 'Forbidden' }, 403)

      const targetId = parseInt(c.req.param('id'))
      if (!targetId) return c.json({ error: 'Invalid user ID' }, 400)

      const user = await c.env.DB.prepare(
        'SELECT id, username, avatarUrl, userIcon, userTitle, admin, created_at FROM users WHERE id = ?'
      ).bind(targetId).first()
      if (!user) return c.json({ error: 'User not found' }, 404)

      const ban = await c.env.DB.prepare(
        'SELECT * FROM admin_ban WHERE user_id = ? AND (duration IS NULL OR duration > datetime("now"))'
      ).bind(targetId).first()

      return c.json({ user, isBanned: !!ban })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to fetch user' }, 500)
    }
  })
}