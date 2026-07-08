import { Hono } from 'hono'
import { verifyCookie, getTokenFromCookie } from '../utils/cookie'
import {CHECK_ALLOWED_URLS} from '../config'

export function my_profile(app: Hono) {

app.get('/api/me', async (c) => {
  try {
    const token = getTokenFromCookie(c)
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const payload = await verifyCookie(token, c)
    const user = await c.env.DB.prepare(
      'SELECT id, username, google_id, created_at, description, avatarUrl, admin FROM users WHERE id = ?'
    ).bind(payload.id).first()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    let userBanned = await c.env.DB.prepare(
      'SELECT created_at, user_id_who_baned, duration FROM admin_ban WHERE user_id = ?'
    ).bind(payload.id).first()


if (userBanned && userBanned.duration !== 'always' && userBanned.duration !== '9999-12-31 23:59:59') {
  const result = await c.env.DB.prepare(
    `DELETE FROM admin_ban WHERE user_id = ? AND strftime('%s', duration) < strftime('%s', 'now')`
  ).bind(payload.id).run()
  if (result.meta?.changes > 0) {
    userBanned = null
  }
}
    if (userBanned === null) {
      return c.json({
        user: {
          id: user.id,
          username: user.username,
          hasGoogle: user.google_id !== null,
          created_at: user.created_at,
          description: user.description,
          avatarUrl: user.avatarUrl,
          admin: user.admin
        }
      })
    } else {
      const admin = await c.env.DB.prepare(
        'SELECT username FROM users WHERE id = ?'
      ).bind(userBanned.user_id_who_baned).first()

      return c.json({
        user: {
          id: user.id,
          username: user.username,
          hasGoogle: user.google_id !== null,
          created_at: user.created_at,
          description: user.description,
          avatarUrl: user.avatarUrl,
          admin: user.admin,
          banned: {
            created_at: userBanned.created_at,
            duration: userBanned.duration,
            admin_name: admin?.username || 'Unknown'
          }
        }
      })
    }
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Invalid token' }, 401)
  }
})

app.post("/api/change/username", async (c) => {
  try {
    const { username } = await c.req.json()

    const token = getTokenFromCookie(c)
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    if (username.length < 3 || username.length > 30) {
      return c.json({ error: 'Username должен быть от 3 до 30 символов' }, 400)
    }

    //проверка на юз
    let t = await c.env.DB.prepare(
      'SELECT username FROM users WHERE username=?'
    ).bind(username).first()

    if(t){
      return c.json({error: 'Username уже занят'}, 401)
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
      'SELECT api_limit_change_username_per_day, api_limit_username_exempt FROM users_api_limits WHERE user_id = ?'
    ).bind(payload.id).first()

    let limitPerDay = 1
    let isExempt = 0

    if (limits) {
      limitPerDay = limits.api_limit_change_username_per_day
      isExempt = limits.api_limit_username_exempt
    }

    if (isExempt === 0) {
      const todayStart = new Date().toISOString().slice(0, 10)
      const count = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users_api_limits_use
         WHERE user_id = ? AND action = 0 AND date(created_at) = ?`
      ).bind(payload.id, todayStart).first()

      if (count.cnt >= limitPerDay) {
        return c.json({ error: 'Поменять username можно только один раз' }, 429)
      }
    }

    await c.env.DB.prepare(
      'UPDATE users SET username = ? WHERE id = ?'
    ).bind(username, payload.id).run()

    await c.env.DB.prepare(
      'INSERT INTO users_api_limits_use (user_id, action) VALUES (?, 0)'
    ).bind(payload.id).run()

    return c.json({ success: true }, 200)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to change username' }, 500)
  }
})

	app.post('/api/change/description', async(c) =>{
		const {description} = await c.req.json()

		const token = getTokenFromCookie(c)
		if (!token) {
      		return c.json({ error: 'Unauthorized' }, 401)
    	}
    	if (description.length < 1 || description.length > 1024) {
      		return c.json({ error: 'description должен быть от 1 до 1024 символов' }, 400)
    	}
    	const payload = await verifyCookie(token, c)

    	const banned = await c.env.DB.prepare(
        'SELECT * FROM admin_ban WHERE user_id = ?'
      ).bind(payload.id).first()
      if(banned) { return c.json({error: 'You banned'},403)}

    	await c.env.DB.prepare(
      		'UPDATE users SET description = ? WHERE id = ?'
    	).bind(description, payload.id).run()

    	return c.json({ success: true }, 200)
	})
	app.post('/api/change/avatarUrl', async(c) =>{
		const {avatarUrl} = await c.req.json()

    const check = CHECK_ALLOWED_URLS(c, avatarUrl);
    if (check !== true) return check;

		const token = getTokenFromCookie(c)
		if (!token) {
      		return c.json({ error: 'Unauthorized' }, 401)
    	}
    	if (avatarUrl.length < 1 || avatarUrl.length > 128) {
      		return c.json({ error: 'avatarUrl должен быть от 1 до 128 символов' }, 400)
    	}
    	const payload = await verifyCookie(token, c)

    	const banned = await c.env.DB.prepare(
        'SELECT * FROM admin_ban WHERE user_id = ?'
      ).bind(payload.id).first()
      if(banned) { return c.json({error: 'You banned'},403)}

    	await c.env.DB.prepare(
      		'UPDATE users SET avatarUrl = ? WHERE id = ?'
    	).bind(avatarUrl, payload.id).run()

    	return c.json({ success: true }, 200)
	})
}