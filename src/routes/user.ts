import { Hono } from 'hono'

export function user(app: Hono) {
  app.get('/api/user/:id', async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (!id) return c.json({ error: 'Invalid user ID' }, 400)

      const user = await c.env.DB.prepare(
        `SELECT 
          id,
          username as name,
          avatarUrl,
          userIcon as rankIcon,
          userTitle as rankTitle,
          description,
          admin
        FROM users
        WHERE id = ?`
      ).bind(id).first()

      if (!user) return c.json({ error: 'User not found' }, 404)

      return c.json({ user })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to load user' }, 500)
    }
  })

  app.get('/api/user/:id/projects', async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (!id) return c.json({ error: 'Invalid user ID' }, 400)

      const page = parseInt(c.req.query('page') || '1')
      const limit = parseInt(c.req.query('limit') || '28')
      const offset = (page - 1) * limit

      const sort = c.req.query('sort') || 'new'
      let orderBy = 'p.created_at DESC'
      if (sort === 'popular') {
        orderBy = 'p.likes_count DESC, p.views_count DESC'
      } else if (sort === 'discussed') {
        orderBy = 'p.comments_count DESC'
      }

      const result = await c.env.DB.prepare(
        `SELECT 
          p.id,
          p.title,
          p.type,
          p.imageUrl,
          p.likes_count as likes,
          p.comments_count as comments,
          p.views_count as views,
          u.username as author,
          u.avatarUrl as authorProfile,
          u.userIcon as authorIcon,
          u.userTitle as authorTitle
        FROM projects p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.user_id = ? AND p.is_published = 1
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`
      ).bind(id, limit, offset).all()

      const total = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND is_published = 1'
      ).bind(id).first()

      return c.json({
        projects: result.results || [],
        total: total?.count || 0,
        page,
        limit,
        totalPages: Math.ceil((total?.count || 0) / limit)
      })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to load user projects' }, 500)
    }
  })
}