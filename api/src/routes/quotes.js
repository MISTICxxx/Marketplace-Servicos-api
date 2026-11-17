import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { asyncRoute, HttpError } from '../middlewares/errorHandler.js'
import {
  acceptQuoteVersion,
  createQuote,
  getQuote,
  listQuoteVersions,
  listQuotesForConversation,
  listQuotesForRequest,
  reviseQuote,
  withdrawQuote,
} from '../services/quoteService.js'

const router = Router()

const quoteVersionSchema = z.object({
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  description: z.string().trim().min(10).max(5000),
  includedItems: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  excludedItems: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  estimatedDays: z.number().int().positive().max(3650).nullable().default(null),
  conditions: z.string().trim().min(1).max(5000),
  validUntil: z.string().datetime({ offset: true }).nullable().default(null),
}).refine((data) => !data.validUntil || Date.parse(data.validUntil) > Date.now(), {
  message: 'A validade precisa estar no futuro.',
  path: ['validUntil'],
})

function parseVersion(data) {
  const parsed = quoteVersionSchema.parse(data)
  if (parsed.validUntil && Date.parse(parsed.validUntil) <= Date.now()) {
    throw new HttpError(400, 'A validade precisa estar no futuro.')
  }
  return parsed
}

router.get('/requests/:requestId/quotes', authenticate, asyncRoute(async (req, res) => {
  const requestId = z.string().uuid().parse(req.params.requestId)
  res.json({ data: await listQuotesForRequest(requestId, req.user) })
}))

router.get('/conversations/:conversationId/quotes', authenticate, asyncRoute(async (req, res) => {
  const conversationId = z.string().uuid().parse(req.params.conversationId)
  res.json({ data: await listQuotesForConversation(conversationId, req.user.id) })
}))

router.post('/conversations/:conversationId/quotes', authenticate, requireRole('provider'), asyncRoute(async (req, res) => {
  const conversationId = z.string().uuid().parse(req.params.conversationId)
  const { title, ...data } = z.object({ title: z.string().trim().min(3).max(120) }).extend({
    amountCents: quoteVersionSchema.shape.amountCents,
    description: quoteVersionSchema.shape.description,
    includedItems: quoteVersionSchema.shape.includedItems,
    excludedItems: quoteVersionSchema.shape.excludedItems,
    estimatedDays: quoteVersionSchema.shape.estimatedDays,
    conditions: quoteVersionSchema.shape.conditions,
    validUntil: quoteVersionSchema.shape.validUntil,
  }).parse(req.body)
  const version = parseVersion(data)
  const quote = await createQuote(conversationId, req.user.id, { title, ...version })
  res.status(201).json({ quote })
}))

router.get('/quotes/:quoteId', authenticate, asyncRoute(async (req, res) => {
  const quoteId = z.string().uuid().parse(req.params.quoteId)
  res.json({ quote: await getQuote(quoteId, req.user.id) })
}))

router.get('/quotes/:quoteId/versions', authenticate, asyncRoute(async (req, res) => {
  const quoteId = z.string().uuid().parse(req.params.quoteId)
  res.json({ data: await listQuoteVersions(quoteId, req.user.id) })
}))

router.post('/quotes/:quoteId/versions', authenticate, requireRole('provider'), asyncRoute(async (req, res) => {
  const quoteId = z.string().uuid().parse(req.params.quoteId)
  const data = parseVersion(req.body)
  const quote = await reviseQuote(quoteId, req.user.id, data)
  res.status(201).json({ quote })
}))

router.post('/quotes/:quoteId/withdraw', authenticate, requireRole('provider'), asyncRoute(async (req, res) => {
  const quoteId = z.string().uuid().parse(req.params.quoteId)
  res.json({ quote: await withdrawQuote(quoteId, req.user.id) })
}))

router.post('/quotes/:quoteId/accept', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
  const quoteId = z.string().uuid().parse(req.params.quoteId)
  const { versionId } = z.object({ versionId: z.string().uuid() }).parse(req.body)
  const result = await acceptQuoteVersion(quoteId, req.user.id, versionId)
  res.status(result.created ? 201 : 200).json(result)
}))

export default router
