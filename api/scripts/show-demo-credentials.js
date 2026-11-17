import 'dotenv/config'

const emails = [
  'cliente.alameda@fechou.test',
  'prestador.eletrica@fechou.test',
  'prestador.hidraulica@fechou.test',
]

if (!process.env.FECHOU_DEMO_PASSWORD || process.env.FECHOU_DEMO_PASSWORD.startsWith('replace-with-')) {
  console.error('Senha de demonstração não configurada no api/.env local.')
  process.exitCode = 1
} else {
  console.log(`Contas de demonstração: ${emails.join(', ')}`)
  console.log(`Senha compartilhada: ${process.env.FECHOU_DEMO_PASSWORD}`)
}
