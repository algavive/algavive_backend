import { Hono } from 'hono'
import { getTokenFromCookie, verifyCookie } from '../utils/cookie'

export function entertainment(app: Hono) {
  app.get('/api/entertainment', async (c) => {
    try {
      c.header('Cache-Control', 'public, max-age=10')
      const sort = c.req.query('sort') || 'new'
      const page = parseInt(c.req.query('page') || '1')
      const limit = parseInt(c.req.query('limit') || '20')
      const offset = (page - 1) * limit

      let orderBy = 'p.publish_at DESC'
      if (sort === 'popular') {
        orderBy = 'p.likes_count DESC, p.views_count DESC'
      } else if (sort === 'discussed') {
        orderBy = 'p.comments_count DESC'
      }

      const token = getTokenFromCookie(c)
      let userId = null
      if (token) {
        try {
          const payload = await verifyCookie(token, c)
          userId = payload.id
        } catch {}
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
        WHERE p.is_published = 1 AND p.is_entertaiment = 1
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`
      ).bind(limit, offset).all()

      const total = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM projects WHERE is_published = 1 AND is_entertaiment = 1'
      ).first()

      let projects = result.results || []

      /*
      if (userId) {
        const likedProjects = await c.env.DB.prepare(
          'SELECT projects_id FROM likes WHERE user_id = ?'
        ).bind(userId).all()
        const likedIds = new Set((likedProjects.results || []).map((r: any) => r.projects_id))
        projects = projects.map((p: any) => ({
          ...p,
          isLiked: likedIds.has(p.id)
        }))
      } else {
        projects = projects.map((p: any) => ({ ...p, isLiked: false }))
      }*/

      return c.json({
        projects,
        total: total?.count || 0,
        page,
        limit,
        totalPages: Math.ceil((total?.count || 0) / limit)
      })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to load entertainment projects' }, 500)
    }
  })
}