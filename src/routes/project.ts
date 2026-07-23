import { Hono } from 'hono'
import { getTokenFromCookie, verifyCookie } from '../utils/cookie'
import {CHECK_ALLOWED_URLS} from '../config'

async function verifyTurnstile(token: string, secret: string) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token })
  })
  const data = await res.json()
  return data.success
}


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

      const check = await c.env.DB.prepare('SELECT is_published, user_id FROM projects WHERE id=?').bind(id).first()
      if (!check.is_published && Number(check.user_id) !== Number(userId))
        return c.json({ error: 'Project not found' }, 404)

      const project = await c.env.DB.prepare(
        `SELECT 
          p.*,
          u.username as author,
          u.avatarUrl as authorProfile,
          u.userIcon as authorIcon,
          u.userTitle as authorTitle,
          p.likes_count as likes,
          p.comments_count as comments,
          p.views_count as views,
          p.is_published as is_published
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
  }
}


await c.env.DB.prepare(
  'UPDATE projects SET views_count = (SELECT COUNT(*) FROM views WHERE projects_id = ?) WHERE id = ?'
).bind(id, id).run()


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
      const project = await c.env.DB.prepare(
        'SELECT user_id FROM projects WHERE id = ?'
      ).bind(id).first()
      if (project.user_id === payload.id) {
        return c.json({ error: 'You cannot like your own project' }, 403)
      }
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

    const banned = await c.env.DB.prepare(
      'SELECT * FROM admin_ban WHERE user_id = ? AND (duration IS NULL OR duration > datetime("now"))'
    ).bind(payload.id).first()
    if (banned) return c.json({ error: 'You banned' }, 403)

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO users_api_limits (user_id) VALUES (?)`
    ).bind(payload.id).run()

    const limits = await c.env.DB.prepare(
      'SELECT api_limit_create_comments_per_minute, api_limit_comments_exempt FROM users_api_limits WHERE user_id = ?'
    ).bind(payload.id).first()

    let limitPerMinute = 3
    let isExempt = 0
    if (limits) {
      limitPerMinute = limits.api_limit_create_comments_per_minute
      isExempt = limits.api_limit_comments_exempt
    }

    if (isExempt === 0) {
      const count = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users_api_limits_use
         WHERE user_id = ? AND action = 1 AND created_at >= datetime('now', '-1 minute')`
      ).bind(payload.id).first()

      if (count.cnt >= limitPerMinute) {
        return c.json({ error: 'Слишком много комментариев за минуту, попробуйте позже' }, 429)
      }
    }

    const id = parseInt(c.req.param('id'))
    try {
      const pub = await c.env.DB.prepare(`
        SELECT is_published FROM projects WHERE id = ?
      `).bind(id).first()
      console.log(pub)
      if (pub.is_published === 0){
        return c.json({error:"Нельзя писать комментарии в не опубликованном проекте"}, 403)
      }
    } catch (error) {
      c.json({error:"Этого проекта не существует"}, 403)
    }
    const { content, turnstileToken } = await c.req.json()

    if (!turnstileToken) {
      return c.json({ error: 'Captcha required' }, 400)
    }

    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
    if (!isHuman) {
      return c.json({ error: 'Invalid captcha' }, 400)
    }

    if (!content || content.trim().length === 0) {
      return c.json({ error: 'Comment content is required' }, 400)
    }

    if (content.length > 300) {
      return c.json({ error: 'Комментарий не может быть больше 300 символов' }, 400)
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO comments (project_id, user_id, content, is_reply) VALUES (?, ?, ?, ?)`
    ).bind(id, payload.id, content.trim(), 0).run()

    await c.env.DB.prepare(
      'UPDATE projects SET comments_count = comments_count + 1 WHERE id = ?'
    ).bind(id).run()

    await c.env.DB.prepare(
      'INSERT INTO users_api_limits_use (user_id, action) VALUES (?, 1)'
    ).bind(payload.id).run()

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
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const replyLimit = parseInt(c.req.query('replyLimit') || '5')
    const offset = (page - 1) * limit

    const comments = await c.env.DB.prepare(
      `SELECT 
        c.*,
        u.username as author,
        u.avatarUrl as authorProfile,
        u.userIcon as authorIcon,
        u.userTitle as authorTitle
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.project_id = ? AND c.is_reply = 0
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`
    ).bind(id, limit, offset).all()

    const commentsWithReplies = await Promise.all((comments.results || []).map(async (comment: any) => {
      const replies = await c.env.DB.prepare(
        `SELECT 
          r.*,
          u.username as author,
          u.avatarUrl as authorProfile,
          u.userIcon as authorIcon,
          u.userTitle as authorTitle
        FROM comments r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.reply_id = ?
        ORDER BY r.created_at DESC
        LIMIT ?`
      ).bind(comment.id, replyLimit).all()
      const totalReplies = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM comments WHERE reply_id = ?'
      ).bind(comment.id).first()
      return { 
        ...comment, 
        replies: replies.results || [],
        totalReplies: totalReplies?.count || 0 
      }
    }))

    const total = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM comments WHERE project_id = ? AND is_reply = 0'
    ).bind(id).first()

    return c.json({
      comments: commentsWithReplies,
      total: total?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((total?.count || 0) / limit)
    })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to load comments' }, 500)
  }
})

app.get('/api/comments/:id/replies', async (c) => {
  try {
    const commentId = parseInt(c.req.param('id'))
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '5')
    const offset = (page - 1) * limit

    const replies = await c.env.DB.prepare(
      `SELECT 
        r.*,
        u.username as author,
        u.avatarUrl as authorProfile,
        u.userIcon as authorIcon,
        u.userTitle as authorTitle
      FROM comments r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.reply_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`
    ).bind(commentId, limit, offset).all()

    const total = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM comments WHERE reply_id = ?'
    ).bind(commentId).first()

    return c.json({
      replies: replies.results || [],
      total: total?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((total?.count || 0) / limit)
    })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to load replies' }, 500)
  }
})

/*
app.get('/api/comments/:id/replies/all', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const replies = await c.env.DB.prepare(
      `SELECT 
        r.*,
        u.username as author,
        u.avatarUrl as authorProfile,
        u.userIcon as authorIcon,
        u.userTitle as authorTitle
      FROM comments r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.reply_id = ?
      ORDER BY r.created_at ASC`
    ).bind(id).all()
    return c.json({ replies: replies.results || [] })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to load replies' }, 500)
  }
})*/

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

      const isAdmin = user?.admin > 1
      const isOwner = comment.user_id === payload.id

      const { turnstileToken } = await c.req.json()
      if (user.admin && !turnstileToken) {
        return c.json({ error: 'Captcha required for admin actions' }, 400)
      }
      if (user.admin) {
        const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
        if (!isHuman) {
          return c.json({ error: 'Invalid captcha' }, 400)
        }
      }

      if (!isAdmin && !isOwner) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      if (isAdmin && !isOwner) {

        const logMessage = `Админ ${user.username} (${user.id}) удалил комментарий c проекта (${comment.project_id})`
        await c.env.DB.prepare(
          'INSERT INTO admin_log (user_id, content) VALUES (?, ?)'
        ).bind(user.id, logMessage).run()

        const banned = await c.env.DB.prepare(
        'SELECT * FROM admin_ban WHERE user_id = ?'
      ).bind(payload.id).first()
      if(banned) { return c.json({error: 'You banned'},403)}
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

    const banned = await c.env.DB.prepare(
      'SELECT * FROM admin_ban WHERE user_id = ? AND (duration IS NULL OR duration > datetime("now"))'
    ).bind(payload.id).first()
    if (banned) return c.json({ error: 'You are banned' }, 403)

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO users_api_limits (user_id) VALUES (?)`
    ).bind(payload.id).run()

    const limits = await c.env.DB.prepare(
      'SELECT api_limit_create_comments_per_minute, api_limit_comments_exempt FROM users_api_limits WHERE user_id = ?'
    ).bind(payload.id).first()

    let limitPerMinute = 3
    let isExempt = 0
    if (limits) {
      limitPerMinute = limits.api_limit_create_comments_per_minute
      isExempt = limits.api_limit_comments_exempt
    }

    if (isExempt === 0) {
      const count = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users_api_limits_use
         WHERE user_id = ? AND action = 1 AND created_at >= datetime('now', '-1 minute')`
      ).bind(payload.id).first()

      if (count.cnt >= limitPerMinute) {
        return c.json({ error: 'Слишком много комментариев за минуту, попробуйте позже' }, 429)
      }
    }

    const parentId = parseInt(c.req.param('id'))
    
    try {
      const xd = await c.env.DB.prepare(`
        SELECT project_id FROM comments WHERE id = ?
      `).bind(parentId).first()
      const pub = await c.env.DB.prepare(`
        SELECT is_published FROM projects WHERE id = ?
      `).bind(xd.project_id).first()

      if (pub.is_published === 0){
        return c.json({error:"Нельзя писать ответы в не опубликованном проекте"}, 403)
      }
    } catch (error) {
      c.json({error:"Этого проекта не существует"}, 403)
    }

    const { content, turnstileToken } = await c.req.json()

    if (!turnstileToken) {
      return c.json({ error: 'Captcha required' }, 400)
    }

    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
    if (!isHuman) {
      return c.json({ error: 'Invalid captcha' }, 400)
    }

    if (!content || content.trim().length === 0) {
      return c.json({ error: 'Reply content is required' }, 400)
    }
    if (content.length > 300) {
      return c.json({ error: 'Ответ на комментарий не может быть больше 300 символов' }, 400)
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

    await c.env.DB.prepare(
      'INSERT INTO users_api_limits_use (user_id, action) VALUES (?, 1)'
    ).bind(payload.id).run()

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

    if (!title || title.length < 1 || title.length > 100) {
      return c.json({ error: 'Название должно быть от 1 до 100 символов' }, 400)
    }

    if (imageUrl && imageUrl.length > 256) {
      return c.json({ error: 'Ссылка на изображение должно от 1 до 256 символов' }, 400)
    }

    if (description && description.length > 1024) {
      return c.json({ error: 'Описание должно от 1 до 1024 символов' }, 400)
    }

    /*const check = CHECK_ALLOWED_URLS(c, content);
    if (check !== true) return check;*/

    const check2 = CHECK_ALLOWED_URLS(c, imageUrl);
    if (check2 !== true) return check2;

    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    if (project.user_id !== payload.id) { 
      return c.json({ error: 'Forbidden' }, 403)
    }
    //&& !(payload.admin === 1 || payload.admin === 2)
    let finalContent = content

if (content !== undefined && content !== null) {
  if (typeof content === 'string') {
    if (content.length > 256) {
      return c.json({ error: 'Content must be less than 256 characters' }, 400)
    }
    const check = CHECK_ALLOWED_URLS(c, content);
    if (check !== true) return check;
    finalContent = content
  } else if (Array.isArray(content)) {
    if (content.length > 10) {
      return c.json({ error: 'Maximum 10 media files allowed' }, 400)
    }
    for (const item of content) {
      if (typeof item !== 'string') {
        return c.json({ error: 'Invalid content format' }, 400)
      }
      if (item.length > 256) {
        return c.json({ error: 'Each media URL must be less than 256 characters' }, 400)
      }
      const check = CHECK_ALLOWED_URLS(c, item);
      if (check !== true) return check;
    }
    finalContent = JSON.stringify(content)
  } else {
    return c.json({ error: 'Invalid content format' }, 400)
  }
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
      finalContent || null,
      imageUrl || null,
      id
    ).run()

    const updated = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first()

    return c.json({ success: true, project: updated })
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

      //const isAdmin = user?.admin > 1 //&& !isAdmin
      if (project.user_id !== payload.id) {
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
    const banned = await c.env.DB.prepare(
        'SELECT * FROM admin_ban WHERE user_id = ?'
      ).bind(payload.id).first()
      if(banned) { return c.json({error: 'You banned'},403)}

      const id = parseInt(c.req.param('id'))

      const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first()

      if (!project) return c.json({ error: 'Project not found' }, 404)

      if (project.user_id !== payload.id) { 
        return c.json({ error: 'Project not found' }, 404)
      }
      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      await c.env.DB.prepare(
        'UPDATE projects SET is_published = 1, is_trends = 0 WHERE id = ?'
      ).bind(id).run()
      await c.env.DB.prepare(
        'UPDATE projects SET publish_at = CURRENT_TIMESTAMP WHERE id = ? AND publish_at IS NULL'
      ).bind(id).run();

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

    const banned = await c.env.DB.prepare(
        'SELECT * FROM admin_ban WHERE user_id = ?'
      ).bind(payload.id).first()
      if(banned) { return c.json({error: 'You banned'},403)}

      const id = parseInt(c.req.param('id'))

      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(payload.id).first()

      const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first()

      if (!project) return c.json({ error: 'Project not found' }, 404)

      if (project.user_id !== payload.id) { 
        return c.json({ error: 'Project not found' }, 404)
      }

      if (!(user?.admin > 0)) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      await c.env.DB.prepare(
        'UPDATE projects SET is_published = 1, publish_at = CURRENT_TIMESTAMP, is_entertaiment = 1 WHERE id = ?'
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

      const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first()

      if (!project) return c.json({ error: 'Project not found' }, 404)
      if (!project.is_published) return c.json({error:'Project is unpublished'}, 403)
      if (!(user?.admin > 1 || project.user_id !== payload.id)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      if (user?.admin > 1 && project.user_id !== payload.id) {
/*
      const { turnstileToken } = await c.req.json()

      if (!turnstileToken) {
        return c.json({ error: 'Captcha required' }, 400)
      }

      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET)
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400)
      }
*/

        const logMessage = `Админ ${user.username} (${user.id}) снял с публикации проект ${project.title} (${project.id}) у (${project.user_id})`
        await c.env.DB.prepare(
          'INSERT INTO admin_log (user_id, content) VALUES (?, ?)'
        ).bind(user.id, logMessage).run()

      const banned = await c.env.DB.prepare(
          'SELECT * FROM admin_ban WHERE user_id = ?'
        ).bind(payload.id).first()
      if(banned) { return c.json({error: 'You banned'},403)}
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

  //REWARD GIVERS
  app.get('/api/project/:id/rewards', async (c) => {
  try {
    const projectId = parseInt(c.req.param('id'))
    if (!projectId) return c.json({ error: 'Invalid project ID' }, 400)

    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '5')
    const offset = (page - 1) * limit

    const project = await c.env.DB.prepare('SELECT is_published FROM projects WHERE id = ?').bind(projectId).first()
    if (!project) return c.json({ error: 'Project not found' }, 404)
    if (project.is_published === 0) return c.json({ error: 'Project not found' }, 404)

    const users = await c.env.DB.prepare(`
      SELECT 
        u.id,
        u.username as name,
        u.avatarUrl,
        u.userIcon as rankIcon,
        u.userTitle as rankTitle
      FROM reward_giver rg
      JOIN users u ON rg.user_id = u.id
      WHERE rg.project_id = ?
      ORDER BY rg.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(projectId, limit, offset).all()

    const total = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM reward_giver 
      WHERE project_id = ?
    `).bind(projectId).first()

    return c.json({
      users: users.results || [],
      total: total?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((total?.count || 0) / limit)
    })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to load project rewards' }, 500)
  }
})
}