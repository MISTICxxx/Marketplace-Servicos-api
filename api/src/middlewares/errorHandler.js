export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

export default function errorHandler(error, _req, res, _next) {
  if (error?.name === 'ZodError') {
    return res.status(400).json({ error: 'Dados inválidos.', details: error.issues.map(({ path, message }) => ({ field: path.join('.'), message })) })
  }
  if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Já existe um cadastro com esses dados.' })
  const status = Number(error.status) || 500
  if (status >= 500) console.error(error)
  return res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor.' : error.message, ...(error.details ? { details: error.details } : {}) })
}
