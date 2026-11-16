import jwt from 'jsonwebtoken'
import db from '../config/database.js'
import { HttpError } from './errorHandler.js'

const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) throw new Error('Defina JWT_SECRET com pelo menos 32 caracteres no arquivo .env.')

export async function authenticate(req, _res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return next(new HttpError(401, 'Autenticação necessária.'))
  try {
    const payload = jwt.verify(token, secret)
    const [users] = await db.execute('SELECT id, name, email, role, city, region, bio, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?', [payload.sub])
    const user = users[0]
    if (!user) throw new HttpError(401, 'Sessão inválida. Entre novamente.')
    req.user = user
    return next()
  } catch (error) {
    if (error instanceof HttpError) return next(error)
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError') {
      return next(new HttpError(401, 'Sessão inválida ou expirada.'))
    }
    return next(error)
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => roles.includes(req.user.role)
    ? next()
    : next(new HttpError(403, 'Você não tem permissão para esta ação.'))
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '7d', issuer: 'fechou-api', audience: 'fechou-client' })
}
