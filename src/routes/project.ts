import { Hono } from 'hono'
import { getTokenFromCookie, verifyCookie } from '../utils/cookie'

export function project(app: Hono) {
  app.get('/api/project/:id', async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (!id) return c.json({ error: 'Invalid project ID' }, 400)

      const token = getTokenFromCookie(c)
      let userId = null
      if (token) {
        try {
          const payload = await verifyCookie(token, c)
          userId = payload.id
        } catch {}
      }

      const project = await c.env.DB.prepare(
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
        WHERE p.id = ?`
      ).bind(id).first()

      if (!project) return c.json({ error: 'Project not found' }, 404)

      if (userId) {
      const existingView = await c.env.DB.prepare(
        'SELECT * FROM views WHERE projects_id = ? AND user_id = ?'
      ).bind(id, userId).first()
      if (!existingView) {
        await c.env.DB.prepare(
          'INSERT INTO views (projects_id, user_id) VALUES (?, ?)'
        ).bind(id, userId).run()
        await c.env.DB.prepare(
          'UPDATE projects SET views_count = (SELECT COUNT(*) FROM views WHERE projects_id = ?) WHERE id = ?'
        ).bind(id, id).run()
      }
    } else {
      await c.env.DB.prepare(
        'UPDATE projects SET views_count = views_count + 1 WHERE id = ?'
      ).bind(id).run()
    }

      let isLiked = false
      let isOwner = false
      if (userId) {
        const like = await c.env.DB.prepare(
          'SELECT * FROM likes WHERE projects_id = ? AND user_id = ?'
        ).bind(id, userId).first()
        isLiked = !!like
        isOwner = project.user_id === userId
      }

      return c.json({
        project: {
          ...project,
          isLiked,
          isOwner
        }
      })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to load project' }, 500)
    }
  })

  app.post('/api/project/:id/like', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))

      const existing = await c.env.DB.prepare(
        'SELECT * FROM likes WHERE projects_id = ? AND user_id = ?'
      ).bind(id, payload.id).first()

      if (existing) {
        await c.env.DB.prepare(
          'DELETE FROM likes WHERE projects_id = ? AND user_id = ?'
        ).bind(id, payload.id).run()
        await c.env.DB.prepare(
          'UPDATE projects SET likes_count = likes_count - 1 WHERE id = ?'
        ).bind(id).run()
        return c.json({ liked: false })
      } else {
        await c.env.DB.prepare(
          'INSERT INTO likes (projects_id, user_id) VALUES (?, ?)'
        ).bind(id, payload.id).run()
        await c.env.DB.prepare(
          'UPDATE projects SET likes_count = likes_count + 1 WHERE id = ?'
        ).bind(id).run()
        return c.json({ liked: true })
      }
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to toggle like' }, 500)
    }
  })

  app.post('/api/project/:id/comments', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))
      const { content } = await c.req.json()

      if (!content || content.trim().length === 0) {
        return c.json({ error: 'Comment content is required' }, 400)
      }

      const result = await c.env.DB.prepare(
        `INSERT INTO comments (project_id, user_id, content, is_reply) VALUES (?, ?, ?, ?)`
      ).bind(id, payload.id, content.trim(), 0).run()

      await c.env.DB.prepare(
        'UPDATE projects SET comments_count = comments_count + 1 WHERE id = ?'
      ).bind(id).run()

      const comment = await c.env.DB.prepare(
        `SELECT 
          c.*,
          u.username as author,
          u.avatarUrl as authorProfile,
          u.userIcon as authorIcon,
          u.userTitle as authorTitle
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?`
      ).bind(result.meta?.last_row_id || result.lastInsertRowid).first()

      return c.json({ comment })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to add comment' }, 500)
    }
  })

  app.get('/api/project/:id/comments', async (c) => {
    try {
      const id = parseInt(c.req.param('id'))

      const comments = await c.env.DB.prepare(
        `SELECT 
          c.*,
          u.username as author,
          u.avatarUrl as authorProfile,
          u.userIcon as rankIcon,
          u.userTitle as rankTitle
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.project_id = ? AND c.is_reply = 0
        ORDER BY c.created_at ASC`
      ).bind(id).all()

      const commentsWithReplies = await Promise.all((comments.results || []).map(async (comment: any) => {
        const replies = await c.env.DB.prepare(
          `SELECT 
            r.*,
            u.username as author,
            u.avatarUrl as authorProfile,
            u.userIcon as rankIcon,
            u.userTitle as rankTitle
          FROM comments r
          LEFT JOIN users u ON r.user_id = u.id
          WHERE r.reply_id = ?
          ORDER BY r.created_at ASC`
        ).bind(comment.id).all()
        return { ...comment, replies: replies.results || [] }
      }))

      return c.json({ comments: commentsWithReplies })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to load comments' }, 500)
    }
  })

  app.delete('/api/comments/:id', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))

      const comment = await c.env.DB.prepare(
        'SELECT * FROM comments WHERE id = ?'
      ).bind(id).first()

      if (!comment) return c.json({ error: 'Comment not found' }, 404)

      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      const isAdmin = user?.admin === 1 || user?.admin === 2
      const isOwner = comment.user_id === payload.id

      if (!isAdmin && !isOwner) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      await c.env.DB.prepare(
        'DELETE FROM comments WHERE id = ? OR reply_id = ?'
      ).bind(id, id).run()

      await c.env.DB.prepare(
        'UPDATE projects SET comments_count = comments_count - 1 WHERE id = ?'
      ).bind(comment.project_id).run()

      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to delete comment' }, 500)
    }
  })

  app.post('/api/comments/:id/reply', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const parentId = parseInt(c.req.param('id'))
      const { content } = await c.req.json()

      if (!content || content.trim().length === 0) {
        return c.json({ error: 'Reply content is required' }, 400)
      }

      const parent = await c.env.DB.prepare(
        'SELECT * FROM comments WHERE id = ?'
      ).bind(parentId).first()

      if (!parent) return c.json({ error: 'Parent comment not found' }, 404)

      const result = await c.env.DB.prepare(
        `INSERT INTO comments (project_id, user_id, content, is_reply, reply_id) 
         VALUES (?, ?, ?, ?, ?)`
      ).bind(parent.project_id, payload.id, content.trim(), 1, parentId).run()

      await c.env.DB.prepare(
        'UPDATE projects SET comments_count = comments_count + 1 WHERE id = ?'
      ).bind(parent.project_id).run()

      const reply = await c.env.DB.prepare(
        `SELECT 
          c.*,
          u.username as author,
          u.avatarUrl as authorProfile,
          u.userIcon as authorIcon,
          u.userTitle as authorTitle
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?`
      ).bind(result.meta?.last_row_id || result.lastInsertRowid).first()

      return c.json({ reply })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to add reply' }, 500)
    }
  })

app.put('/api/project/:id', async (c) => {
  try {
    const token = getTokenFromCookie(c)
    if (!token) return c.json({ error: 'Unauthorized' }, 401)

    const payload = await verifyCookie(token, c)
    const id = parseInt(c.req.param('id'))
    const { title, description, content, imageUrl } = await c.req.json()

    await c.env.DB.prepare(
      `UPDATE projects SET content = COALESCE(?, content) ...`
    ).bind(content || null)

    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    if (project.user_id !== payload.id && !(payload.admin === 1 || payload.admin === 2)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    await c.env.DB.prepare(
      `UPDATE projects SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        content = COALESCE(?, content),
        imageUrl = COALESCE(?, imageUrl),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).bind(
      title || null,
      description || null,
      content || null,
      imageUrl || null,
      id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to update project' }, 500)
  }
})

  app.delete('/api/project/:id', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))

      const project = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      ).bind(id).first()

      if (!project) return c.json({ error: 'Project not found' }, 404)

      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      const isAdmin = user?.admin === 1 || user?.admin === 2
      if (project.user_id !== payload.id && !isAdmin) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      await c.env.DB.prepare(
        'DELETE FROM projects WHERE id = ?'
      ).bind(id).run()

      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to delete project' }, 500)
    }
  })

  app.post('/api/project/:id/publish', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))

      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      if (!(user?.admin === 1 || user?.admin === 2)) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      await c.env.DB.prepare(
        'UPDATE projects SET is_published = 1, is_trends = 1 WHERE id = ?'
      ).bind(id).run()

      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to publish project' }, 500)
    }
  })

  app.post('/api/project/:id/publish-entertaiment', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))

      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      if (!(user?.admin === 1 || user?.admin === 2)) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      await c.env.DB.prepare(
        'UPDATE projects SET is_published = 1, is_entertaiment = 1 WHERE id = ?'
      ).bind(id).run()

      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to publish to entertainment' }, 500)
    }
  })

  app.post('/api/project/:id/unpublish', async (c) => {
    try {
      const token = getTokenFromCookie(c)
      if (!token) return c.json({ error: 'Unauthorized' }, 401)

      const payload = await verifyCookie(token, c)
      const id = parseInt(c.req.param('id'))

      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      if (!(user?.admin === 1 || user?.admin === 2)) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      await c.env.DB.prepare(
        'UPDATE projects SET is_published = 0, is_trends = NULL, is_entertaiment = NULL WHERE id = ?'
      ).bind(id).run()

      return c.json({ success: true })
    } catch (error) {
      console.error(error)
      return c.json({ error: 'Failed to unpublish project' }, 500)
    }
  })
}