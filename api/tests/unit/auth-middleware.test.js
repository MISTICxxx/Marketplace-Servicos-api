import assert from 'node:assert/strict'
import { after, test } from 'node:test'

process.env.JWT_SECRET = 'fechou-unit-test-only-secret-not-for-production-2026'
process.env.MYSQL_HOST = '127.0.0.1'
process.env.MYSQL_PORT = '1'
process.env.MYSQL_USER = 'fechou_no_db_unit'
process.env.MYSQL_PASSWORD = ''
process.env.MYSQL_DATABASE = 'fechou_no_db_unit'

const { requireRole } = await import('../../src/middlewares/auth.js')
const { default: db } = await import('../../src/config/database.js')

after(async () => db.end())

test('requireRole rejeita customer para recurso exclusivo de provider', () => {
  let receivedError
  requireRole('provider')({ user: { role: 'customer' } }, null, (error) => { receivedError = error })
  assert.equal(receivedError?.status, 403)
  assert.equal(typeof receivedError?.message, 'string')
})

test('requireRole permite provider sem alterar a identidade validada', () => {
  let nextCalled = false
  let receivedError
  const user = { id: 'provider-test-id', role: 'provider' }
  requireRole('provider')({ user }, null, (error) => {
    nextCalled = true
    receivedError = error
  })
  assert.equal(nextCalled, true)
  assert.equal(receivedError, undefined)
})
