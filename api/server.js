import 'dotenv/config'
import app from './src/app.js'
import db from './src/config/database.js'

const port = Number(process.env.PORT) || 3001
const host = process.env.HOST || '0.0.0.0'
const server = app.listen(port, host, () => console.log(`Fechou API disponível em http://${host}:${port}`))

function shutdown(signal) {
  console.log(`${signal}: encerrando a API`)
  server.close(async () => {
    await db.end()
    process.exit(0)
  })
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
