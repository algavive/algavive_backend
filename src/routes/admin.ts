import { Hono } from 'hono'
import { getTokenFromCookie, verifyCookie } from '../utils/cookie'

function hasPermission(actorLevel: number, targetLevel: number, action: 'set_role' | 'remove_role' | 'ban' | 'unban' | 'set_icon' | 'set_title'): boolean {
  if (actorLevel === 9) return true
  if (actorLevel === 3) {
    if (action === 'set_role' && targetLevel <= 2) return true
    if (action === 'remove_role' && targetLevel <= 2 && targetLevel > 0) return true
    if (action === 'ban' || action === 'unban' || action === 'set_icon' || action === 'set_title') return true
    return false
  }
  if (actorLevel === 2) {
    if (action === 'set_role' && targetLevel === 1) return true
    if (action === 'remove_role' && targetLevel === 1) return true
    if (action === 'ban' || action === 'unban' || action === 'set_icon' || action === 'set_title') return true
    return false
  }
  if (actorLevel === 1) {
    return false
  }
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
        `SELECT * FROM admin_log ORDER BY created_at DESC LIMIT ? OFFSET ?`
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

      const { action, targetUserId, value } = await c.req.json()
      if (!action || !targetUserId) return c.json({ error: 'Missing fields' }, 400)

      const target = await c.env.DB.prepare('SELECT id, admin, username FROM users WHERE id = ?').bind(targetUserId).first()
      if (!target) return c.json({ error: 'User not found' }, 404)

      const actorLevel = actor.admin
      const targetLevel = target.admin

      let result = null
      let logMessage = ''

      switch (action) {
        case 'set_role': {
          const newRole = parseInt(value)
          if (isNaN(newRole) || newRole < 0 || newRole > 9) return c.json({ error: 'Invalid role' }, 400)
          if (newRole === 9) return c.json({ error: 'Cannot assign owner role' }, 403)
          if (!hasPermission(actorLevel, newRole, 'set_role')) return c.json({ error: 'Insufficient permissions' }, 403)
          if (actorLevel === 3 && newRole > 2) return c.json({ error: 'Cannot assign role above 2' }, 403)
          if (actorLevel === 2 && newRole > 1) return c.json({ error: 'Cannot assign role above 1' }, 403)
          await c.env.DB.prepare('UPDATE users SET admin = ? WHERE id = ?').bind(newRole, targetUserId).run()
          logMessage = `User ${actor.username} (${actor.id}) set role ${newRole} for user ${target.username} (${target.id})`
          break
        }
        case 'remove_role': {
          if (targetLevel === 0) return c.json({ error: 'User has no role to remove' }, 400)
          if (targetLevel === 9) return c.json({ error: 'Cannot remove owner role' }, 403)
          if (!hasPermission(actorLevel, targetLevel, 'remove_role')) return c.json({ error: 'Insufficient permissions' }, 403)
          await c.env.DB.prepare('UPDATE users SET admin = 0 WHERE id = ?').bind(targetUserId).run()
          logMessage = `User ${actor.username} (${actor.id}) removed role ${targetLevel} from user ${target.username} (${target.id})`
          break
        }
        case 'ban': {
          if (!hasPermission(actorLevel, targetLevel, 'ban')) return c.json({ error: 'Insufficient permissions' }, 403)
          const duration = value || '1d'
          let until = null
          if (duration === 'always') {
            until = '9999-12-31 23:59:59'
          } else if (duration === 'never') {
            await c.env.DB.prepare('DELETE FROM admin_ban WHERE user_id = ?').bind(targetUserId).run()
            logMessage = `User ${actor.username} (${actor.id}) unbanned user ${target.username} (${target.id})`
            break
          } else {
            const match = duration.match(/^(\d+)([hd])$/)
            if (!match) return c.json({ error: 'Invalid duration format, use e.g. "5h" or "7d"' }, 400)
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
          logMessage = `User ${actor.username} (${actor.id}) banned user ${target.username} (${target.id}) until ${until}`
          break
        }
        case 'unban': {
          if (!hasPermission(actorLevel, targetLevel, 'unban')) return c.json({ error: 'Insufficient permissions' }, 403)
          await c.env.DB.prepare('DELETE FROM admin_ban WHERE user_id = ?').bind(targetUserId).run()
          logMessage = `User ${actor.username} (${actor.id}) unbanned user ${target.username} (${target.id})`
          break
        }
        case 'set_icon': {
          if (!hasPermission(actorLevel, targetLevel, 'set_icon')) return c.json({ error: 'Insufficient permissions' }, 403)
          if (!value || typeof value !== 'string' || value.length > 256) return c.json({ error: 'Invalid icon URL' }, 400)
          await c.env.DB.prepare('UPDATE users SET userIcon = ? WHERE id = ?').bind(value, targetUserId).run()
          logMessage = `User ${actor.username} (${actor.id}) set icon for user ${target.username} (${target.id})`
          break
        }
        case 'set_title': {
          if (!hasPermission(actorLevel, targetLevel, 'set_title')) return c.json({ error: 'Insufficient permissions' }, 403)
          if (!value || typeof value !== 'string' || value.length > 64) return c.json({ error: 'Invalid title' }, 400)
          await c.env.DB.prepare('UPDATE users SET userTitle = ? WHERE id = ?').bind(value, targetUserId).run()
          logMessage = `User ${actor.username} (${actor.id}) set title "${value}" for user ${target.username} (${target.id})`
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