import { Hono } from 'hono'
import { verifyCookie, getTokenFromCookie } from '../utils/cookie'
import * as config from '../config'

const validTypes = ['Пост', 'Scratch', 'Видео', 'Web']
const MAX_PROJECTS = 25

export function my_projects(app: Hono) {
	app.post("/api/create/project", async(c) => {
    	const {title, type, imageUrl, content} = await c.req.json()

    	const token = getTokenFromCookie(c)
    	if (!token) {
      	return c.json({ error: 'Unauthorized' }, 401)
    	}
    	if (title.length < 1 || title.length > 128) {
      		return c.json({ error: 'title должен быть от 1 до 128 символов' }, 400)
    	}
      	if (!validTypes.includes(type)) {
        	return c.json({ error: 'Неверный тип проекта' }, 400)
      	}
      	if (imageUrl && (imageUrl.length < 1 || imageUrl.length > 256)) {
  			return c.json({ error: 'imageUrl должен быть от 1 до 256 символов' }, 400)
		}
    	const payload = await verifyCookie(token, c)
    	const result = await c.env.DB.prepare(
      		'INSERT INTO projects(user_id, title, type, imageUrl, is_published) VALUES(?,?,?,?,?)'
    	).bind(payload.id, title, type, imageUrl, 0).run()
    	
    	const project = await c.env.DB.prepare(
  			'SELECT * FROM projects WHERE id = ?'
		).bind(result.meta?.last_row_id || result.lastInsertRowid).first()

    	return c.json({ success: true, project }, 200)
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