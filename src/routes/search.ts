// src/routes/search.ts
import { Hono } from 'hono'

export function search(app: Hono) {
  app.get('/api/search', async (c) => {
    try {
      const name = c.req.query('name') || ''
      const type = c.req.query('type') || 'project'
      const sort = c.req.query('sort') || 'new'
      const limit = parseInt(c.req.query('limit') || '20')

      if(name.length > 256){return c.json({error: 'Значение превышает больше 256 символов'},400)}

      if (!name.trim()) {
        return c.json({ projects: [], users: [] })
      }

      const searchTerm = `%${name.trim()}%`

      if (type === 'user') {
        const users = await c.env.DB.prepare(
          `SELECT 
            u.id,
            u.username as name,
            u.avatarUrl,
            u.userIcon as rankIcon,
            u.userTitle as rankTitle
          FROM users u
          WHERE u.username LIKE ? OR u.login LIKE ?
          ORDER BY u.username ASC
          LIMIT ?`
        ).bind(searchTerm, searchTerm, limit).all()

        return c.json({ users: users.results || [] })
      }

      let orderBy = 'p.created_at DESC'
      if (sort === 'popular') {
        orderBy = 'p.likes_count DESC, p.views_count DESC'
      } else if (sort === 'discussed') {
        orderBy = 'p.comments_count DESC'
      }

      const projects = await c.env.DB.prepare(
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
        WHERE p.title LIKE ? AND p.is_published = 1
        ORDER BY ${orderBy}
        LIMIT ?`
      ).bind(searchTerm, limit).all()

      return c.json({ projects: projects.results || [] })
    } catch (error) {
      console.error('Search error:', error)
      return c.json({ error: 'Search failed' }, 500)
    }
  })
}