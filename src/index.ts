import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './routes/auth'

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
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT'],
  allowHeaders: ['Content-Type'],
  credentials: true
}))

authRoutes(app)

export default app