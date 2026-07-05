import { Hono } from 'hono'

export function trends(app: Hono) {
  app.get('/api/trends', async (c) => {
    try {
      const period = c.req.query('period') || 'day'

      const updateTrends = async () => {
        const projects = await c.env.DB.prepare(
          `SELECT 
            p.id,
            p.likes_count,
            (SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-1 day')) as likes_day,
            (SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-7 days')) as likes_week,
            (SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-30 days')) as likes_month
          FROM projects p
          WHERE p.is_published = 1 
            AND (p.is_entertaiment IS NULL OR p.is_entertaiment = 0)`
        ).all()

        const dayPeak = await c.env.DB.prepare(
          `SELECT MAX((SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-1 day'))) as max_likes
           FROM projects p
           WHERE p.is_published = 1 
             AND (p.is_entertaiment IS NULL OR p.is_entertaiment = 0)`
        ).first()

        const weekPeak = await c.env.DB.prepare(
          `SELECT MAX((SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-7 days'))) as max_likes
           FROM projects p
           WHERE p.is_published = 1 
             AND (p.is_entertaiment IS NULL OR p.is_entertaiment = 0)`
        ).first()

        const monthPeak = await c.env.DB.prepare(
          `SELECT MAX((SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-30 days'))) as max_likes
           FROM projects p
           WHERE p.is_published = 1 
             AND (p.is_entertaiment IS NULL OR p.is_entertaiment = 0)`
        ).first()

        const dayPeakVal = dayPeak?.max_likes || 0
        const weekPeakVal = weekPeak?.max_likes || 0
        const monthPeakVal = monthPeak?.max_likes || 0

        for (const project of (projects.results || [])) {
          const dayLikes = project.likes_day || 0
          const weekLikes = project.likes_week || 0
          const monthLikes = project.likes_month || 0

          let isTrend = 0
          if (dayLikes >= dayPeakVal && dayPeakVal > 0) isTrend = 1
          else if (weekLikes >= weekPeakVal && weekPeakVal > 0) isTrend = 1
          else if (monthLikes >= monthPeakVal && monthPeakVal > 0) isTrend = 1

          await c.env.DB.prepare(
            'UPDATE projects SET is_trends = ? WHERE id = ?'
          ).bind(isTrend, project.id).run()
        }
      }

      await updateTrends()

      let orderBy = 'likes_day DESC'
      if (period === 'week') orderBy = 'likes_week DESC'
      else if (period === 'month') orderBy = 'likes_month DESC'

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
          u.userTitle as authorTitle,
          p.is_trends,
          (SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-1 day')) as likes_day,
          (SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-7 days')) as likes_week,
          (SELECT COUNT(*) FROM likes WHERE projects_id = p.id AND created_at >= datetime('now', '-30 days')) as likes_month
        FROM projects p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.is_published = 1 
          AND p.is_trends = 1
          AND (p.is_entertaiment IS NULL OR p.is_entertaiment = 0)
        ORDER BY ${orderBy}
        LIMIT 15`
      ).all()

      return c.json({ projects: result.results || [] })
    } catch (error) {
      console.error('Trends error:', error)
      return c.json({ error: 'Failed to load trends' }, 500)
    }
  })
}