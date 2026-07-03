import { Hono } from 'hono'

export function trends(app: Hono) {
  app.get('/api/trends', async (c) => {
    try {
      const period = c.req.query('period') || 'day'
      const limit = 15

      let dateCondition = ''
      if (period === 'day') {
        dateCondition = "DATE(p.created_at) = DATE('now', '-1 day')"
      } else if (period === 'week') {
        dateCondition = "DATE(p.created_at) >= DATE('now', '-7 days')"
      } else if (period === 'month') {
        dateCondition = "DATE(p.created_at) >= DATE('now', '-30 days')"
      } else {
        dateCondition = "DATE(p.created_at) = DATE('now', '-1 day')"
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
        WHERE p.is_published = 1
          AND ${dateCondition} AND (p.is_entertaiment IS NULL OR p.is_entertaiment = 0)
        ORDER BY p.likes_count DESC
        LIMIT ?`
      ).bind(limit).all()

      return c.json({ projects: result.results || [] })
    } catch (error) {
      console.error('Trends error:', error)
      return c.json({ error: 'Failed to load trends' }, 500)
    }
  })
}