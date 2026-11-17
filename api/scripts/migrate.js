import 'dotenv/config'
import db, { runMigrations } from '../src/config/database.js'

try {
  const executed = await runMigrations()
  if (executed.length) console.log(`Migrations aplicadas: ${executed.join(', ')}`)
  else console.log('Schema atualizado; nenhuma migration pendente.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await db.end()
}
