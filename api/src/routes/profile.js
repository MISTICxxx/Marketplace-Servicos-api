import { Router } from 'express'
import { z } from 'zod'
import db from '../config/database.js'
import { authenticate } from '../middlewares/auth.js'
import { asyncRoute, HttpError } from '../middlewares/errorHandler.js'

const router = Router()
router.use(authenticate)
router.get('/', (req, res) => res.json({ user: req.user }))
router.patch('/', asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2).max(100), city: z.string().trim().max(100).default(''), region: z.string().trim().max(50).default(''), bio: z.string().trim().max(2000).default('') }).parse(req.body)
  const [result] = await db.execute('UPDATE users SET name=?,city=?,region=?,bio=?,updated_at=? WHERE id=?', [data.name, data.city, data.region.toUpperCase(), data.bio, new Date().toISOString(), req.user.id])
  if (!result.affectedRows) throw new HttpError(404, 'Perfil não encontrado.')
  const [users] = await db.execute('SELECT id,name,email,role,city,region,bio,created_at AS createdAt,updated_at AS updatedAt FROM users WHERE id=?', [req.user.id])
  res.json({ user: users[0] })
}))
export default router
