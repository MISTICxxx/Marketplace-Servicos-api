import db from '../config/database.js'
import { HttpError } from '../middlewares/errorHandler.js'

const orderColumns = `o.id,o.request_id AS requestId,o.customer_id AS customerId,o.provider_id AS providerId,
  o.quote_id AS quoteId,o.quote_version_id AS quoteVersionId,o.quote_title AS quoteTitle,
  o.version_number AS versionNumber,o.amount_cents AS amountCents,o.description,
  o.included_items AS includedItems,o.excluded_items AS excludedItems,o.estimated_days AS estimatedDays,
  o.conditions,o.valid_until AS validUntil,o.status,o.accepted_at AS acceptedAt,
  r.title AS requestTitle,c.name AS customerName,p.name AS providerName`

function decodeJson(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return JSON.parse(value)
  return []
}

function decodeOrder(row) {
  if (!row) return null
  const amountCents = Number(row.amountCents)
  if (!Number.isSafeInteger(amountCents)) throw new Error('O valor da ordem excede a precisão monetária suportada.')
  return {
    id: row.id,
    requestId: row.requestId,
    requestTitle: row.requestTitle,
    customerId: row.customerId,
    customerName: row.customerName,
    providerId: row.providerId,
    providerName: row.providerName,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    quoteTitle: row.quoteTitle,
    versionNumber: Number(row.versionNumber),
    amountCents,
    description: row.description,
    includedItems: decodeJson(row.includedItems),
    excludedItems: decodeJson(row.excludedItems),
    estimatedDays: row.estimatedDays == null ? null : Number(row.estimatedDays),
    conditions: row.conditions,
    validUntil: row.validUntil,
    status: row.status,
    acceptedAt: row.acceptedAt,
  }
}

export async function findOrderByRequest(executor, requestId, { forUpdate = false } = {}) {
  const [rows] = await executor.execute(`SELECT ${orderColumns}
    FROM service_orders o
    JOIN service_requests r ON r.id=o.request_id
    JOIN users c ON c.id=o.customer_id
    JOIN users p ON p.id=o.provider_id
    WHERE o.request_id=?${forUpdate ? ' FOR UPDATE' : ''}`, [requestId])
  return decodeOrder(rows[0])
}

export async function listServiceOrders(userId, requestId) {
  const filters = ['(o.customer_id=? OR o.provider_id=?)']
  const params = [userId, userId]
  if (requestId) {
    filters.push('o.request_id=?')
    params.push(requestId)
  }
  const [rows] = await db.execute(`SELECT ${orderColumns}
    FROM service_orders o
    JOIN service_requests r ON r.id=o.request_id
    JOIN users c ON c.id=o.customer_id
    JOIN users p ON p.id=o.provider_id
    WHERE ${filters.join(' AND ')} ORDER BY o.accepted_at DESC`, params)
  return rows.map(decodeOrder)
}

export async function getServiceOrder(id, userId) {
  const [rows] = await db.execute(`SELECT ${orderColumns}
    FROM service_orders o
    JOIN service_requests r ON r.id=o.request_id
    JOIN users c ON c.id=o.customer_id
    JOIN users p ON p.id=o.provider_id
    WHERE o.id=? AND (o.customer_id=? OR o.provider_id=?)`, [id, userId, userId])
  if (!rows[0]) throw new HttpError(404, 'Ordem de serviço não encontrada.')
  return decodeOrder(rows[0])
}
