import { Hono } from 'hono'
import { verifyCookie, getTokenFromCookie } from '../utils/cookie'

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
  	} catch (error) {
    	return c.json({ error: 'Invalid token' }, 401)
  	}
  })

	app.post("/api/change/username", async(c) => {
    	const {username} = await c.req.json()

    	const token = getTokenFromCookie(c)
    	if (!token) {
      	return c.json({ error: 'Unauthorized' }, 401)
    	}
    	if (username.length < 3 || username.length > 30) {
      		return c.json({ error: 'Username должен быть от 3 до 30 символов' }, 400)
    	}
    	const payload = await verifyCookie(token, c)
    	await c.env.DB.prepare(
      		'UPDATE users SET username = ? WHERE id = ?'
    	).bind(username, payload.id).run()

    	return c.json({ success: true }, 200)
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
    	await c.env.DB.prepare(
      		'UPDATE users SET description = ? WHERE id = ?'
    	).bind(description, payload.id).run()

    	return c.json({ success: true }, 200)
	})
	app.post('/api/change/avatarUrl', async(c) =>{
		const {avatarUrl} = await c.req.json()

		const token = getTokenFromCookie(c)
		if (!token) {
      		return c.json({ error: 'Unauthorized' }, 401)
    	}
    	if (avatarUrl.length < 1 || avatarUrl.length > 128) {
      		return c.json({ error: 'avatarUrl должен быть от 1 до 128 символов' }, 400)
    	}
    	const payload = await verifyCookie(token, c)
    	await c.env.DB.prepare(
      		'UPDATE users SET avatarUrl = ? WHERE id = ?'
    	).bind(avatarUrl, payload.id).run()

    	return c.json({ success: true }, 200)
	})
}