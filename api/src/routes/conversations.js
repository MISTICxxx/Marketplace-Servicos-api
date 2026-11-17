import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import db, { withTransaction } from '../config/database.js'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { asyncRoute, HttpError } from '../middlewares/errorHandler.js'

const router = Router()
router.use(authenticate)
const base = `SELECT c.id,c.request_id AS requestId,c.owner_id AS ownerId,c.provider_id AS providerId,c.created_at AS createdAt,c.updated_at AS updatedAt,c.last_message_at AS lastMessageAt FROM conversations c`
async function hydrate(conversation) {
  if (!conversation) return null
  const [[messages], [requests], [customers], [providers]] = await Promise.all([
    db.execute('SELECT id,conversation_id AS conversationId,sender_id AS senderId,sender_type AS senderType,text,sent_at AS sentAt,read_at AS readAt FROM messages WHERE conversation_id=? ORDER BY sent_at', [conversation.id]),
    db.execute('SELECT id,title,category_id AS categoryId,status FROM service_requests WHERE id=?', [conversation.requestId]),
    db.execute('SELECT id,name FROM users WHERE id=?', [conversation.ownerId]),
    db.execute(`SELECT u.id,u.name,u.city,u.region,u.bio,p.specialty,p.summary,p.categories,p.neighborhoods,p.services FROM users u JOIN provider_profiles p ON p.user_id=u.id WHERE u.id=?`, [conversation.providerId]),
  ])
  const provider = providers[0]
  if (provider) {
    for (const field of ['categories', 'neighborhoods', 'services']) {
      if (typeof provider[field] === 'string') provider[field] = JSON.parse(provider[field])
    }
  }
  return { ...conversation, messages, request: requests[0] || null, customer: customers[0] || null, provider: provider || null }
}
async function participant(id, userId) {
  const [rows] = await db.execute(`${base} WHERE c.id=? AND (c.owner_id=? OR c.provider_id=?)`, [id, userId, userId])
  return rows[0] || null
}
router.get('/', asyncRoute(async (req, res) => {
  const field = req.user.role === 'provider' ? 'provider_id' : 'owner_id'
  const [rows] = await db.execute(`${base} WHERE c.${field}=? ORDER BY COALESCE(c.last_message_at,c.created_at) DESC`, [req.user.id])
  res.json({ data: await Promise.all(rows.map(hydrate)) })
}))
router.post('/', requireRole('customer'), asyncRoute(async (req, res) => {
  const { requestId, providerId } = z.object({ requestId: z.string().uuid(), providerId: z.string().uuid() }).parse(req.body)
  const [requests] = await db.execute('SELECT id,status FROM service_requests WHERE id=? AND owner_id=?', [requestId, req.user.id])
  const request = requests[0]
  if (!request) throw new HttpError(404, 'Pedido não encontrado para esta conta.')
  if (request.status !== 'open') throw new HttpError(409, 'Pedidos cancelados não aceitam novas conversas.')
  const [providers] = await db.execute("SELECT u.id FROM users u JOIN provider_profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='provider' AND p.active=1", [providerId])
  if (!providers[0]) throw new HttpError(404, 'Prestador não encontrado.')
  const [existingRows] = await db.execute(`${base} WHERE c.request_id=? AND c.provider_id=?`, [requestId, providerId])
  if (existingRows[0]) return res.json({ conversation: await hydrate(existingRows[0]), created: false })
  const id = randomUUID(), now = new Date().toISOString()
  try {
    await db.execute('INSERT INTO conversations(id,request_id,owner_id,provider_id,created_at,updated_at) VALUES(?,?,?,?,?,?)', [id, requestId, req.user.id, providerId, now, now])
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error
    const [rows] = await db.execute(`${base} WHERE c.request_id=? AND c.provider_id=?`, [requestId, providerId])
    return res.json({ conversation: await hydrate(rows[0]), created: false })
  }
  const [rows] = await db.execute(`${base} WHERE c.id=?`, [id])
  res.status(201).json({ conversation: await hydrate(rows[0]), created: true })
}))
router.get('/:id', asyncRoute(async (req, res) => {
  const conversation = await participant(req.params.id, req.user.id)
  if (!conversation) throw new HttpError(404, 'Conversa não encontrada.')
  res.json({ conversation: await hydrate(conversation) })
}))
router.post('/:id/messages', asyncRoute(async (req, res) => {
  const current = await participant(req.params.id, req.user.id)
  if (!current) throw new HttpError(404, 'Conversa não encontrada.')
  const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body)
  const [requests] = await db.execute('SELECT status FROM service_requests WHERE id=?', [current.requestId])
  if (!['open', 'contracted'].includes(requests[0]?.status)) throw new HttpError(409, 'O pedido associado não aceita novas mensagens.')
  const senderType = req.user.id === current.providerId ? 'provider' : 'customer'
  const now = new Date().toISOString(), messageId = randomUUID()
  await withTransaction(async (connection) => {
    await connection.execute('INSERT INTO messages(id,conversation_id,sender_id,sender_type,text,sent_at) VALUES(?,?,?,?,?,?)', [messageId, req.params.id, req.user.id, senderType, text, now])
    await connection.execute('UPDATE conversations SET last_message_at=?,updated_at=? WHERE id=?', [now, now, req.params.id])
  })
  const updated = await participant(req.params.id, req.user.id)
  res.status(201).json({ conversation: await hydrate(updated) })
}))
router.post('/:id/read', asyncRoute(async (req, res) => {
  const current = await participant(req.params.id, req.user.id)
  if (!current) throw new HttpError(404, 'Conversa não encontrada.')
  const ownType = req.user.id === current.providerId ? 'provider' : 'customer'
  await db.execute('UPDATE messages SET read_at=? WHERE conversation_id=? AND sender_type<>? AND read_at IS NULL', [new Date().toISOString(), req.params.id, ownType])
  res.json({ conversation: await hydrate(await participant(req.params.id, req.user.id)) })
}))
export default router
