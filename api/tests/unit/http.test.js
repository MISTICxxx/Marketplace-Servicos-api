import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import jwt from 'jsonwebtoken'

const syntheticSecret = 'fechou-unit-test-only-secret-not-for-production-2026'
process.env.JWT_SECRET = syntheticSecret
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.MYSQL_HOST = '127.0.0.1'
process.env.MYSQL_PORT = '1'
process.env.MYSQL_USER = 'fechou_no_db_unit'
process.env.MYSQL_PASSWORD = ''
process.env.MYSQL_DATABASE = 'fechou_no_db_unit'

const { default: app } = await import('../../src/app.js')
const { default: db } = await import('../../src/config/database.js')

let server
let baseUrl

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  await db.end()
})

test('health retorna 200 e o JSON esperado', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', service: 'fechou-api' })
})

test('rota inexistente retorna 404 em JSON', async () => {
  const response = await fetch(`${baseUrl}/api/__unit_route_missing`)
  assert.equal(response.status, 404)
  assert.equal(typeof (await response.json()).error, 'string')
})

test('JSON malformado retorna 400', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(response.status, 400)
  assert.equal(typeof (await response.json()).error, 'string')
})

test('cadastro inválido retorna 400 antes da persistência', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', email: 'invalid-email', password: 'short', role: 'admin' }),
  })
  assert.equal(response.status, 400)
  assert.equal(typeof (await response.json()).error, 'string')
})

test('CORS permite preflight para a origem configurada', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('rota privada retorna 401 sem token, com token inválido ou expirado', async () => {
  const missing = await fetch(`${baseUrl}/api/requests/open`)
  assert.equal(missing.status, 401)
  assert.deepEqual(Object.keys(await missing.json()), ['error'])

  const invalid = await fetch(`${baseUrl}/api/requests/open`, {
    headers: { Authorization: 'Bearer not.a.valid.token' },
  })
  assert.equal(invalid.status, 401)
  assert.deepEqual(Object.keys(await invalid.json()), ['error'])

  const expiredToken = jwt.sign({ sub: '00000000-0000-4000-8000-000000000001' }, syntheticSecret, {
    expiresIn: -1,
    issuer: 'fechou-api',
    audience: 'fechou-client',
  })
  const expired = await fetch(`${baseUrl}/api/requests/open`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  })
  assert.equal(expired.status, 401)
  assert.deepEqual(Object.keys(await expired.json()), ['error'])

  const ownProviderProfile = await fetch(`${baseUrl}/api/providers/me`)
  assert.equal(ownProviderProfile.status, 401)
  assert.deepEqual(Object.keys(await ownProviderProfile.json()), ['error'])
})
