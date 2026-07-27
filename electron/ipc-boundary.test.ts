import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const main = readFileSync(join(root, 'electron/main.ts'), 'utf8')
const preload = readFileSync(join(root, 'electron/preload.cts'), 'utf8')
const html = readFileSync(join(root, 'index.html'), 'utf8')

function channels(source: string) {
  return [...source.matchAll(/const\s+\w+Channel\s*=\s*'([^']+)'/g)].map((match) => match[1]).sort()
}

describe('Electron renderer trust boundary', () => {
  it('keeps preload and main on the same explicit channel allowlist', () => {
    expect(channels(preload).length).toBeGreaterThan(30)
    expect(channels(preload)).toEqual(channels(main))
    expect(preload).not.toMatch(/ipcRenderer\.(?:send|sendSync)\s*\(/)
    expect(preload).not.toMatch(/contextBridge\.exposeInMainWorld\([^,]+,\s*ipcRenderer/)
    expect([...preload.matchAll(/ipcRenderer\.invoke\(([^,)]+)/g)].every((match) => /Channel$/.test(match[1].trim()))).toBe(true)
  })

  it('enforces Electron isolation and denies renderer-controlled navigation surfaces', () => {
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('sandbox: true')
    expect(main).toContain('webSecurity: true')
    expect(main).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))")
    expect(main).toContain("on('will-navigate'")
    expect(main).toContain("on('will-attach-webview'")
  })

  it('ships a restrictive renderer content security policy', () => {
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("object-src 'none'")
    expect(html).toContain("base-uri 'none'")
    expect(html).toContain("frame-ancestors 'none'")
  })

  it('exposes Game Bridge actions and emergency stop through separate fixed channels', () => {
    expect(main).toContain("const gameBridgeActionChannel = 'game-lab:game-bridge-action'")
    expect(main).toContain("const gameBridgeStopChannel = 'game-lab:game-bridge-stop'")
    expect(main).toContain("const gameBridgeResumeChannel = 'game-lab:game-bridge-resume'")
    expect(preload).toContain('executeGameAction: (payload: unknown) => ipcRenderer.invoke(gameBridgeActionChannel, payload)')
    expect(preload).toContain('emergencyStopGameBridge: () => ipcRenderer.invoke(gameBridgeStopChannel)')
    expect(preload).toContain('resumeGameBridge: () => ipcRenderer.invoke(gameBridgeResumeChannel)')
  })
})
