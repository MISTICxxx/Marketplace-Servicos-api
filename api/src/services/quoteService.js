import { randomUUID } from 'node:crypto'
import db, { withTransaction } from '../config/database.js'
import { HttpError } from '../middlewares/errorHandler.js'
import { findOrderByRequest } from './serviceOrderService.js'

const dateForMysql = (value) => value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null
const dateForApi = (value) => typeof value === 'string' && value.includes(' ')
  ? `${value.replace(' ', 'T')}Z`
  : value

function decodeArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return JSON.parse(value)
  return []
}

function decodeVersion(row, prefix = '') {
  if (!row?.[`${prefix}versionId`]) return null
  const amountCents = Number(row[`${prefix}amountCents`])
  if (!Number.isSafeInteger(amountCents)) throw new Error('O valor do orçamento excede a precisão monetária suportada.')
  return {
    id: row[`${prefix}versionId`],
    quoteId: row[`${prefix}versionQuoteId`],
    versionNumber: Number(row[`${prefix}versionNumber`]),
    amountCents,
    description: row[`${prefix}description`],
    includedItems: decodeArray(row[`${prefix}includedItems`]),
    excludedItems: decodeArray(row[`${prefix}excludedItems`]),
    estimatedDays: row[`${prefix}estimatedDays`] == null ? null : Number(row[`${prefix}estimatedDays`]),
    conditions: row[`${prefix}conditions`],
    validUntil: dateForApi(row[`${prefix}validUntil`]),
    issuedAt: dateForApi(row[`${prefix}issuedAt`]),
  }
}

const currentQuoteColumns = `q.id,q.request_id AS requestId,q.conversation_id AS conversationId,
  q.provider_id AS providerId,q.title,q.status,q.current_version_id AS currentVersionId,
  q.created_at AS createdAt,q.updated_at AS updatedAt,u.name AS providerName,
  v.id AS versionId,v.quote_id AS versionQuoteId,v.version_number AS versionNumber,
  v.amount_cents AS amountCents,v.description,v.included_items AS includedItems,
  v.excluded_items AS excludedItems,v.estimated_days AS estimatedDays,v.conditions,
  v.valid_until AS validUntil,v.issued_at AS issuedAt`

function decodeQuote(row) {
  if (!row) return null
  return {
    id: row.id,
    requestId: row.requestId,
    conversationId: row.conversationId,
    providerId: row.providerId,
    providerName: row.providerName,
    title: row.title,
    status: row.status,
    currentVersionId: row.currentVersionId,
    currentVersion: decodeVersion(row),
    createdAt: dateForApi(row.createdAt),
    updatedAt: dateForApi(row.updatedAt),
  }
}

async function getCurrentQuote(executor, quoteId) {
  const [rows] = await executor.execute(`SELECT ${currentQuoteColumns}
    FROM quotes q JOIN users u ON u.id=q.provider_id
    LEFT JOIN quote_versions v ON v.id=q.current_version_id
    WHERE q.id=?`, [quoteId])
  return decodeQuote(rows[0])
}

async function getAccessibleQuote(executor, quoteId, userId, { forUpdate = false } = {}) {
  const [rows] = await executor.execute(`SELECT q.id,q.request_id AS requestId,q.provider_id AS providerId,
      r.owner_id AS ownerId,q.status,q.current_version_id AS currentVersionId
    FROM quotes q JOIN service_requests r ON r.id=q.request_id
    WHERE q.id=?${forUpdate ? ' FOR UPDATE' : ''}`, [quoteId])
  const quote = rows[0]
  if (!quote || (quote.ownerId !== userId && quote.providerId !== userId)) throw new HttpError(404, 'Orçamento não encontrado.')
  return quote
}

function versionValues(data) {
  return [
    data.amountCents,
    data.description,
    JSON.stringify(data.includedItems),
    JSON.stringify(data.excludedItems),
    data.estimatedDays,
    data.conditions,
    dateForMysql(data.validUntil),
  ]
}

async function insertVersion(connection, { id, quoteId, versionNumber, data, issuedAt }) {
  await connection.execute(`INSERT INTO quote_versions(id,quote_id,version_number,amount_cents,description,
    included_items,excluded_items,estimated_days,conditions,valid_until,issued_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [id, quoteId, versionNumber, ...versionValues(data), issuedAt])
}

export async function listQuotesForRequest(requestId, user) {
  const [requests] = await db.execute('SELECT id,owner_id AS ownerId FROM service_requests WHERE id=?', [requestId])
  const request = requests[0]
  if (!request) throw new HttpError(404, 'Solicitação não encontrada.')

  let providerFilter = ''
  const params = [requestId]
  if (user.role === 'customer') {
    if (request.ownerId !== user.id) throw new HttpError(404, 'Solicitação não encontrada.')
  } else if (user.role === 'provider') {
    const [conversations] = await db.execute('SELECT id FROM conversations WHERE request_id=? AND provider_id=?', [requestId, user.id])
    if (!conversations.length) throw new HttpError(404, 'Solicitação não encontrada.')
    providerFilter = ' AND q.provider_id=?'
    params.push(user.id)
  } else {
    throw new HttpError(403, 'Você não tem permissão para consultar estes orçamentos.')
  }

  const [rows] = await db.execute(`SELECT ${currentQuoteColumns}
    FROM quotes q JOIN users u ON u.id=q.provider_id
    LEFT JOIN quote_versions v ON v.id=q.current_version_id
    WHERE q.request_id=?${providerFilter} ORDER BY q.created_at,q.id`, params)
  return rows.map(decodeQuote)
}

export async function listQuotesForConversation(conversationId, userId) {
  const [conversations] = await db.execute('SELECT owner_id AS ownerId,provider_id AS providerId FROM conversations WHERE id=?', [conversationId])
  const conversation = conversations[0]
  if (!conversation || (conversation.ownerId !== userId && conversation.providerId !== userId)) {
    throw new HttpError(404, 'Conversa não encontrada.')
  }
  const providerFilter = conversation.providerId === userId ? ' AND q.provider_id=?' : ''
  const params = providerFilter ? [conversationId, userId] : [conversationId]
  const [rows] = await db.execute(`SELECT ${currentQuoteColumns}
    FROM quotes q JOIN users u ON u.id=q.provider_id
    LEFT JOIN quote_versions v ON v.id=q.current_version_id
    WHERE q.conversation_id=?${providerFilter} ORDER BY q.created_at,q.id`, params)
  return rows.map(decodeQuote)
}

export async function getQuote(quoteId, userId) {
  await getAccessibleQuote(db, quoteId, userId)
  return getCurrentQuote(db, quoteId)
}

export async function listQuoteVersions(quoteId, userId) {
  await getAccessibleQuote(db, quoteId, userId)
  const [rows] = await db.execute(`SELECT id AS versionId,quote_id AS versionQuoteId,version_number AS versionNumber,
    amount_cents AS amountCents,description,included_items AS includedItems,excluded_items AS excludedItems,
    estimated_days AS estimatedDays,conditions,valid_until AS validUntil,issued_at AS issuedAt
    FROM quote_versions WHERE quote_id=? ORDER BY version_number`, [quoteId])
  return rows.map((row) => decodeVersion(row))
}

export async function createQuote(conversationId, providerId, data) {
  const quoteId = randomUUID()
  const versionId = randomUUID()
  const issuedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT c.id,c.request_id AS requestId,c.provider_id AS providerId,r.status
      FROM conversations c JOIN service_requests r ON r.id=c.request_id
      WHERE c.id=? AND c.provider_id=? FOR UPDATE`, [conversationId, providerId])
    const conversation = rows[0]
    if (!conversation) throw new HttpError(404, 'Conversa não encontrada para esta conta.')
    if (conversation.status !== 'open') throw new HttpError(409, 'Somente solicitações abertas aceitam novos orçamentos.')

    await connection.execute(`INSERT INTO quotes(id,request_id,conversation_id,provider_id,title,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'active',?,?)`, [quoteId, conversation.requestId, conversationId, providerId, data.title, issuedAt, issuedAt])
    await insertVersion(connection, { id: versionId, quoteId, versionNumber: 1, data, issuedAt })
    await connection.execute('UPDATE quotes SET current_version_id=? WHERE id=?', [versionId, quoteId])
  })

  return getCurrentQuote(db, quoteId)
}

export async function reviseQuote(quoteId, providerId, data) {
  const versionId = randomUUID()
  const issuedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT q.id,q.current_version_id AS currentVersionId,q.status,r.status AS requestStatus
      FROM quotes q JOIN service_requests r ON r.id=q.request_id
      WHERE q.id=? AND q.provider_id=? FOR UPDATE`, [quoteId, providerId])
    const quote = rows[0]
    if (!quote) throw new HttpError(404, 'Orçamento não encontrado para esta conta.')
    if (quote.status !== 'active' || quote.requestStatus !== 'open') throw new HttpError(409, 'Este orçamento não pode mais receber revisões.')
    const [versions] = await connection.execute('SELECT version_number AS versionNumber FROM quote_versions WHERE id=? AND quote_id=? FOR UPDATE', [quote.currentVersionId, quoteId])
    if (!versions[0]) throw new HttpError(409, 'Orçamento sem uma versão vigente; solicite revisão técnica.')
    const versionNumber = Number(versions[0].versionNumber) + 1
    await insertVersion(connection, { id: versionId, quoteId, versionNumber, data, issuedAt })
    await connection.execute('UPDATE quotes SET current_version_id=?,updated_at=? WHERE id=?', [versionId, issuedAt, quoteId])
  })
  return getCurrentQuote(db, quoteId)
}

export async function withdrawQuote(quoteId, providerId) {
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT id,status FROM quotes WHERE id=? AND provider_id=? FOR UPDATE', [quoteId, providerId])
    const quote = rows[0]
    if (!quote) throw new HttpError(404, 'Orçamento não encontrado para esta conta.')
    if (quote.status === 'withdrawn') return
    if (quote.status !== 'active') throw new HttpError(409, 'Este orçamento já foi aceito ou encerrado.')
    await connection.execute("UPDATE quotes SET status='withdrawn',updated_at=? WHERE id=?", [new Date().toISOString().slice(0, 19).replace('T', ' '), quoteId])
  })
  return getCurrentQuote(db, quoteId)
}

export async function acceptQuoteVersion(quoteId, customerId, versionId) {
  const [quoteRows] = await db.execute('SELECT request_id AS requestId FROM quotes WHERE id=?', [quoteId])
  if (!quoteRows[0]) throw new HttpError(404, 'Orçamento não encontrado.')
  const requestId = quoteRows[0].requestId

  try {
    return await withTransaction(async (connection) => {
      const [requestRows] = await connection.execute('SELECT id,owner_id AS ownerId,status FROM service_requests WHERE id=? FOR UPDATE', [requestId])
      const request = requestRows[0]
      if (!request || request.ownerId !== customerId) throw new HttpError(404, 'Solicitação não encontrada.')

      const existingOrder = await findOrderByRequest(connection, requestId, { forUpdate: true })
      if (existingOrder) {
        if (existingOrder.quoteId === quoteId && existingOrder.quoteVersionId === versionId) {
          return { order: existingOrder, created: false }
        }
        throw new HttpError(409, 'Esta solicitação já possui uma contratação registrada.')
      }
      if (request.status !== 'open') throw new HttpError(409, 'Somente solicitações abertas podem ser contratadas.')

      const [quoteRowsLocked] = await connection.execute(`SELECT id,request_id AS requestId,conversation_id AS conversationId,
          provider_id AS providerId,title,status,current_version_id AS currentVersionId
        FROM quotes WHERE id=? AND request_id=? FOR UPDATE`, [quoteId, requestId])
      const quote = quoteRowsLocked[0]
      if (!quote) throw new HttpError(404, 'Orçamento não encontrado para esta solicitação.')
      if (quote.status !== 'active') throw new HttpError(409, 'Este orçamento não está disponível para aceite.')
      if (quote.currentVersionId !== versionId) throw new HttpError(409, 'A versão escolhida foi superada; atualize a comparação antes de aceitar.')

      const [versionRows] = await connection.execute(`SELECT id,quote_id AS quoteId,version_number AS versionNumber,
          amount_cents AS amountCents,description,included_items AS includedItems,excluded_items AS excludedItems,
          estimated_days AS estimatedDays,conditions,valid_until AS validUntil
        FROM quote_versions WHERE id=? AND quote_id=? FOR UPDATE`, [versionId, quoteId])
      const version = versionRows[0]
      if (!version) throw new HttpError(404, 'Versão do orçamento não encontrada.')
      if (version.validUntil && new Date(dateForApi(version.validUntil)).getTime() <= Date.now()) {
        throw new HttpError(409, 'A validade desta versão do orçamento expirou.')
      }
      const amountCents = Number(version.amountCents)
      if (!Number.isSafeInteger(amountCents)) throw new HttpError(409, 'O valor da versão excede a precisão monetária suportada.')

      const orderId = randomUUID()
      const acceptedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
      await connection.execute(`INSERT INTO service_orders(id,request_id,customer_id,provider_id,quote_id,quote_version_id,
          quote_title,version_number,amount_cents,description,included_items,excluded_items,estimated_days,conditions,valid_until,status,accepted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'contracted',?)`, [
        orderId, requestId, customerId, quote.providerId, quoteId, versionId, quote.title, version.versionNumber,
        amountCents, version.description, JSON.stringify(decodeArray(version.includedItems)),
        JSON.stringify(decodeArray(version.excludedItems)), version.estimatedDays, version.conditions,
        dateForMysql(version.validUntil), acceptedAt,
      ])
      await connection.execute("UPDATE quotes SET status='accepted',updated_at=? WHERE id=?", [acceptedAt, quoteId])
      await connection.execute("UPDATE quotes SET status='closed',updated_at=? WHERE request_id=? AND id<>? AND status='active'", [acceptedAt, requestId, quoteId])
      await connection.execute("UPDATE service_requests SET status='contracted',updated_at=? WHERE id=? AND status='open'", [acceptedAt, requestId])
      await connection.execute('INSERT INTO request_history(id,request_id,event,description,created_at) VALUES(?,?,?,?,?)', [randomUUID(), requestId, 'contracted', `Versão ${version.versionNumber} do orçamento ${quote.title} aceita.`, acceptedAt])

      const order = await findOrderByRequest(connection, requestId)
      return { order, created: true }
    })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Esta solicitação já possui uma contratação registrada.')
    throw error
  }
}
