import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import db, { withTransaction } from '../config/database.js'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { asyncRoute, HttpError } from '../middlewares/errorHandler.js'

const router = Router()
router.use(authenticate)
const categories = ['eletrica', 'hidraulica', 'limpeza', 'montagem-moveis', 'pintura', 'jardinagem', 'reparos', 'outros']
const detailsSchema = z.object({ title: z.string().trim().min(3).max(120), categoryId: z.enum(categories), description: z.string().trim().min(10).max(5000), city: z.string().trim().min(2).max(100), region: z.string().trim().min(2).max(50), neighborhood: z.string().trim().max(100).nullable().optional(), desiredDate: z.string().date().nullable().optional(), availability: z.string().trim().max(200).nullable().optional(), budgetMin: z.number().nonnegative().nullable().optional(), budgetMax: z.number().nonnegative().nullable().optional(), prefersProposals: z.boolean().default(false) }).refine((data) => data.budgetMin == null || data.budgetMax == null || data.budgetMin <= data.budgetMax, { message: 'O valor mínimo deve ser menor ou igual ao máximo.', path: ['budgetMax'] })
const columns = `id,owner_id AS ownerId,title,category_id AS categoryId,description,city,region,neighborhood,desired_date AS desiredDate,availability,budget_min AS budgetMin,budget_max AS budgetMax,prefers_proposals AS prefersProposals,status,created_at AS createdAt,updated_at AS updatedAt`
async function byId(id) {
  const [requests] = await db.execute(`SELECT ${columns} FROM service_requests WHERE id=?`, [id])
  const request = requests[0]
  if (!request) return null
  request.prefersProposals = Boolean(request.prefersProposals)
  const [history] = await db.execute('SELECT id,event,description,created_at AS createdAt FROM request_history WHERE request_id=? ORDER BY created_at', [id])
  request.history = history
  return request
}
async function addHistory(connection, requestId, event, description, now) {
  await connection.execute('INSERT INTO request_history(id,request_id,event,description,created_at) VALUES(?,?,?,?,?)', [randomUUID(), requestId, event, description, now])
}
router.get('/', asyncRoute(async (req, res) => {
  const [rows] = await db.execute(`SELECT ${columns} FROM service_requests WHERE owner_id=? ORDER BY created_at DESC`, [req.user.id])
  res.json({ data: await Promise.all(rows.map(({ id }) => byId(id))) })
}))
router.get('/open', requireRole('provider'), asyncRoute(async (_req, res) => {
  const [rows] = await db.query(`SELECT ${columns} FROM service_requests WHERE status='open' ORDER BY created_at DESC LIMIT 200`)
  res.json({ data: await Promise.all(rows.map(({ id }) => byId(id))) })
}))
router.post('/', asyncRoute(async (req, res) => {
  if (req.user.role !== 'customer') throw new HttpError(403, 'Somente contas de cliente podem criar pedidos.')
  const data = detailsSchema.parse(req.body)
  const id = randomUUID(), now = new Date().toISOString()
  await withTransaction(async (connection) => {
    await connection.execute(`INSERT INTO service_requests(id,owner_id,title,category_id,description,city,region,neighborhood,desired_date,availability,budget_min,budget_max,prefers_proposals,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?)`,
      [id, req.user.id, data.title, data.categoryId, data.description, data.city, data.region.toUpperCase(), data.neighborhood || null, data.desiredDate || null, data.availability || null, data.prefersProposals ? null : data.budgetMin ?? null, data.prefersProposals ? null : data.budgetMax ?? null, Number(data.prefersProposals), now, now])
    await addHistory(connection, id, 'created', 'Pedido registrado.', now)
  })
  res.status(201).json({ request: await byId(id) })
}))
router.get('/:id', asyncRoute(async (req, res) => {
  const request = await byId(req.params.id)
  if (!request || (request.ownerId !== req.user.id && !(req.user.role === 'provider' && request.status === 'open'))) throw new HttpError(404, 'Pedido não encontrado.')
  res.json({ request })
}))
router.patch('/:id', asyncRoute(async (req, res) => {
  const current = await byId(req.params.id)
  if (!current || current.ownerId !== req.user.id) throw new HttpError(404, 'Pedido não encontrado.')
  if (current.status !== 'open') throw new HttpError(409, 'Somente pedidos abertos podem ser editados.')
  const data = detailsSchema.parse(req.body), now = new Date().toISOString()
  await withTransaction(async (connection) => {
    await connection.execute(`UPDATE service_requests SET title=?,category_id=?,description=?,city=?,region=?,neighborhood=?,desired_date=?,availability=?,budget_min=?,budget_max=?,prefers_proposals=?,updated_at=? WHERE id=?`,
      [data.title, data.categoryId, data.description, data.city, data.region.toUpperCase(), data.neighborhood || null, data.desiredDate || null, data.availability || null, data.prefersProposals ? null : data.budgetMin ?? null, data.prefersProposals ? null : data.budgetMax ?? null, Number(data.prefersProposals), now, req.params.id])
    await addHistory(connection, req.params.id, 'edited', 'Dados do pedido atualizados.', now)
  })
  res.json({ request: await byId(req.params.id) })
}))
router.post('/:id/cancel', asyncRoute(async (req, res) => {
  const current = await byId(req.params.id)
  if (!current || current.ownerId !== req.user.id) throw new HttpError(404, 'Pedido não encontrado.')
  if (current.status !== 'open') throw new HttpError(409, 'Somente pedidos abertos podem ser cancelados.')
  const now = new Date().toISOString()
  await withTransaction(async (connection) => {
    await connection.execute("UPDATE service_requests SET status='cancelled',updated_at=? WHERE id=?", [now, req.params.id])
    await addHistory(connection, req.params.id, 'cancelled', 'Pedido cancelado pela pessoa responsável.', now)
  })
  res.json({ request: await byId(req.params.id) })
}))
export default router
