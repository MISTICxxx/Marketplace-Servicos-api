# Fechou! API

API REST em Node.js/Express com persistência MySQL. Contas, perfis de prestadores, pedidos, histórico, conversas e mensagens ficam no banco. Senhas são armazenadas com hash bcrypt; rotas privadas exigem JWT.

## Requisitos e ambiente local

- Node.js 20.19+, Docker e Docker Compose.
- Na pasta `api`, instale dependências com `npm ci` e prepare o arquivo local ignorado `api/.env` a partir de `.env.example`. Substitua os valores demonstrativos de senha e `JWT_SECRET` por valores aleatórios locais com pelo menos 32 caracteres.
- O Compose inicia um MySQL 8.4.13 persistente em loopback e usa o volume nomeado `fechou_dev_mysql_data`.

```powershell
docker compose -f compose.dev.yaml up -d --wait
npm run db:migrate
npm run db:status
npm run db:seed:demo
npm start
```

A API fica em `http://127.0.0.1:3001` e o health check em `GET /api/health`. O servidor não executa DDL ao iniciar. Aplique mudanças apenas com `npm run db:migrate`; migrations ordenadas e seus checksums ficam registrados em `schema_migrations`. Consulte o estado com `npm run db:status`.

Para pausar preservando os dados, use `docker compose -f compose.dev.yaml stop`. Para voltar, use `docker compose -f compose.dev.yaml up -d --wait`. Não use `down -v` na rotina de desenvolvimento. O container e o volume de testes são separados do banco permanente.

O seed é explícito, só aceita o banco de desenvolvimento local `fechou_dev` e não apaga registros. Use `npm run db:demo:credentials` para consultar no terminal local as contas fictícias e a senha compartilhada, definida somente em `.env`. O endereço do frontend precisa ser incluído em `CORS_ORIGIN`; no workspace, a origem configurada é `http://127.0.0.1:5174`. Em ambientes públicos, use HTTPS, credenciais fortes, backups e acesso restrito ao banco.

## Testes automatizados

`npm test` executa os testes HTTP e de middleware sem banco. Eles iniciam o Express diretamente em loopback e porta efêmera, usam JWT sintético e apontam qualquer pool acidental para `127.0.0.1:1`; não carregam `.env` nem iniciam `server.js`.

`npm run test:integration` executa os fluxos persistidos. Antes de importar módulos da API, exige `TEST_MYSQL_HOST=127.0.0.1`, uma porta explícita entre `20000` e `59999`, `TEST_MYSQL_USER=fechou_test`, `TEST_MYSQL_DATABASE=fechou_test` e uma senha aleatória no formato `fechou-tmp-` mais 32 caracteres hexadecimais. Não usa os defaults do banco e rejeita destinos diferentes. O teste confirma banco, usuário, porta interna e versão MySQL antes de chamar o DDL.

### MySQL descartável com Docker Compose

Requisitos: Docker daemon ativo e Docker Compose. A configuração `compose.test.yaml` fixa a imagem oficial `mysql:8.4.13`, publica somente em loopback, exige credenciais temporárias por variáveis de ambiente e monta `/var/lib/mysql` em `tmpfs`; os dados desaparecem com o container. A versão é fixada para reproduzir o ambiente de testes. Consulte a [imagem oficial MySQL no Docker Hub](https://hub.docker.com/_/mysql).

Exemplo PowerShell. Confirme que a porta `33316` está livre antes de iniciar; escolha outra porta dentro da faixa aceita pelo teste caso esteja ocupada.

```powershell
$env:FECHOU_TEST_MYSQL_PORT = '33316'
$env:FECHOU_TEST_DB_ROOT_PASSWORD = 'fechou-root-tmp-' + [guid]::NewGuid().ToString('N')
$env:TEST_MYSQL_PASSWORD = 'fechou-tmp-' + [guid]::NewGuid().ToString('N')
$env:TEST_MYSQL_HOST = '127.0.0.1'
$env:TEST_MYSQL_PORT = $env:FECHOU_TEST_MYSQL_PORT
$env:TEST_MYSQL_USER = 'fechou_test'
$env:TEST_MYSQL_DATABASE = 'fechou_test'
$project = 'fechou-etapa03-' + [guid]::NewGuid().ToString('N').Substring(0, 8)

try {
  docker compose --project-name $project -f compose.test.yaml up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o MySQL descartável.' }
  npm run test:integration
  if ($LASTEXITCODE -ne 0) { throw 'A suíte de integração falhou.' }
}
finally {
  docker compose --project-name $project -f compose.test.yaml down --remove-orphans
  Remove-Item Env:FECHOU_TEST_MYSQL_PORT, Env:FECHOU_TEST_DB_ROOT_PASSWORD, Env:TEST_MYSQL_PASSWORD, Env:TEST_MYSQL_HOST, Env:TEST_MYSQL_PORT, Env:TEST_MYSQL_USER, Env:TEST_MYSQL_DATABASE -ErrorAction SilentlyContinue
}
```

O nome do projeto Compose deve ser exclusivo da execução. Não conecte a suíte a um MySQL local existente. O servidor HTTP não executa DDL; a suíte chama explicitamente as migrations somente depois de validar host, porta, schema, usuário e versão do servidor. Os testes usam contas fictícias e IDs aleatórios. Não removem dados nem executam `DROP DATABASE`; a limpeza do estado de teste ocorre ao encerrar o container descartável. Não use `docker compose down -v`.

Os testes cobrem autenticação, perfis, propriedade das solicitações, autorização de `/requests/open`, conversas, mensagens, orçamentos, versões imutáveis, aceite concorrente e persistência depois de reiniciar o processo da API. O teste de integração deve ser executado separadamente da suíte sem banco.

## Endpoints

Todas as respostas usam JSON. Erros seguem `{ "error": "...", "details"?: [...] }`. Rotas privadas recebem `Authorization: Bearer <token>`. IDs são UUIDs.

| Método | Rota | Acesso | Uso |
| --- | --- | --- | --- |
| GET | `/health` | público | Estado da API |
| POST | `/api/auth/register` | público | Cadastro `{ name, email, password, role? }`; `role`: `customer` ou `provider` |
| POST | `/api/auth/login` | público | Login `{ email, password }` |
| GET | `/api/auth/me` | autenticado | Conta da sessão |
| POST | `/api/auth/refresh` | autenticado | Emite novo JWT |
| POST | `/api/auth/logout` | autenticado | Encerra no cliente; JWT expira conforme `JWT_EXPIRES_IN` |
| GET/PATCH | `/api/profile` | autenticado | Consulta e atualiza nome, cidade, região e bio |
| GET | `/api/providers` | público | Diretório; filtros `q`, `category`, `neighborhood` |
| GET | `/api/providers/:id` | público | Perfil de prestador |
| GET | `/api/providers/categories` | público | IDs de categorias aceitas |
| GET/PUT | `/api/providers/me` | prestador | Consulta e atualiza perfil, categorias, bairros e serviços |
| GET | `/api/requests` | autenticado | Pedidos próprios |
| GET | `/api/requests/open` | prestador autenticado | Pedidos abertos no marketplace |
| POST | `/api/requests` | cliente | Cria pedido |
| GET/PATCH | `/api/requests/:id` | dono (GET também prestador para pedidos abertos) | Consulta e edita pedido aberto |
| POST | `/api/requests/:id/cancel` | dono | Cancela pedido preservando histórico |
| GET | `/api/conversations` | autenticado | Conversas da conta |
| POST | `/api/conversations` | cliente | Inicia/reutiliza conversa `{ requestId, providerId }` |
| GET | `/api/conversations/:id` | participante | Conversa e mensagens |
| POST | `/api/conversations/:id/messages` | participante | Envia `{ text }` |
| POST | `/api/conversations/:id/read` | participante | Marca mensagens recebidas como lidas |
| GET | `/api/requests/:requestId/quotes` | cliente dono; prestador com conversa vinculada | Lista propostas para comparação |
| GET | `/api/conversations/:conversationId/quotes` | participante | Lista propostas da conversa |
| POST | `/api/conversations/:conversationId/quotes` | prestador da conversa | Cria uma alternativa e sua versão inicial |
| GET | `/api/quotes/:quoteId` | cliente dono ou prestador responsável | Consulta proposta vigente |
| GET | `/api/quotes/:quoteId/versions` | cliente dono ou prestador responsável | Consulta histórico de versões |
| POST | `/api/quotes/:quoteId/versions` | prestador responsável | Emite nova versão sem alterar anteriores |
| POST | `/api/quotes/:quoteId/withdraw` | prestador responsável | Retira proposta ativa |
| POST | `/api/quotes/:quoteId/accept` | cliente dono | Aceita `{ versionId }` e cria ordem de serviço |
| GET | `/api/service-orders` | participante | Lista ordens próprias; filtro opcional `requestId` |
| GET | `/api/service-orders/:orderId` | cliente ou prestador participante | Consulta snapshot da contratação |

`GET /api/providers/me` retorna o perfil próprio, incluindo `active` como booleano, mesmo quando inativo. Retorna 404 quando não há linha de perfil para o prestador autenticado. A resposta não inclui e-mail ou campos de senha. A listagem e o detalhe públicos continuam filtrando `active=1` e não expõem o campo `active`.

Orçamentos armazenam valores em centavos inteiros. Cada revisão cria uma linha imutável em `quote_versions`; triggers MySQL bloqueiam atualizações e remoções. O aceite valida a versão vigente dentro de transação, limita a uma contratação por solicitação e retorna a ordem já criada em uma repetição idempotente do mesmo aceite. A ordem preserva o snapshot de título, valor, escopo, prazo e condições da versão aceita. O chat não vale como aceite. Não há processamento de pagamentos.

Campos de pedido: `title`, `categoryId`, `description`, `city`, `region` e opcionais `neighborhood`, `desiredDate` (AAAA-MM-DD), `availability`, `budgetMin`, `budgetMax`, `prefersProposals`. Categorias: `eletrica`, `hidraulica`, `limpeza`, `montagem-moveis`, `pintura`, `jardinagem`, `reparos`, `outros`.

## Integração com o frontend

O frontend aponta o Axios para `VITE_API_URL` (padrão `http://localhost:3001/api`) e usa os endpoints acima para cadastro, login, perfil, diretório, pedidos, conversas, orçamentos e ordens de serviço. A sessão JWT fica no `sessionStorage` da aba: os registros persistem no MySQL, mas fechar a aba encerra a sessão. O modelo atual exige escolher `customer` ou `provider` no cadastro. Recuperação de senha e pagamentos não estão implementados.
