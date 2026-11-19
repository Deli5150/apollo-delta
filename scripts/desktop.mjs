// Builds the desktop app: exports the web build into desktop/web, copies the version from the root
// package.json, then runs electron-builder with any arguments.
//   node scripts/desktop.mjs                 just prepare (then `npm start` in desktop/)
//   node scripts/desktop.mjs --mac --win --linux
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = path.join(root, 'desktop')
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const pkgFile = path.join(desktop, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
if (pkg.version !== version) {
  pkg.version = version
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
}


fs.rmSync(path.join(desktop, 'web'), { recursive: true, force: true })
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'desktop/web', '--clear'])
if (!fs.existsSync(path.join(desktop, 'web', 'index.html'))) throw new Error('web export failed')

const args = process.argv.slice(2)
if (args.length) run('npx', ['electron-builder', ...args], desktop)
