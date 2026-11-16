# Fechou! API

API REST em Node.js/Express com persistência MySQL. Contas, perfis de prestadores, pedidos, histórico, conversas e mensagens ficam no banco. Senhas são armazenadas com hash bcrypt; rotas privadas exigem JWT.

## Requisitos e inicialização

- Node.js 20.19+ e MySQL 8+.
- Crie o banco uma vez no MySQL: `CREATE DATABASE fechou CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.
- Na pasta `api`, instale as dependências, copie `.env.example` para `.env`, ajuste os dados de conexão e defina um `JWT_SECRET` aleatório com pelo menos 32 caracteres:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

As tabelas são criadas automaticamente ao iniciar. A API fica em `http://localhost:3001`; o health check é `GET /health` ou `GET /api/health`. `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` e `MYSQL_CONNECTION_LIMIT` configuram a conexão.

Configure `CORS_ORIGIN` com a origem do frontend; origens múltiplas podem ser separadas por vírgula. Para o Vite local, use `http://localhost:5173`. Em produção, use HTTPS, credenciais fortes, backups do MySQL e acesso restrito ao banco.

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

O nome do projeto Compose deve ser exclusivo da execução. Não conecte a suíte a um MySQL local existente. A aplicação executa `CREATE TABLE IF NOT EXISTS` em `server.js`; a suíte de integração só faz isso depois de validar o destino. Os testes usam contas fictícias e IDs aleatórios. Não removem dados nem executam `DROP DATABASE`; a limpeza do estado de teste ocorre ao encerrar o container descartável. Não use `docker compose down -v`.

Os testes cobrem autenticação, perfis, propriedade das solicitações, autorização de `/requests/open`, conversas, mensagens, participantes e persistência depois de reiniciar o processo da API. O teste de integração deve ser executado separadamente da suíte sem banco.

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
| GET | `/api/requests/open` | autenticado | Pedidos abertos no marketplace |
| POST | `/api/requests` | cliente | Cria pedido |
| GET/PATCH | `/api/requests/:id` | dono (GET também prestador para pedidos abertos) | Consulta e edita pedido aberto |
| POST | `/api/requests/:id/cancel` | dono | Cancela pedido preservando histórico |
| GET | `/api/conversations` | autenticado | Conversas da conta |
| POST | `/api/conversations` | cliente | Inicia/reutiliza conversa `{ requestId, providerId }` |
| GET | `/api/conversations/:id` | participante | Conversa e mensagens |
| POST | `/api/conversations/:id/messages` | participante | Envia `{ text }` |
| POST | `/api/conversations/:id/read` | participante | Marca mensagens recebidas como lidas |

`GET /api/providers/me` retorna o perfil próprio, incluindo `active` como booleano, mesmo quando inativo. Retorna 404 quando não há linha de perfil para o prestador autenticado. A resposta não inclui e-mail ou campos de senha. A listagem e o detalhe públicos continuam filtrando `active=1` e não expõem o campo `active`.

Campos de pedido: `title`, `categoryId`, `description`, `city`, `region` e opcionais `neighborhood`, `desiredDate` (AAAA-MM-DD), `availability`, `budgetMin`, `budgetMax`, `prefersProposals`. Categorias: `eletrica`, `hidraulica`, `limpeza`, `montagem-moveis`, `pintura`, `jardinagem`, `reparos`, `outros`.

## Integração com o frontend

O frontend aponta o Axios para `VITE_API_URL` (padrão `http://localhost:3001/api`) e usa os endpoints acima para cadastro, login, perfil, diretório, pedidos e conversas. A sessão JWT fica no `sessionStorage` da aba. Registros demonstrativos antigos do navegador não são migrados automaticamente; crie uma conta para começar a salvar dados no MySQL. Recuperação de senha, propostas, contratação e pagamentos ainda não estão implementados.
