import cors from 'cors'

const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim())
export default cors({
  origin(origin, callback) {
    if (!origin || origins.includes('*') || origins.includes(origin)) return callback(null, true)
    return callback(new Error('Origem não autorizada pelo CORS.'))
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
