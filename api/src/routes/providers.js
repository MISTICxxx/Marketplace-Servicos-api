import { Router } from 'express'
import { z } from 'zod'
import db from '../config/database.js'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { asyncRoute, HttpError } from '../middlewares/errorHandler.js'

const router = Router()
const categories = ['eletrica', 'hidraulica', 'limpeza', 'montagem-moveis', 'pintura', 'jardinagem', 'reparos', 'outros']
const decode = (row) => row && ({ ...row, categories: typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories, neighborhoods: typeof row.neighborhoods === 'string' ? JSON.parse(row.neighborhoods) : row.neighborhoods, services: typeof row.services === 'string' ? JSON.parse(row.services) : row.services })
const profileQuery = `SELECT u.id,u.name,u.city,u.region,u.bio,p.specialty,p.summary,p.categories,p.neighborhoods,p.services FROM users u JOIN provider_profiles p ON p.user_id=u.id`
const ownProfileQuery = `SELECT u.id,u.name,u.city,u.region,u.bio,p.specialty,p.summary,p.categories,p.neighborhoods,p.services,p.active FROM users u JOIN provider_profiles p ON p.user_id=u.id`
const decodeOwnProfile = (row) => {
  const provider = decode(row)
  return provider && { ...provider, active: Number(row.active) === 1 }
}

router.get('/categories', (_req, res) => res.json({ data: categories }))
router.get('/', asyncRoute(async (req, res) => {
  const search = String(req.query.q || '').trim().toLocaleLowerCase('pt-BR')
  const category = String(req.query.category || '')
  const neighborhood = String(req.query.neighborhood || '')
  const [rows] = await db.query(`${profileQuery} WHERE p.active=1 ORDER BY u.name`)
  const providers = rows.map(decode).filter((provider) => (!category || provider.categories.includes(category))
    && (!neighborhood || provider.neighborhoods.includes(neighborhood))
    && (!search || [provider.name, provider.specialty, provider.summary, provider.bio, ...provider.neighborhoods, ...provider.services.map(({ name }) => name)].join(' ').toLocaleLowerCase('pt-BR').includes(search)))
  res.json({ data: providers })
}))
router.put('/me', authenticate, requireRole('provider'), asyncRoute(async (req, res) => {
  const data = z.object({ specialty: z.string().trim().max(100).default(''), summary: z.string().trim().max(300).default(''), categories: z.array(z.enum(categories)).max(8).default([]), neighborhoods: z.array(z.string().trim().min(1).max(100)).max(50).default([]), services: z.array(z.object({ name: z.string().trim().min(1).max(100), priceFrom: z.number().nonnegative().nullable().default(null) })).max(30).default([]), active: z.boolean().default(true) }).parse(req.body)
  await db.execute(`INSERT INTO provider_profiles(user_id,specialty,summary,categories,neighborhoods,services,active) VALUES(?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE specialty=VALUES(specialty),summary=VALUES(summary),categories=VALUES(categories),neighborhoods=VALUES(neighborhoods),services=VALUES(services),active=VALUES(active)`,
  [req.user.id, data.specialty, data.summary, JSON.stringify(data.categories), JSON.stringify(data.neighborhoods), JSON.stringify(data.services), Number(data.active)])
  const [rows] = await db.execute(`${ownProfileQuery} WHERE u.id=?`, [req.user.id])
  res.json({ provider: decodeOwnProfile(rows[0]) })
}))
router.get('/me', authenticate, requireRole('provider'), asyncRoute(async (req, res) => {
  const [rows] = await db.execute(`${ownProfileQuery} WHERE u.id=?`, [req.user.id])
  if (!rows[0]) throw new HttpError(404, 'Perfil de prestador não encontrado.')
  res.json({ provider: decodeOwnProfile(rows[0]) })
}))
router.get('/:id', asyncRoute(async (req, res) => {
  const [rows] = await db.execute(`${profileQuery} WHERE u.id=? AND p.active=1`, [req.params.id])
  if (!rows[0]) throw new HttpError(404, 'Prestador não encontrado.')
  res.json({ provider: decode(rows[0]) })
}))

export default router
