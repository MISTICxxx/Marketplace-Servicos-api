import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import jwt from 'jsonwebtoken'

function readSafeTestTarget() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Integração bloqueada: NODE_ENV=production não é permitido.')
  }

  const missing = [
    'TEST_MYSQL_HOST',
    'TEST_MYSQL_PORT',
    'TEST_MYSQL_USER',
    'TEST_MYSQL_PASSWORD',
    'TEST_MYSQL_DATABASE',
  ].filter((key) => !process.env[key])

  if (missing.length) {
    throw new Error(`Integração bloqueada antes de importar a API: configure explicitamente ${missing.join(', ')}.`)
  }
  const target = {
    host: process.env.TEST_MYSQL_HOST,
    port: Number(process.env.TEST_MYSQL_PORT),
    user: process.env.TEST_MYSQL_USER,
    password: process.env.TEST_MYSQL_PASSWORD,
    database: process.env.TEST_MYSQL_DATABASE,
  }
  if (target.host !== '127.0.0.1') {
    throw new Error('Integração bloqueada: TEST_MYSQL_HOST precisa ser exatamente 127.0.0.1.')
  }
  if (!Number.isInteger(target.port) || target.port < 20000 || target.port > 59999 || target.port === 3306) {
    throw new Error('Integração bloqueada: TEST_MYSQL_PORT precisa ser uma porta de teste explícita entre 20000 e 59999.')
  }
  if (target.user !== 'fechou_test' || target.database !== 'fechou_test') {
    throw new Error('Integração bloqueada: use somente o usuário e o banco exclusivos fechou_test.')
  }
  if (!/^fechou-tmp-[a-f0-9]{32}$/.test(target.password)) {
    throw new Error('Integração bloqueada: TEST_MYSQL_PASSWORD deve ser uma credencial aleatória de teste fechou-tmp-<32 hex>.')
  }

  return target
}

// Esta validação ocorre antes de importar database.js, app.js ou qualquer router.
const safeTarget = readSafeTestTarget()
const syntheticJwtSecret = 'fechou-integration-test-only-secret-not-for-production-2026'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = syntheticJwtSecret
process.env.JWT_EXPIRES_IN = '1h'
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.MYSQL_HOST = safeTarget.host
process.env.MYSQL_PORT = String(safeTarget.port)
process.env.MYSQL_USER = safeTarget.user
process.env.MYSQL_PASSWORD = safeTarget.password
process.env.MYSQL_DATABASE = safeTarget.database
process.env.MYSQL_CONNECTION_LIMIT = '5'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { default: db, initializeDatabase } = await import('../../src/config/database.js')
const { default: app } = await import('../../src/app.js')

let server
let baseUrl
let childServer
let poolClosed = false
const runId = randomUUID().replaceAll('-', '')
const testPassword = `Test-only-${randomUUID()}`
const fixtures = {}

function closeHttpServer(target) {
  if (!target?.listening) return Promise.resolve()
  return new Promise((resolve, reject) => target.close((error) => error ? reject(error) : resolve()))
}

async function openFreeLoopbackPort() {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return port
}

async function call(method, pathname, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const options = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const response = await fetch(`${baseUrl}/api${pathname}`, options)
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  }
}

function assertPublicUser(user) {
  assert.equal(typeof user?.id, 'string')
  assert.equal(typeof user?.email, 'string')
  assert.equal('password_hash' in user, false)
  assert.equal('passwordHash' in user, false)
  assert.equal('password' in user, false)
}

async function registerAccount(name, role, label) {
  const email = `${runId}.${label}@fechou.invalid`
  const result = await call('POST', '/auth/register', {
    body: { name, email, password: testPassword, role },
  })
  assert.equal(result.status, 201, 'cadastro de conta fictícia')
  assertPublicUser(result.body.user)
  assert.equal(typeof result.body.token, 'string')
  return { ...result.body.user, token: result.body.token, email }
}

function requestPayload(title) {
  return {
    title,
    categoryId: 'eletrica',
    description: 'Preciso revisar a instalação elétrica da cozinha.',
    city: 'Campinas',
    region: 'SP',
    neighborhood: 'Centro',
    availability: 'Após 18h',
    budgetMin: 80,
    budgetMax: 300,
    prefersProposals: false,
  }
}

async function waitForRestartedApi(child, url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error('A API reiniciada encerrou antes do health check.')
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(700) })
      if (response.status === 200) return
    } catch {
      // Aguarda a inicialização normal do servidor, sem imprimir detalhes de conexão.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('A API reiniciada não ficou pronta dentro do prazo.')
}

async function stopRestartedApi() {
  if (!childServer || childServer.exitCode !== null) return
  const exited = once(childServer, 'exit')
  childServer.kill('SIGTERM')
  const completed = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 7000)),
  ])
  if (!completed && childServer.exitCode === null) {
    const forcedExit = once(childServer, 'exit')
    childServer.kill('SIGKILL')
    await forcedExit
  }
}

before(async () => {
  const [rows] = await db.query('SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser, @@port AS serverPort, @@version AS serverVersion')
  assert.equal(rows[0].databaseName, 'fechou_test', 'schema de teste validado antes do DDL')
  assert.match(String(rows[0].currentUser), /^fechou_test@/, 'usuário de teste validado antes do DDL')
  assert.equal(Number(rows[0].serverPort), 3306, 'porta interna MySQL validada antes do DDL')
  assert.equal(String(rows[0].serverVersion), '8.4.13', 'versão MySQL fixada validada antes do DDL')

  await initializeDatabase()
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await stopRestartedApi()
  await closeHttpServer(server)
  if (!poolClosed) await db.end()
})

test('autenticação, perfil, solicitações e conversas persistem sob regras de acesso', { concurrency: false }, async (t) => {
  await t.test('cadastro, login, sessão, perfil e campos privados', async () => {
    fixtures.customerA = await registerAccount('Cliente Teste A', 'customer', 'customer-a')
    fixtures.customerB = await registerAccount('Cliente Teste B', 'customer', 'customer-b')
    fixtures.providerA = await registerAccount('Prestador Teste A', 'provider', 'provider-a')
    fixtures.providerB = await registerAccount('Prestador Teste B', 'provider', 'provider-b')

    const duplicate = await call('POST', '/auth/register', {
      body: { name: 'Duplicada', email: fixtures.customerA.email.toUpperCase(), password: testPassword, role: 'customer' },
    })
    assert.equal(duplicate.status, 409)

    const login = await call('POST', '/auth/login', {
      body: { email: fixtures.customerA.email, password: testPassword },
    })
    assert.equal(login.status, 200)
    assertPublicUser(login.body.user)
    assert.equal(login.body.user.id, fixtures.customerA.id)

    const badLogin = await call('POST', '/auth/login', {
      body: { email: fixtures.customerA.email, password: 'incorrect-password' },
    })
    assert.equal(badLogin.status, 401)

    const me = await call('GET', '/auth/me', { token: fixtures.customerA.token })
    assert.equal(me.status, 200)
    assertPublicUser(me.body.user)

    const updatedProfile = await call('PATCH', '/profile', {
      token: fixtures.customerA.token,
      body: { name: 'Cliente Teste A', city: 'Campinas', region: 'SP', bio: 'Perfil de teste fictício.' },
    })
    assert.equal(updatedProfile.status, 200)
    assert.equal(updatedProfile.body.user.city, 'Campinas')

    const missing = await call('GET', '/auth/me')
    assert.equal(missing.status, 401)
    assert.deepEqual(Object.keys(missing.body), ['error'])

    const invalid = await call('GET', '/auth/me', { token: 'not.a.valid.token' })
    assert.equal(invalid.status, 401)
    assert.deepEqual(Object.keys(invalid.body), ['error'])

    const expiredToken = jwt.sign({ sub: fixtures.customerA.id }, syntheticJwtSecret, {
      expiresIn: -1,
      issuer: 'fechou-api',
      audience: 'fechou-client',
    })
    const expired = await call('GET', '/auth/me', { token: expiredToken })
    assert.equal(expired.status, 401)
    assert.deepEqual(Object.keys(expired.body), ['error'])
  })

  await t.test('perfil de prestador, publicação, diretório e filtros', async () => {
    const ownWithoutToken = await call('GET', '/providers/me')
    assert.equal(ownWithoutToken.status, 401)
    assert.deepEqual(Object.keys(ownWithoutToken.body), ['error'])

    const ownAsCustomer = await call('GET', '/providers/me', { token: fixtures.customerA.token })
    assert.equal(ownAsCustomer.status, 403)
    assert.deepEqual(Object.keys(ownAsCustomer.body), ['error'])

    await db.execute('DELETE FROM provider_profiles WHERE user_id = ?', [fixtures.providerB.id])
    const missingOwnProfile = await call('GET', '/providers/me', { token: fixtures.providerB.token })
    assert.equal(missingOwnProfile.status, 404)
    assert.deepEqual(Object.keys(missingOwnProfile.body), ['error'])

    const profile = {
      specialty: 'Eletricista residencial',
      summary: 'Instalações e revisões elétricas.',
      categories: ['eletrica'],
      neighborhoods: ['Centro', 'Cambuí'],
      services: [{ name: 'Instalação de tomadas', priceFrom: 90 }],
      active: true,
    }
    const savedA = await call('PUT', '/providers/me', { token: fixtures.providerA.token, body: profile })
    assert.equal(savedA.status, 200)
    assert.equal(savedA.body.provider.id, fixtures.providerA.id)

    const savedB = await call('PUT', '/providers/me', { token: fixtures.providerB.token, body: profile })
    assert.equal(savedB.status, 200)
    assert.equal(savedB.body.provider.id, fixtures.providerB.id)

    const own = await call('GET', '/providers/me', { token: fixtures.providerA.token })
    assert.equal(own.status, 200)
    assert.equal(own.body.provider.specialty, profile.specialty)
    assert.equal(own.body.provider.active, true)
    for (const field of ['email', 'password', 'password_hash', 'passwordHash']) {
      assert.equal(field in own.body.provider, false)
    }

    const ownB = await call('GET', `/providers/me?id=${encodeURIComponent(fixtures.providerA.id)}`, { token: fixtures.providerB.token })
    assert.equal(ownB.status, 200)
    assert.equal(ownB.body.provider.id, fixtures.providerB.id)
    assert.equal(ownB.body.provider.active, true)

    const forbiddenUpdate = await call('PUT', '/providers/me', { token: fixtures.customerA.token, body: profile })
    assert.equal(forbiddenUpdate.status, 403)
    assert.deepEqual(Object.keys(forbiddenUpdate.body), ['error'])

    const publicList = await call('GET', '/providers?q=residencial&category=eletrica&neighborhood=Centro')
    assert.equal(publicList.status, 200)
    assert.ok(publicList.body.data.some((provider) => provider.id === fixtures.providerA.id))
    assert.ok(publicList.body.data.some((provider) => provider.id === fixtures.providerB.id))
    assert.equal(publicList.body.data.some((provider) => 'password_hash' in provider), false)
    assert.equal(publicList.body.data.some((provider) => 'active' in provider), false)

    const publicDetail = await call('GET', `/providers/${encodeURIComponent(fixtures.providerA.id)}`)
    assert.equal(publicDetail.status, 200)
    assert.equal(publicDetail.body.provider.id, fixtures.providerA.id)
    assert.equal('password_hash' in publicDetail.body.provider, false)
    assert.equal('active' in publicDetail.body.provider, false)

    const inactive = await call('PUT', '/providers/me', {
      token: fixtures.providerA.token,
      body: { ...profile, summary: 'Anúncio temporariamente inativo.', active: false },
    })
    assert.equal(inactive.status, 200)
    assert.equal(inactive.body.provider.active, false)
    assert.equal(inactive.body.provider.summary, 'Anúncio temporariamente inativo.')

    const ownInactive = await call('GET', '/providers/me', { token: fixtures.providerA.token })
    assert.equal(ownInactive.status, 200)
    assert.equal(ownInactive.body.provider.active, false)
    assert.equal(ownInactive.body.provider.summary, 'Anúncio temporariamente inativo.')

    const listWhileInactive = await call('GET', '/providers')
    assert.equal(listWhileInactive.body.data.some((provider) => provider.id === fixtures.providerA.id), false)
    assert.equal(listWhileInactive.body.data.some((provider) => provider.id === fixtures.providerB.id), true)
    const detailWhileInactive = await call('GET', `/providers/${encodeURIComponent(fixtures.providerA.id)}`)
    assert.equal(detailWhileInactive.status, 404)

    const updatedWhileInactive = await call('PUT', '/providers/me', {
      token: fixtures.providerA.token,
      body: { ...profile, summary: 'Dados editados enquanto inativo.', active: false },
    })
    assert.equal(updatedWhileInactive.status, 200)
    assert.equal(updatedWhileInactive.body.provider.active, false)
    assert.equal(updatedWhileInactive.body.provider.summary, 'Dados editados enquanto inativo.')

    const reactivated = await call('PUT', '/providers/me', {
      token: fixtures.providerA.token,
      body: { ...profile, summary: 'Perfil reativado pelo contrato existente.', active: true },
    })
    assert.equal(reactivated.status, 200)
    assert.equal(reactivated.body.provider.active, true)
    const detailAfterReactivation = await call('GET', `/providers/${encodeURIComponent(fixtures.providerA.id)}`)
    assert.equal(detailAfterReactivation.status, 200)
    assert.equal(detailAfterReactivation.body.provider.summary, 'Perfil reativado pelo contrato existente.')

    const forgedTarget = await call('PUT', '/providers/me', {
      token: fixtures.providerB.token,
      body: { ...profile, id: fixtures.providerA.id },
    })
    assert.equal(forgedTarget.status, 200)
    assert.equal(forgedTarget.body.provider.id, fixtures.providerB.id)
  })

  await t.test('propriedade de solicitações e autorização de /requests/open', async () => {
    const createdA = await call('POST', '/requests', {
      token: fixtures.customerA.token,
      body: requestPayload(`Pedido A ${runId}`),
    })
    assert.equal(createdA.status, 201)
    fixtures.requestA = createdA.body.request
    assert.equal(fixtures.requestA.ownerId, fixtures.customerA.id)
    assert.equal(fixtures.requestA.status, 'open')

    const cancelledCandidate = await call('POST', '/requests', {
      token: fixtures.customerA.token,
      body: requestPayload(`Pedido cancelado ${runId}`),
    })
    assert.equal(cancelledCandidate.status, 201)
    fixtures.cancelledRequest = cancelledCandidate.body.request

    const createdB = await call('POST', '/requests', {
      token: fixtures.customerB.token,
      body: requestPayload(`Pedido B ${runId}`),
    })
    assert.equal(createdB.status, 201)
    fixtures.requestB = createdB.body.request
    assert.equal(fixtures.requestB.ownerId, fixtures.customerB.id)

    const invalidCreate = await call('POST', '/requests', {
      token: fixtures.customerA.token,
      body: { ...requestPayload('x'), categoryId: 'not-a-category' },
    })
    assert.equal(invalidCreate.status, 400)

    const ownList = await call('GET', '/requests', { token: fixtures.customerA.token })
    assert.equal(ownList.status, 200)
    assert.ok(ownList.body.data.some((request) => request.id === fixtures.requestA.id))
    assert.ok(ownList.body.data.every((request) => request.ownerId === fixtures.customerA.id))

    const ownerDetail = await call('GET', `/requests/${fixtures.requestA.id}`, { token: fixtures.customerA.token })
    assert.equal(ownerDetail.status, 200)
    assert.equal(ownerDetail.body.request.ownerId, fixtures.customerA.id)

    const foreignDetail = await call('GET', `/requests/${fixtures.requestA.id}`, { token: fixtures.customerB.token })
    assert.equal(foreignDetail.status, 404)
    assert.deepEqual(Object.keys(foreignDetail.body), ['error'])

    const foreignEdit = await call('PATCH', `/requests/${fixtures.requestA.id}`, {
      token: fixtures.customerB.token,
      body: requestPayload(`Tentativa externa ${runId}`),
    })
    assert.equal(foreignEdit.status, 404)

    const foreignCancel = await call('POST', `/requests/${fixtures.requestA.id}/cancel`, { token: fixtures.customerB.token })
    assert.equal(foreignCancel.status, 404)

    const providerDetail = await call('GET', `/requests/${fixtures.requestA.id}`, { token: fixtures.providerA.token })
    assert.equal(providerDetail.status, 200)

    const providerEdit = await call('PATCH', `/requests/${fixtures.requestA.id}`, {
      token: fixtures.providerA.token,
      body: requestPayload(`Edição prestador ${runId}`),
    })
    assert.equal(providerEdit.status, 404)

    const updated = await call('PATCH', `/requests/${fixtures.requestA.id}`, {
      token: fixtures.customerA.token,
      body: requestPayload(`Pedido A atualizado ${runId}`),
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.body.request.title, `Pedido A atualizado ${runId}`)
    assert.ok(updated.body.request.history.some((entry) => entry.event === 'edited'))

    const cancelled = await call('POST', `/requests/${fixtures.cancelledRequest.id}/cancel`, { token: fixtures.customerA.token })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.request.status, 'cancelled')
    assert.ok(cancelled.body.request.history.some((entry) => entry.event === 'cancelled'))

    const editCancelled = await call('PATCH', `/requests/${fixtures.cancelledRequest.id}`, {
      token: fixtures.customerA.token,
      body: requestPayload(`Pedido cancelado editado ${runId}`),
    })
    assert.equal(editCancelled.status, 409)

    const openWithoutToken = await call('GET', '/requests/open')
    assert.equal(openWithoutToken.status, 401)
    assert.deepEqual(Object.keys(openWithoutToken.body), ['error'])

    const openInvalidToken = await call('GET', '/requests/open', { token: 'invalid.token.value' })
    assert.equal(openInvalidToken.status, 401)
    assert.deepEqual(Object.keys(openInvalidToken.body), ['error'])

    for (const customer of [fixtures.customerA, fixtures.customerB]) {
      const denied = await call('GET', '/requests/open?role=provider', { token: customer.token })
      assert.equal(denied.status, 403)
      assert.deepEqual(Object.keys(denied.body), ['error'])
    }

    const providerOpen = await call('GET', '/requests/open', { token: fixtures.providerA.token })
    assert.equal(providerOpen.status, 200)
    const openIds = providerOpen.body.data.map((request) => request.id)
    assert.ok(openIds.includes(fixtures.requestA.id))
    assert.ok(openIds.includes(fixtures.requestB.id))
    assert.equal(openIds.includes(fixtures.cancelledRequest.id), false)
    assert.equal(providerOpen.body.data.every((request) => request.status === 'open'), true)
  })

  await t.test('conversas, mensagens, leitura e autorização de participantes', async () => {
    const foreignRequest = await call('POST', '/conversations', {
      token: fixtures.customerB.token,
      body: { requestId: fixtures.requestA.id, providerId: fixtures.providerA.id },
    })
    assert.equal(foreignRequest.status, 404)

    const first = await call('POST', '/conversations', {
      token: fixtures.customerA.token,
      body: { requestId: fixtures.requestA.id, providerId: fixtures.providerA.id },
    })
    assert.equal(first.status, 201)
    assert.equal(first.body.created, true)
    fixtures.conversationA = first.body.conversation

    const reused = await call('POST', '/conversations', {
      token: fixtures.customerA.token,
      body: { requestId: fixtures.requestA.id, providerId: fixtures.providerA.id },
    })
    assert.equal(reused.status, 200)
    assert.equal(reused.body.created, false)
    assert.equal(reused.body.conversation.id, fixtures.conversationA.id)

    const differentProvider = await call('POST', '/conversations', {
      token: fixtures.customerA.token,
      body: { requestId: fixtures.requestA.id, providerId: fixtures.providerB.id },
    })
    assert.equal(differentProvider.status, 201)
    assert.notEqual(differentProvider.body.conversation.id, fixtures.conversationA.id)
    fixtures.conversationB = differentProvider.body.conversation

    const cancelledConversation = await call('POST', '/conversations', {
      token: fixtures.customerA.token,
      body: { requestId: fixtures.cancelledRequest.id, providerId: fixtures.providerA.id },
    })
    assert.equal(cancelledConversation.status, 409)

    const clientMessage = await call('POST', `/conversations/${fixtures.conversationA.id}/messages`, {
      token: fixtures.customerA.token,
      body: { text: 'Mensagem fictícia do cliente.' },
    })
    assert.equal(clientMessage.status, 201)
    await new Promise((resolve) => setTimeout(resolve, 20))

    const providerView = await call('GET', `/conversations/${fixtures.conversationA.id}`, { token: fixtures.providerA.token })
    assert.equal(providerView.status, 200)
    assert.equal(providerView.body.conversation.messages[0].senderType, 'customer')

    const providerMessage = await call('POST', `/conversations/${fixtures.conversationA.id}/messages`, {
      token: fixtures.providerA.token,
      body: { text: 'Resposta fictícia do prestador.' },
    })
    assert.equal(providerMessage.status, 201)
    const messages = providerMessage.body.conversation.messages
    assert.equal(messages.length, 2)
    assert.equal(messages[0].senderType, 'customer')
    assert.equal(messages[1].senderType, 'provider')
    assert.ok(messages[0].sentAt <= messages[1].sentAt)

    const thirdPartyDetail = await call('GET', `/conversations/${fixtures.conversationA.id}`, { token: fixtures.customerB.token })
    assert.equal(thirdPartyDetail.status, 404)
    assert.deepEqual(Object.keys(thirdPartyDetail.body), ['error'])

    const thirdPartyMessage = await call('POST', `/conversations/${fixtures.conversationA.id}/messages`, {
      token: fixtures.customerB.token,
      body: { text: 'Mensagem proibida de terceiro.' },
    })
    assert.equal(thirdPartyMessage.status, 404)
    assert.deepEqual(Object.keys(thirdPartyMessage.body), ['error'])

    const customerInbox = await call('GET', '/conversations', { token: fixtures.customerA.token })
    const providerInbox = await call('GET', '/conversations', { token: fixtures.providerA.token })
    assert.equal(customerInbox.status, 200)
    assert.equal(providerInbox.status, 200)
    assert.equal(customerInbox.body.data.length, 2)
    assert.equal(providerInbox.body.data.length, 1)

    const markedRead = await call('POST', `/conversations/${fixtures.conversationA.id}/read`, { token: fixtures.customerA.token })
    assert.equal(markedRead.status, 200)
    assert.ok(markedRead.body.conversation.messages[1].readAt)
  })

  await t.test('a persistência sobrevive ao encerramento e à inicialização normal da API', async () => {
    await closeHttpServer(server)
    server = undefined
    await db.end()
    poolClosed = true

    const port = await openFreeLoopbackPort()
    const dotenvSentinel = path.join(apiRoot, '.env.etapa03-nao-carregar')
    assert.equal(existsSync(dotenvSentinel), false)
    const childEnv = {
      ...process.env,
      DOTENV_CONFIG_PATH: dotenvSentinel,
      HOST: '127.0.0.1',
      PORT: String(port),
    }
    delete childEnv.FECHOU_TEST_DB_ROOT_PASSWORD
    delete childEnv.TEST_MYSQL_PASSWORD
    childServer = spawn(process.execPath, ['server.js'], {
      cwd: apiRoot,
      env: childEnv,
      stdio: 'ignore',
    })
    const restartedUrl = `http://127.0.0.1:${port}`
    await waitForRestartedApi(childServer, restartedUrl)
    baseUrl = restartedUrl

    const savedRequests = await call('GET', '/requests', { token: fixtures.customerA.token })
    assert.equal(savedRequests.status, 200)
    assert.ok(savedRequests.body.data.some((request) => request.id === fixtures.requestA.id))
    assert.ok(savedRequests.body.data.some((request) => request.id === fixtures.cancelledRequest.id && request.status === 'cancelled'))

    const savedConversation = await call('GET', `/conversations/${fixtures.conversationA.id}`, { token: fixtures.customerA.token })
    assert.equal(savedConversation.status, 200)
    assert.equal(savedConversation.body.conversation.messages.length, 2)
    assert.equal(savedConversation.body.conversation.messages[0].text, 'Mensagem fictícia do cliente.')
    assert.equal(savedConversation.body.conversation.messages[1].text, 'Resposta fictícia do prestador.')
  })
})
