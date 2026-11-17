import 'dotenv/config'

function assertDevelopmentTarget() {
  if (process.env.NODE_ENV === 'production'
    || process.env.MYSQL_HOST !== '127.0.0.1'
    || Number(process.env.MYSQL_PORT) !== 33317
    || process.env.MYSQL_USER !== 'fechou_app'
    || process.env.MYSQL_DATABASE !== 'fechou_dev') {
    throw new Error('Consulta de status bloqueada: alvo não corresponde ao banco de desenvolvimento fechado.')
  }
}

assertDevelopmentTarget()
const { default: db } = await import('../src/config/database.js')

try {
  const [identityRows] = await db.query('SELECT DATABASE() AS databaseName, CURRENT_USER() AS username, VERSION() AS serverVersion')
  const identity = identityRows[0]
  if (identity.databaseName !== 'fechou_dev' || !identity.username.startsWith('fechou_app@') || !identity.serverVersion.startsWith('8.4.')) {
    throw new Error('Identidade efetiva do MySQL não corresponde ao ambiente de desenvolvimento esperado.')
  }
  const [[migrations]] = await db.query('SELECT COUNT(*) AS count FROM schema_migrations')
  const [[accounts]] = await db.query("SELECT COUNT(*) AS count FROM users WHERE email LIKE '%@fechou.test'")
  const [[providers]] = await db.query("SELECT COUNT(*) AS count FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.active=1 AND u.email LIKE '%@fechou.test'")
  const [[requests]] = await db.query("SELECT COUNT(*) AS count FROM service_requests WHERE id LIKE '00000000-0000-4000-8000-0000000002%'")
  const [[quotes]] = await db.query("SELECT COUNT(*) AS count FROM quotes WHERE id LIKE '00000000-0000-4000-8000-00000000050%'")
  const [[versions]] = await db.query("SELECT COUNT(*) AS count FROM quote_versions WHERE quote_id LIKE '00000000-0000-4000-8000-00000000050%'")
  const [[orders]] = await db.query("SELECT COUNT(*) AS count FROM service_orders WHERE id='00000000-0000-4000-8000-000000000601'")
  console.log(`MySQL ${identity.serverVersion}; schema ${identity.databaseName}; migrations ${migrations.count}; contas fictícias ${accounts.count}; prestadores ativos ${providers.count}; solicitações demo ${requests.count}; orçamentos demo ${quotes.count}; versões ${versions.count}; ordens demo ${orders.count}.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await db.end()
}
