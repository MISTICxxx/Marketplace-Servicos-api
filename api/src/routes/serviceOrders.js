import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middlewares/auth.js'
import { asyncRoute } from '../middlewares/errorHandler.js'
import { getServiceOrder, listServiceOrders } from '../services/serviceOrderService.js'

const router = Router()

router.get('/', authenticate, asyncRoute(async (req, res) => {
  const requestId = req.query.requestId === undefined ? undefined : z.string().uuid().parse(req.query.requestId)
  res.json({ data: await listServiceOrders(req.user.id, requestId) })
}))

router.get('/:orderId', authenticate, asyncRoute(async (req, res) => {
  const orderId = z.string().uuid().parse(req.params.orderId)
  res.json({ order: await getServiceOrder(orderId, req.user.id) })
}))

export default router
