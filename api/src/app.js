import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import corsMiddleware from './middlewares/cors.js'
import apiRoutes from './routes/index.js'
import errorHandler from './middlewares/errorHandler.js'

const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use(corsMiddleware)
app.use(express.json({ limit: '1mb' }))
const health = (_req, res) => res.json({ status: 'ok', service: 'fechou-api' })
app.get(['/health', '/api/health'], health)
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use('/api', apiRoutes)
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }))
app.use(errorHandler)

export default app
