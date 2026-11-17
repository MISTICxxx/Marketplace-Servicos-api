import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'fechou',
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: true,
  dateStrings: true,
})

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))

async function listMigrations() {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && /^\d{4}-[a-z0-9-]+\.js$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  const versions = files.map((file) => file.slice(0, 4))
  if (new Set(versions).size !== versions.length) {
    throw new Error('Existem versões de migration duplicadas.')
  }
  return files
}

export async function runMigrations() {
  const connection = await pool.getConnection()
  let lockAcquired = false

  try {
    const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 30) AS acquired', ['fechou-schema-migrations'])
    lockAcquired = Number(lockRows[0]?.acquired) === 1
    if (!lockAcquired) throw new Error('Não foi possível obter o bloqueio exclusivo para migrations.')

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(190) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    const files = await listMigrations()
    const [appliedRows] = await connection.execute('SELECT version, checksum FROM schema_migrations ORDER BY version')
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]))
    const currentVersions = new Set(files)

    for (const version of applied.keys()) {
      if (!currentVersions.has(version)) {
        throw new Error(`A migration aplicada ${version} não existe mais no diretório; execução interrompida.`)
      }
    }

    const executed = []
    for (const file of files) {
      const source = await readFile(path.join(migrationsDirectory, file))
      const checksum = createHash('sha256').update(source).digest('hex')
      const priorChecksum = applied.get(file)

      if (priorChecksum && priorChecksum !== checksum) {
        throw new Error(`A migration aplicada ${file} foi alterada; crie uma nova migration em vez de editar o histórico.`)
      }
      if (priorChecksum) continue

      const migration = await import(pathToFileURL(path.join(migrationsDirectory, file)).href)
      if (typeof migration.up !== 'function') throw new Error(`A migration ${file} não exporta uma função up(connection).`)

      try {
        await migration.up(connection)
        await connection.execute('INSERT INTO schema_migrations(version, checksum) VALUES(?, ?)', [file, checksum])
      } catch (error) {
        throw new Error(`A migration ${file} falhou; ela não foi registrada como aplicada. Verifique o schema antes de repetir.`, { cause: error })
      }
      executed.push(file)
    }

    return executed
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute('SELECT RELEASE_LOCK(?)', ['fechou-schema-migrations'])
      } catch {
        // Fechar a conexão também libera o named lock.
      }
    }
    connection.release()
  }
}

// Mantém o nome usado pela suíte de integração existente. A função é explícita;
// o servidor HTTP não executa DDL ao iniciar.
export const initializeDatabase = runMigrations

export async function withTransaction(work) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export default pool
