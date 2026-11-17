import { Router } from 'express'
import authRoutes from './auth.js'
import profileRoutes from './profile.js'
import requestRoutes from './requests.js'
import providerRoutes from './providers.js'
import conversationRoutes from './conversations.js'
import quoteRoutes from './quotes.js'
import serviceOrderRoutes from './serviceOrders.js'

const router = Router()
router.use('/auth', authRoutes)
router.use('/profile', profileRoutes)
router.use('/requests', requestRoutes)
router.use('/providers', providerRoutes)
router.use('/conversations', conversationRoutes)
router.use('/', quoteRoutes)
router.use('/service-orders', serviceOrderRoutes)
export default router
