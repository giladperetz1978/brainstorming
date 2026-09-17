const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')

const npmCli = process.env.npm_execpath || (process.platform === 'win32' ? 'npm.cmd' : 'npm')

function hiddenPrompt(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      process.stdout.write(question)
      process.stdin.once('data', (data) => resolve(String(data).trim()))
      return
    }
    const stdin = process.stdin
    let value = ''
    process.stdout.write(`\n${question}`)
    stdin.setRawMode(true)
    stdin.resume()
    const onData = (chunk) => {
      const input = String(chunk)
      const end = input.search(/[\r\n]/)
      if (end >= 0) {
        value += input.slice(0, end)
        stdin.setRawMode(false)
        stdin.off('data', onData)
        process.stdout.write('\n')
        resolve(value.trim())
      } else if (input.includes('\u0003')) {
        process.stdout.write('\n')
        process.exit(1)
      } else {
        for (const character of input) {
          if (character === '\u0008' || character === '\u007f') {
            if (value.length > 0) {
              value = value.slice(0, -1)
              process.stdout.write('\b \b')
            }
          } else {
            value += character
            process.stdout.write('*')
          }
        }
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const key = process.env.GEMINI_API_KEY || await hiddenPrompt('Gemini API key (hidden, required): ')
  if (!key) {
    process.stderr.write('\nNo Gemini API key was entered. The app was not started.\n')
    process.exit(1)
  }
  const build = process.env.npm_execpath
    ? spawnSync(process.execPath, [npmCli, 'run', 'build'], { stdio: 'inherit' })
    : spawnSync(npmCli, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (build.status !== 0) process.exit(build.status || 1)

  const electronBinary = require('electron')
  const electron = spawn(electronBinary, [path.join(__dirname, '..', 'electron', 'main.cjs')], {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, GEMINI_API_KEY: key },
  })
  electron.on('exit', (code) => process.exit(code ?? 0))
}

main()