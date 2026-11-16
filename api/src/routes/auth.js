import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import db, { withTransaction } from '../config/database.js'
import { asyncRoute, HttpError } from '../middlewares/errorHandler.js'
import { authenticate, issueToken } from '../middlewares/auth.js'

const router = Router()
const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  role: z.enum(['customer', 'provider']).default('customer'),
})
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, city: user.city, region: user.region, bio: user.bio, createdAt: user.created_at })
const findUser = (id) => db.execute('SELECT id, name, email, role, city, region, bio, created_at FROM users WHERE id = ?', [id]).then(([rows]) => rows[0])

router.post('/register', asyncRoute(async (req, res) => {
  const data = signupSchema.parse(req.body)
  const email = data.email.toLowerCase()
  const [existing] = await db.execute('SELECT 1 FROM users WHERE email = ?', [email])
  if (existing.length) throw new HttpError(409, 'Já existe uma conta com este e-mail.')
  const id = randomUUID()
  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(data.password, 12)
  await withTransaction(async (connection) => {
    await connection.execute('INSERT INTO users(id,name,email,password_hash,role,city,region,bio,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', [id, data.name, email, passwordHash, data.role, '', '', '', now, now])
    if (data.role === 'provider') await connection.execute('INSERT INTO provider_profiles(user_id,categories,neighborhoods,services,active) VALUES(?,?,?,?,0)', [id, JSON.stringify([]), JSON.stringify([]), JSON.stringify([])])
  })
  const user = await findUser(id)
  res.status(201).json({ user: publicUser(user), token: issueToken(user) })
}))

router.post('/login', asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72) }).parse(req.body)
  const [rows] = await db.execute('SELECT id, password_hash FROM users WHERE email = ?', [input.email.toLowerCase()])
  const row = rows[0]
  if (!row || !(await bcrypt.compare(input.password, row.password_hash))) throw new HttpError(401, 'E-mail ou senha incorretos.')
  const user = await findUser(row.id)
  res.json({ user: publicUser(user), token: issueToken(user) })
}))

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }))
router.post('/refresh', authenticate, (req, res) => res.json({ user: req.user, token: issueToken(req.user) }))
router.post('/logout', authenticate, (_req, res) => res.status(204).end())

export default router
