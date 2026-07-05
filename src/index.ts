import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './routes/auth'

import { my_profile } from './routes/my_profile'
import { my_projects } from './routes/my_projects'
import { project } from './routes/project'
import { search } from './routes/search'
import { projects } from './routes/projects'
import { user } from './routes/user'
import { trends } from './routes/trends'
import { entertainment } from './routes/entertainment'
import { admin } from './routes/admin'

//тестовый ключ капчи: 1x0000000000000000000000000000000AA

type Bindings = {
  DB: D1Database
  TURNSTILE_SECRET: string
  JWT_SECRET: string
}

const FRONTEND_URL = (BACKDEV_MODE: boolean): string => {
  return BACKDEV_MODE
    ? "http://localhost:5173"
    : "*"
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: (origin, c) => {
    const url = new URL(c.req.url)
    const BACKDEV_MODE = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0'
    return FRONTEND_URL(BACKDEV_MODE)
  },
  allowHeaders: ['Content-Type'],
  credentials: true
}))

auth(app)
my_profile(app)
my_projects(app)
project(app)
search(app)
projects(app)
user(app)
trends(app)
entertainment(app)
admin(app)

export default app