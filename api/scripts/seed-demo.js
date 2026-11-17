import 'dotenv/config'
import bcrypt from 'bcryptjs'

function assertDevelopmentTarget() {
  const target = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    database: process.env.MYSQL_DATABASE,
  }
  if (process.env.NODE_ENV === 'production'
    || target.host !== '127.0.0.1'
    || target.port !== 33317
    || target.user !== 'fechou_app'
    || target.database !== 'fechou_dev') {
    throw new Error('Seed bloqueado: alvo deve ser exclusivamente fechou_app@127.0.0.1:33317/fechou_dev em ambiente não produtivo.')
  }
  if (!process.env.FECHOU_DEMO_PASSWORD || process.env.FECHOU_DEMO_PASSWORD.startsWith('replace-with-')) {
    throw new Error('Seed bloqueado: defina uma senha fictícia local em FECHOU_DEMO_PASSWORD no api/.env.')
  }
}

assertDevelopmentTarget()

const { default: db, withTransaction } = await import('../src/config/database.js')

const ids = {
  customers: [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ],
  providers: [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000105',
    '00000000-0000-4000-8000-000000000106',
  ],
  requests: [
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000204',
  ],
  conversations: [
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000304',
  ],
  quotes: [
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000504',
  ],
}

const customers = [
  { id: ids.customers[0], name: 'Cliente Demo Alameda', email: 'cliente.alameda@fechou.test', city: 'Curitiba', region: 'PR', bio: 'Conta fictícia para demonstrar pedidos e comparação de propostas.' },
  { id: ids.customers[1], name: 'Cliente Demo Bosque', email: 'cliente.bosque@fechou.test', city: 'Curitiba', region: 'PR', bio: 'Conta fictícia para demonstrar solicitações e conversas.' },
  { id: ids.customers[2], name: 'Cliente Demo Centro', email: 'cliente.centro@fechou.test', city: 'Curitiba', region: 'PR', bio: 'Conta fictícia para demonstrar histórico de pedidos.' },
]

const providers = [
  { id: ids.providers[0], name: 'Rafa Eletricidade Demo', email: 'prestador.eletrica@fechou.test', bio: 'Instalações e reparos elétricos residenciais.', specialty: 'Eletricista residencial', summary: 'Atendimento organizado para instalações, tomadas e iluminação.', categories: ['eletrica'], neighborhoods: ['Centro', 'Água Verde', 'Batel'], services: [{ name: 'Instalação de tomada', priceFrom: 120 }, { name: 'Revisão elétrica', priceFrom: 250 }] },
  { id: ids.providers[1], name: 'Hidráulica Aurora Demo', email: 'prestador.hidraulica@fechou.test', bio: 'Reparos hidráulicos e instalação de metais.', specialty: 'Reparos hidráulicos', summary: 'Diagnóstico e manutenção de instalações residenciais.', categories: ['hidraulica'], neighborhoods: ['Batel', 'Centro', 'Portão'], services: [{ name: 'Reparo de torneira', priceFrom: 100 }, { name: 'Instalação de chuveiro', priceFrom: 160 }] },
  { id: ids.providers[2], name: 'Montagem Pinheiro Demo', email: 'prestador.montagem@fechou.test', bio: 'Montagem e ajuste de móveis.', specialty: 'Montador de móveis', summary: 'Montagem cuidadosa de móveis residenciais.', categories: ['montagem-moveis', 'reparos'], neighborhoods: ['Portão', 'Água Verde', 'Centro'], services: [{ name: 'Montagem de armário', priceFrom: 220 }, { name: 'Montagem de mesa', priceFrom: 140 }] },
  { id: ids.providers[3], name: 'Brilho do Bairro Demo', email: 'prestador.limpeza@fechou.test', bio: 'Limpeza residencial por ambiente ou diária.', specialty: 'Limpeza residencial', summary: 'Organização de horários e escopo antes do atendimento.', categories: ['limpeza'], neighborhoods: ['Centro', 'Batel', 'Portão'], services: [{ name: 'Limpeza por ambiente', priceFrom: 150 }, { name: 'Limpeza completa', priceFrom: 320 }] },
  { id: ids.providers[4], name: 'Jardim Vivo Demo', email: 'prestador.jardinagem@fechou.test', bio: 'Cuidados com jardins e plantas.', specialty: 'Jardinagem', summary: 'Manutenção e revitalização de áreas verdes.', categories: ['jardinagem'], neighborhoods: ['Água Verde', 'Batel', 'Santa Felicidade'], services: [{ name: 'Manutenção de jardim', priceFrom: 180 }, { name: 'Poda leve', priceFrom: 130 }] },
  { id: ids.providers[5], name: 'Pintura Clara Demo', email: 'prestador.pintura@fechou.test', bio: 'Pintura e preparação de ambientes.', specialty: 'Pintor residencial', summary: 'Pintura interna com escopo e materiais combinados.', categories: ['pintura', 'reparos'], neighborhoods: ['Portão', 'Centro', 'Água Verde'], services: [{ name: 'Pintura de parede', priceFrom: 300 }, { name: 'Preparação de ambiente', priceFrom: 180 }] },
]

const allUsers = [
  ...customers.map((user) => ({ ...user, role: 'customer' })),
  ...providers.map((user) => ({ ...user, city: 'Curitiba', region: 'PR', role: 'provider' })),
]
const now = () => new Date().toISOString()

const requests = [
  { id: ids.requests[0], ownerId: customers[0].id, title: 'Revisar tomadas e iluminação da sala', categoryId: 'eletrica', description: 'Preciso revisar duas tomadas e avaliar a instalação de um ponto de luz na sala. Gostaria de comparar opções de escopo e prazo.', neighborhood: 'Centro', budgetMin: null, budgetMax: null, prefersProposals: true, status: 'open' },
  { id: ids.requests[1], ownerId: customers[0].id, title: 'Instalar luminária no corredor', categoryId: 'eletrica', description: 'Quero instalar uma luminária já comprada no corredor do apartamento. Posso combinar o horário durante a semana.', neighborhood: 'Água Verde', budgetMin: 100, budgetMax: 300, prefersProposals: false, status: 'open' },
  { id: ids.requests[2], ownerId: customers[1].id, title: 'Montar armário de quarto', categoryId: 'montagem-moveis', description: 'Armário novo de duas portas, com manual e peças. Preciso de montagem e conferência das ferragens.', neighborhood: 'Portão', budgetMin: 180, budgetMax: 450, prefersProposals: false, status: 'contracted' },
  { id: ids.requests[3], ownerId: customers[2].id, title: 'Limpeza de apartamento', categoryId: 'limpeza', description: 'Solicitação fictícia cancelada para demonstrar histórico preservado.', neighborhood: 'Batel', budgetMin: 150, budgetMax: 400, prefersProposals: false, status: 'cancelled' },
]

const conversations = [
  { id: ids.conversations[0], requestId: requests[0].id, ownerId: customers[0].id, providerId: providers[0].id },
  { id: ids.conversations[1], requestId: requests[0].id, ownerId: customers[0].id, providerId: providers[1].id },
  { id: ids.conversations[2], requestId: requests[1].id, ownerId: customers[0].id, providerId: providers[0].id },
  { id: ids.conversations[3], requestId: requests[2].id, ownerId: customers[1].id, providerId: providers[2].id },
]

const demoQuotes = [
  {
    id: ids.quotes[0], requestId: requests[0].id, conversationId: conversations[0].id,
    providerId: providers[0].id, title: 'Opção Essencial', status: 'active',
    versions: [
      { id: '00000000-0000-4000-8000-000000000511', number: 1, amountCents: 18500, description: 'Revisão de duas tomadas e diagnóstico do ponto de luz.', included: ['Mão de obra', 'Teste de segurança'], excluded: ['Luminária', 'Pintura'], days: 1, conditions: 'Materiais especiais são combinados antes do serviço.' },
      { id: '00000000-0000-4000-8000-000000000512', number: 2, amountCents: 20500, description: 'Revisão de tomadas com substituição de componentes básicos.', included: ['Mão de obra', 'Componentes básicos', 'Teste de segurança'], excluded: ['Luminária', 'Pintura'], days: 1, conditions: 'Peças fora do escopo são aprovadas pelo cliente antes da compra.' },
    ],
  },
  {
    id: ids.quotes[1], requestId: requests[0].id, conversationId: conversations[0].id,
    providerId: providers[0].id, title: 'Opção Completa', status: 'active',
    versions: [{ id: '00000000-0000-4000-8000-000000000521', number: 1, amountCents: 32000, description: 'Revisão elétrica completa dos pontos informados na solicitação.', included: ['Mão de obra', 'Revisão dos circuitos', 'Relato do diagnóstico'], excluded: ['Materiais especiais'], days: 2, conditions: 'Qualquer item adicional depende de aprovação.' }],
  },
  {
    id: ids.quotes[2], requestId: requests[0].id, conversationId: conversations[1].id,
    providerId: providers[1].id, title: 'Opção Especializada', status: 'active',
    versions: [{ id: '00000000-0000-4000-8000-000000000531', number: 1, amountCents: 27500, description: 'Avaliação especializada dos pontos e teste de funcionamento.', included: ['Visita técnica', 'Mão de obra', 'Relatório simples'], excluded: ['Materiais'], days: 2, conditions: 'Prazo depende da disponibilidade dos componentes.' }],
  },
  {
    id: ids.quotes[3], requestId: requests[2].id, conversationId: conversations[3].id,
    providerId: providers[2].id, title: 'Montagem com conferência', status: 'accepted',
    versions: [{ id: '00000000-0000-4000-8000-000000000541', number: 1, amountCents: 42000, description: 'Montagem do armário com conferência das ferragens e nivelamento.', included: ['Montagem', 'Nivelamento', 'Conferência final'], excluded: ['Fixação em parede de alvenaria'], days: 1, conditions: 'O manual e as peças devem estar disponíveis no local.' }],
  },
]

const messages = [
  { id: '00000000-0000-4000-8000-000000000401', conversationId: conversations[0].id, senderId: customers[0].id, senderType: 'customer', text: 'Olá! Quero comparar o escopo e o prazo para revisar as tomadas.' },
  { id: '00000000-0000-4000-8000-000000000402', conversationId: conversations[0].id, senderId: providers[0].id, senderType: 'provider', text: 'Olá! Posso avaliar os pontos e enviar alternativas de serviço.' },
  { id: '00000000-0000-4000-8000-000000000403', conversationId: conversations[1].id, senderId: customers[0].id, senderType: 'customer', text: 'Também gostaria de receber uma opção para comparar.' },
  { id: '00000000-0000-4000-8000-000000000404', conversationId: conversations[1].id, senderId: providers[1].id, senderType: 'provider', text: 'Vou confirmar o escopo e retorno com uma proposta.' },
  { id: '00000000-0000-4000-8000-000000000405', conversationId: conversations[2].id, senderId: customers[0].id, senderType: 'customer', text: 'Tenho a luminária e posso enviar uma foto do ponto.' },
  { id: '00000000-0000-4000-8000-000000000406', conversationId: conversations[2].id, senderId: providers[0].id, senderType: 'provider', text: 'Perfeito. Podemos combinar esse atendimento por aqui.' },
  { id: '00000000-0000-4000-8000-000000000407', conversationId: conversations[3].id, senderId: customers[1].id, senderType: 'customer', text: 'O armário está no quarto e as peças estão separadas.' },
  { id: '00000000-0000-4000-8000-000000000408', conversationId: conversations[3].id, senderId: providers[2].id, senderType: 'provider', text: 'Obrigado! Vou conferir o manual e o tempo estimado.' },
]

async function assertNoSeedIdConflicts() {
  for (const user of allUsers) {
    const [rows] = await db.execute('SELECT id,email FROM users WHERE id=? OR email=?', [user.id, user.email])
    if (rows.some((row) => row.id !== user.id || row.email !== user.email)) {
      throw new Error('Seed bloqueado: existe uma conta não pertencente aos dados fictícios com ID ou e-mail reservado.')
    }
  }
  for (const request of requests) {
    const [rows] = await db.execute('SELECT id,owner_id FROM service_requests WHERE id=?', [request.id])
    if (rows.some((row) => row.owner_id !== request.ownerId)) throw new Error('Seed bloqueado: ID reservado de solicitação pertence a outro cliente.')
  }
  for (const conversation of conversations) {
    const [rows] = await db.execute('SELECT id,request_id,provider_id FROM conversations WHERE id=? OR (request_id=? AND provider_id=?)', [conversation.id, conversation.requestId, conversation.providerId])
    if (rows.some((row) => row.id !== conversation.id || row.request_id !== conversation.requestId || row.provider_id !== conversation.providerId)) {
      throw new Error('Seed bloqueado: combinação reservada de solicitação e prestador já pertence a outra conversa.')
    }
  }
  for (const quote of demoQuotes) {
    const [rows] = await db.execute('SELECT id,request_id,provider_id FROM quotes WHERE id=?', [quote.id])
    if (rows.some((row) => row.request_id !== quote.requestId || row.provider_id !== quote.providerId)) {
      throw new Error('Seed bloqueado: ID reservado de orçamento pertence a outra solicitação ou prestador.')
    }
    for (const version of quote.versions) {
      const [versions] = await db.execute('SELECT id,quote_id,version_number FROM quote_versions WHERE id=?', [version.id])
      if (versions.some((row) => row.quote_id !== quote.id || Number(row.version_number) !== version.number)) {
        throw new Error('Seed bloqueado: ID reservado de versão pertence a outro orçamento.')
      }
    }
  }
}

async function ensureDemoQuote(connection, quote) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  await connection.execute(`INSERT IGNORE INTO quotes(id,request_id,conversation_id,provider_id,title,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`, [quote.id, quote.requestId, quote.conversationId, quote.providerId, quote.title, quote.status, timestamp, timestamp])

  for (const version of quote.versions) {
    await connection.execute(`INSERT IGNORE INTO quote_versions(id,quote_id,version_number,amount_cents,description,
      included_items,excluded_items,estimated_days,conditions,valid_until,issued_at)
      VALUES(?,?,?,?,?,?,?,?,?,NULL,?)`, [version.id, quote.id, version.number, version.amountCents,
      version.description, JSON.stringify(version.included), JSON.stringify(version.excluded), version.days, version.conditions, timestamp])
    const [rows] = await connection.execute('SELECT quote_id,version_number,amount_cents FROM quote_versions WHERE id=?', [version.id])
    if (!rows[0] || rows[0].quote_id !== quote.id || Number(rows[0].version_number) !== version.number || Number(rows[0].amount_cents) !== version.amountCents) {
      throw new Error('Seed interrompido: uma versão reservada não corresponde aos dados demonstrativos esperados.')
    }
  }

  const currentVersion = quote.versions.at(-1)
  await connection.execute('UPDATE quotes SET current_version_id=? WHERE id=? AND current_version_id IS NULL', [currentVersion.id, quote.id])
}

let operation = 'verificação da identidade do banco'
try {
  const [identityRows] = await db.query('SELECT DATABASE() AS databaseName, CURRENT_USER() AS username, VERSION() AS version')
  const identity = identityRows[0]
  if (identity.databaseName !== 'fechou_dev' || !identity.username.startsWith('fechou_app@') || !identity.version.startsWith('8.4.')) {
    throw new Error('Seed bloqueado: a identidade efetiva do servidor MySQL não corresponde ao banco de desenvolvimento autorizado.')
  }

  operation = 'verificação de IDs reservados'
  await assertNoSeedIdConflicts()
  const passwordHash = await bcrypt.hash(process.env.FECHOU_DEMO_PASSWORD, 12)
  await withTransaction(async (connection) => {
    operation = 'criação das contas fictícias'
    for (const user of allUsers) {
      const timestamp = now()
      await connection.execute(`INSERT INTO users(id,name,email,password_hash,role,city,region,bio,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role),city=VALUES(city),region=VALUES(region),bio=VALUES(bio),updated_at=VALUES(updated_at)`,
      [user.id, user.name, user.email, passwordHash, user.role, user.city, user.region, user.bio, timestamp, timestamp])
    }

    operation = 'criação dos perfis de prestadores'
    for (const provider of providers) {
      await connection.execute(`INSERT INTO provider_profiles(user_id,specialty,summary,categories,neighborhoods,services,active)
        VALUES(?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE specialty=VALUES(specialty),summary=VALUES(summary),categories=VALUES(categories),neighborhoods=VALUES(neighborhoods),services=VALUES(services),active=1`,
      [provider.id, provider.specialty, provider.summary, JSON.stringify(provider.categories), JSON.stringify(provider.neighborhoods), JSON.stringify(provider.services)])
    }

    operation = 'criação das solicitações e histórico'
    for (const request of requests) {
      const timestamp = now()
      await connection.execute(`INSERT INTO service_requests(id,owner_id,title,category_id,description,city,region,neighborhood,desired_date,availability,budget_min,budget_max,prefers_proposals,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'Curitiba','PR',?,NULL,'A combinar',?,?,?, ?,?,?)
        ON DUPLICATE KEY UPDATE title=VALUES(title),category_id=VALUES(category_id),description=VALUES(description),neighborhood=VALUES(neighborhood),budget_min=VALUES(budget_min),budget_max=VALUES(budget_max),prefers_proposals=VALUES(prefers_proposals),status=IF(status='contracted','contracted',VALUES(status)),updated_at=VALUES(updated_at)`,
      [request.id, request.ownerId, request.title, request.categoryId, request.description, request.neighborhood, request.budgetMin, request.budgetMax, Number(request.prefersProposals), request.status, timestamp, timestamp])
      const createdHistoryId = `10000000-0000-4000-8000-${request.id.slice(-12)}`
      const [history] = await connection.execute('SELECT id FROM request_history WHERE id=?', [createdHistoryId])
      if (!history.length) {
        await connection.execute('INSERT INTO request_history(id,request_id,event,description,created_at) VALUES(?,?,?,?,?)', [createdHistoryId, request.id, 'created', 'Solicitação fictícia de demonstração criada.', timestamp])
      }
      if (request.status === 'cancelled') {
        const cancelId = '10000000-0000-4000-8000-000000000204'
        const [cancelRows] = await connection.execute('SELECT id FROM request_history WHERE id=?', [cancelId])
        if (!cancelRows.length) await connection.execute('INSERT INTO request_history(id,request_id,event,description,created_at) VALUES(?,?,?,?,?)', [cancelId, request.id, 'cancelled', 'Solicitação fictícia cancelada para demonstrar histórico.', timestamp])
      }
      if (request.status === 'contracted') {
        const contractedId = '10000000-0000-4000-8000-000000000203'
        const [contractedRows] = await connection.execute('SELECT id FROM request_history WHERE id=?', [contractedId])
        if (!contractedRows.length) await connection.execute('INSERT INTO request_history(id,request_id,event,description,created_at) VALUES(?,?,?,?,?)', [contractedId, request.id, 'contracted', 'Orçamento fictício aceito para demonstrar uma ordem de serviço.', timestamp])
      }
    }

    operation = 'criação das conversas'
    for (const conversation of conversations) {
      const timestamp = now()
      await connection.execute(`INSERT INTO conversations(id,request_id,owner_id,provider_id,created_at,updated_at,last_message_at)
        VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=VALUES(id)`,
      [conversation.id, conversation.requestId, conversation.ownerId, conversation.providerId, timestamp, timestamp, timestamp])
    }

    operation = 'criação das mensagens'
    for (const message of messages) {
      const timestamp = now()
      await connection.execute(`INSERT INTO messages(id,conversation_id,sender_id,sender_type,text,sent_at)
        VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=VALUES(id)`,
      [message.id, message.conversationId, message.senderId, message.senderType, message.text, timestamp])
    }

    operation = 'atualização do horário das conversas'
    for (const conversation of conversations) {
      await connection.execute('UPDATE conversations SET last_message_at=(SELECT MAX(sent_at) FROM messages WHERE conversation_id=?) WHERE id=?', [conversation.id, conversation.id])
    }

    operation = 'criação das alternativas e versões de orçamento'
    for (const quote of demoQuotes) await ensureDemoQuote(connection, quote)

    operation = 'criação da ordem de serviço demonstrativa'
    const acceptedQuote = demoQuotes[3]
    const acceptedVersion = acceptedQuote.versions[0]
    const acceptedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await connection.execute(`INSERT IGNORE INTO service_orders(id,request_id,customer_id,provider_id,quote_id,quote_version_id,
      quote_title,version_number,amount_cents,description,included_items,excluded_items,estimated_days,conditions,valid_until,status,accepted_at)
      VALUES('00000000-0000-4000-8000-000000000601',?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,'contracted',?)`, [
      acceptedQuote.requestId, customers[1].id, acceptedQuote.providerId, acceptedQuote.id, acceptedVersion.id,
      acceptedQuote.title, acceptedVersion.number, acceptedVersion.amountCents, acceptedVersion.description,
      JSON.stringify(acceptedVersion.included), JSON.stringify(acceptedVersion.excluded), acceptedVersion.days,
      acceptedVersion.conditions, acceptedAt,
    ])
    const [orders] = await connection.execute('SELECT id,quote_id,quote_version_id FROM service_orders WHERE request_id=?', [acceptedQuote.requestId])
    if (!orders[0] || orders[0].id !== '00000000-0000-4000-8000-000000000601'
      || orders[0].quote_id !== acceptedQuote.id || orders[0].quote_version_id !== acceptedVersion.id) {
      throw new Error('Seed interrompido: a solicitação demo já está ligada a uma ordem diferente da versão demonstrativa reservada.')
    }
  })

  console.log('Seed fictício aplicado: 3 clientes, 6 prestadores ativos, 4 solicitações, 4 conversas, 8 mensagens, 4 orçamentos, 5 versões e 1 ordem de serviço. Nenhum registro fora dos IDs reservados foi removido.')
} catch (error) {
  console.error(`Seed interrompido durante ${operation}: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.end()
}
