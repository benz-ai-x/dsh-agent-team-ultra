#!/usr/bin/env node

import { spawn } from 'node:child_process'

const cli = process.argv[2]
if (cli === undefined) throw new Error('verify-web-boot: expected the built dsh CLI path')
if (process.env.DSH_HOME === undefined) throw new Error('verify-web-boot: DSH_HOME must point at an isolated profile home')

const child = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stdout = ''
let stderr = ''
let ready = false
let forceKill

function append(current, chunk) {
  const next = current + chunk.toString()
  return next.length <= 65_536 ? next : next.slice(-65_536)
}

const deadline = setTimeout(() => {
  child.kill('SIGKILL')
}, 15_000)

child.stdout.on('data', chunk => {
  stdout = append(stdout, chunk)
  if (ready || !stdout.includes('dsh web: http://127.0.0.1:')) return
  ready = true
  child.kill('SIGTERM')
  forceKill = setTimeout(() => { child.kill('SIGKILL') }, 2_000)
})
child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
child.once('error', error => {
  clearTimeout(deadline)
  if (forceKill !== undefined) clearTimeout(forceKill)
  console.error(`web boot spawn failed: ${String(error)}`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  clearTimeout(deadline)
  if (forceKill !== undefined) clearTimeout(forceKill)
  if (ready) return
  console.error(`web boot exited before listening (code=${String(code)}, signal=${String(signal)})\n${stdout}\n${stderr}`)
  process.exitCode = 1
})
