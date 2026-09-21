import { spawn } from 'node:child_process'
import electron from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.VIDEO_ORGANIZER_DEV = process.argv.includes('--dev') ? '1' : '0'
const child = spawn(electron, ['.'], { env, stdio: 'inherit', windowsHide: true })
child.on('error', (error) => {
  console.error('Não foi possível iniciar o Electron:', error)
  process.exitCode = 1
})
child.on('exit', (code) => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { child.kill(signal) })
}
