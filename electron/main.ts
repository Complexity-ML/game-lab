import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, type MenuItemConstructorOptions } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cancelAiProposal, getAiStatus, refreshAiModelCatalog, runAiProposal, saveAiSettings, testAiConnection } from './ai-provider.js'
import { ChatGPTAgentSession } from './chatgpt-session.js'
import { archiveWorkspace, autosaveWorkspaceDraft, beginWorkspaceSession, clearIncidentEvents, closeWorkspaceDatabase, commitActiveWorkspace, createWorkspace, deleteWorkspace, duplicateWorkspace, listAgentProposalMemory, listGameCheckpoints, listIncidentEvents, loadAppSetting, loadWorkspaceManagerState, markWorkspaceSessionClean, openWorkspace, recordIncidentEvent, rememberAgentProposal, renameWorkspace, resolveWorkspaceRecovery, saveAppSetting, saveGameCheckpoint, updateAgentProposalMemoryStatus } from './workspace-db.js'
import { parseActiveAiSource, requireSelectableAiSource, type ActiveAiSource } from './active-ai-source.js'
import { reserveHumanReviewNotification } from './human-review-notifications.js'
import { ensureDiagnosticLog, exportDiagnosticBundle, loadDiagnosticSettings, recordDiagnosticEvent, saveDiagnosticSettings } from './diagnostics.js'
import { AppUpdateController } from './app-updater.js'
import { parseUpdateChannel } from './update-policy.js'
import { desktopWindowFrame } from './window-platform.js'
import { openSetupUpdater, readSetupChannel, saveSetupChannel } from './setup-updater.js'
import { GameBridgeClient } from './game-bridge.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const humanReviewNotificationChannel = 'game-lab:human-review-notification'
const windowStateChannel = 'game-lab:window-state'
const windowStateChangedChannel = 'game-lab:window-state-changed'
const aiStatusChannel = 'game-lab:ai-status'
const aiSaveChannel = 'game-lab:ai-save'
const aiTestChannel = 'game-lab:ai-test'
const aiCatalogRefreshChannel = 'game-lab:ai-catalog-refresh'
const aiProposalChannel = 'game-lab:ai-proposal'
const aiCancelChannel = 'game-lab:ai-cancel'
const humanReviewOpenedChannel = 'game-lab:human-review-opened'
const chatGPTStatusChannel = 'game-lab:chatgpt-status'
const chatGPTConnectChannel = 'game-lab:chatgpt-connect'
const chatGPTLoginCancelChannel = 'game-lab:chatgpt-login-cancel'
const chatGPTDisconnectChannel = 'game-lab:chatgpt-disconnect'
const chatGPTConfigureChannel = 'game-lab:chatgpt-configure'
const chatGPTProposalChannel = 'game-lab:chatgpt-proposal'
const chatGPTCancelChannel = 'game-lab:chatgpt-cancel'
const workspaceLoadChannel = 'game-lab:workspace-load'
const workspaceCreateChannel = 'game-lab:workspace-create'
const workspaceRenameChannel = 'game-lab:workspace-rename'
const workspaceDuplicateChannel = 'game-lab:workspace-duplicate'
const workspaceArchiveChannel = 'game-lab:workspace-archive'
const workspaceDeleteChannel = 'game-lab:workspace-delete'
const workspaceOpenChannel = 'game-lab:workspace-open'
const workspaceAutosaveChannel = 'game-lab:workspace-autosave'
const workspaceCommitChannel = 'game-lab:workspace-commit'
const workspaceRecoveryChannel = 'game-lab:workspace-recovery'
const proposalMemoryListChannel = 'game-lab:proposal-memory-list'
const proposalMemoryRememberChannel = 'game-lab:proposal-memory-remember'
const proposalMemoryStatusChannel = 'game-lab:proposal-memory-status'
const activeAiSourceChannel = 'game-lab:active-ai-source'
const activeAiSourceSaveChannel = 'game-lab:active-ai-source-save'
const diagnosticsRecordChannel = 'game-lab:diagnostics-record'
const diagnosticsExportChannel = 'game-lab:diagnostics-export'
const diagnosticsOpenChannel = 'game-lab:diagnostics-open'
const diagnosticsSettingsChannel = 'game-lab:diagnostics-settings'
const diagnosticsSettingsSaveChannel = 'game-lab:diagnostics-settings-save'
const incidentsListChannel = 'game-lab:incidents-list'
const incidentsRecordChannel = 'game-lab:incidents-record'
const incidentsClearChannel = 'game-lab:incidents-clear'
const applicationRestartChannel = 'game-lab:application-restart'
const appUpdateStatusChannel = 'game-lab:app-update-status'
const appUpdateStatusChangedChannel = 'game-lab:app-update-status-changed'
const appUpdateSetChannel = 'game-lab:app-update-set-channel'
const appUpdateCheckChannel = 'game-lab:app-update-check'
const appUpdateDownloadChannel = 'game-lab:app-update-download'
const appUpdateInstallChannel = 'game-lab:app-update-install'
const appUpdateOpenSetupChannel = 'game-lab:app-update-open-setup'
const gameBridgeSettingsChannel = 'game-lab:game-bridge-settings'
const gameBridgeSettingsSaveChannel = 'game-lab:game-bridge-settings-save'
const gameBridgeStatusChannel = 'game-lab:game-bridge-status'
const gameBridgeObservationChannel = 'game-lab:game-bridge-observation'
const gameBridgeActionChannel = 'game-lab:game-bridge-action'
const gameBridgeStopChannel = 'game-lab:game-bridge-stop'
const gameBridgeCheckpointsChannel = 'game-lab:game-bridge-checkpoints'
let mainWindow: BrowserWindow | undefined
let isQuitting = false
let chatGPT: ChatGPTAgentSession | undefined
let appUpdates: AppUpdateController | undefined
let gameBridge: GameBridgeClient | undefined
let workspaceSessionWasUnclean = false

app.setName('GAME LAB')

function configureApplicationMenu() {
  if (process.platform !== 'darwin') return
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'GAME LAB',
      submenu: [
        {
          label: 'About GAME LAB',
          click: () => { void dialog.showMessageBox({ title: 'About GAME LAB', message: 'GAME LAB', detail: `Context-aware pipeline studio\nVersion ${app.getVersion()}`, buttons: ['OK'] }) },
        },
        { type: 'separator' },
        { label: 'Open GAME LAB', accelerator: 'CmdOrCtrl+0', click: focusMainWindow },
        { role: 'services' },
        { type: 'separator' },
        { label: 'Hide GAME LAB', role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit GAME LAB', role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Minecraft server help', click: () => void shell.openExternal('https://www.minecraft.net/download/server') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function currentActiveAiSource(): ActiveAiSource {
  const saved = loadAppSetting(app.getPath('userData'), 'active-ai-provider')
  return parseActiveAiSource(saved) ?? 'openai'
}

async function selectActiveAiSource(payload: { source?: unknown }) {
  const [apiStatus, chatGPTStatus] = await Promise.all([getAiStatus(), chatGPT?.status()])
  const source = requireSelectableAiSource(payload?.source, { chatgpt: Boolean(chatGPTStatus?.connected), openai: apiStatus.providers.openai.connected, anthropic: apiStatus.providers.anthropic.connected, moonshot: apiStatus.providers.moonshot.connected })
  if (source !== 'chatgpt') await saveAiSettings({ provider: source })
  saveAppSetting(app.getPath('userData'), 'active-ai-provider', source)
  return { source }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function notifyHumanReview(payload: { cardLabel?: unknown; reason?: unknown; versionId?: unknown; remind?: unknown }): { shown: boolean; deduplicated?: boolean } {
  const cardLabel = typeof payload?.cardLabel === 'string' ? payload.cardLabel.trim().slice(0, 120) : 'Agent flow'
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim().slice(0, 280) : 'The agent needs a human decision.'
  const versionId = typeof payload?.versionId === 'string' ? payload.versionId.trim().slice(0, 180) : undefined
  if (!Notification.isSupported()) return { shown: false }
  const reservation = reserveHumanReviewNotification(app.getPath('userData'), versionId, payload?.remind === true)
  if (!reservation.allowed) return { shown: false, deduplicated: true }

  const notification = new Notification({
    title: 'GAME LAB · Human review required',
    body: `${cardLabel} — ${reason}`,
  })
  notification.on('click', () => {
    focusMainWindow()
    mainWindow?.webContents.send(humanReviewOpenedChannel, { versionId })
  })
  notification.show()
  return { shown: true }
}

function createMainWindow() {
  const platformFrame = desktopWindowFrame(process.platform)
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f8fafc',
    title: 'GAME LAB',
    ...platformFrame,
    webPreferences: {
      preload: join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow = window

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  const isTrustedRendererUrl = (target: string) => {
    try {
      const parsed = new URL(target)
      if (developmentUrl) return parsed.origin === new URL(developmentUrl).origin
      return parsed.protocol === 'file:' && decodeURIComponent(parsed.pathname).endsWith('/dist/index.html')
    } catch { return false }
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, target) => { if (!isTrustedRendererUrl(target)) event.preventDefault() })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())

  const publishWindowState = () => {
    if (!window.isDestroyed()) window.webContents.send(windowStateChangedChannel, { fullscreen: window.isFullScreen() })
  }
  window.on('enter-full-screen', publishWindowState)
  window.on('leave-full-screen', publishWindowState)

  if (process.platform === 'darwin') {
    window.on('close', (event) => {
      if (isQuitting) return
      event.preventDefault()
      app.quit()
    })
  }
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(join(currentDirectory, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  workspaceSessionWasUnclean = beginWorkspaceSession(app.getPath('userData'))
  configureApplicationMenu()
  const persistedUpdateChannel = parseUpdateChannel(readSetupChannel(app.getPath('userData')) ?? loadAppSetting(app.getPath('userData'), 'app-update-channel'))
  saveAppSetting(app.getPath('userData'), 'app-update-channel', persistedUpdateChannel)
  appUpdates = new AppUpdateController({
    channel: persistedUpdateChannel,
    currentVersion: app.getVersion(),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
    window: () => mainWindow,
    statusChannel: appUpdateStatusChangedChannel,
  })
  chatGPT = new ChatGPTAgentSession((url) => shell.openExternal(url), app.getVersion(), join(app.getPath('userData'), 'chatgpt-agent'))
  gameBridge = new GameBridgeClient(
    {
      load: (key) => loadAppSetting(app.getPath('userData'), key),
      save: (key, value) => saveAppSetting(app.getPath('userData'), key, value),
    },
    { save: (checkpoint) => saveGameCheckpoint(app.getPath('userData'), checkpoint) },
  )
  ipcMain.handle(humanReviewNotificationChannel, (_event, payload: { cardLabel?: unknown; reason?: unknown; versionId?: unknown; remind?: unknown }) => notifyHumanReview(payload))
  ipcMain.handle(windowStateChannel, (event) => ({ fullscreen: BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false }))
  ipcMain.handle(aiStatusChannel, () => getAiStatus())
  ipcMain.handle(aiSaveChannel, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid AI settings request')
    return saveAiSettings(payload)
  })
  ipcMain.handle(aiTestChannel, () => testAiConnection())
  ipcMain.handle(aiCatalogRefreshChannel, (_event, payload: { provider?: unknown }) => refreshAiModelCatalog(payload ?? {}))
  ipcMain.handle(aiProposalChannel, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 100_000) throw new Error('Invalid AI proposal request')
    return runAiProposal(payload)
  })
  ipcMain.handle(aiCancelChannel, () => cancelAiProposal())
  ipcMain.handle(chatGPTStatusChannel, () => chatGPT?.status())
  ipcMain.handle(chatGPTConnectChannel, () => chatGPT?.connect())
  ipcMain.handle(chatGPTLoginCancelChannel, () => chatGPT?.cancelLogin() ?? { cancelled: false })
  ipcMain.handle(chatGPTDisconnectChannel, () => chatGPT?.disconnect())
  ipcMain.handle(chatGPTConfigureChannel, (_event, payload: { model?: unknown; effort?: unknown }) => chatGPT?.configure(payload ?? {}))
  ipcMain.handle(chatGPTProposalChannel, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 100_000) throw new Error('Invalid ChatGPT proposal request')
    return chatGPT?.runProposal(payload)
  })
  ipcMain.handle(chatGPTCancelChannel, () => chatGPT?.cancel() ?? { cancelled: false })
  ipcMain.handle(gameBridgeSettingsChannel, () => gameBridge?.configuration())
  ipcMain.handle(gameBridgeSettingsSaveChannel, (_event, payload: unknown) => gameBridge?.saveConfiguration(payload))
  ipcMain.handle(gameBridgeStatusChannel, () => gameBridge?.status())
  ipcMain.handle(gameBridgeObservationChannel, () => gameBridge?.observation())
  ipcMain.handle(gameBridgeActionChannel, (_event, payload: unknown) => gameBridge?.execute(payload))
  ipcMain.handle(gameBridgeStopChannel, () => gameBridge?.emergencyStop())
  ipcMain.handle(gameBridgeCheckpointsChannel, (_event, payload: { limit?: unknown }) => listGameCheckpoints(app.getPath('userData'), payload?.limit))
  ipcMain.handle(workspaceLoadChannel, () => loadWorkspaceManagerState(app.getPath('userData'), workspaceSessionWasUnclean))
  ipcMain.handle(workspaceCreateChannel, (_event, payload: { name?: unknown; workspace?: unknown }) => createWorkspace(app.getPath('userData'), payload?.name, payload?.workspace))
  ipcMain.handle(workspaceRenameChannel, (_event, payload: { workspaceId?: unknown; name?: unknown }) => renameWorkspace(app.getPath('userData'), payload?.workspaceId, payload?.name))
  ipcMain.handle(workspaceDuplicateChannel, (_event, payload: { workspaceId?: unknown; name?: unknown }) => duplicateWorkspace(app.getPath('userData'), payload?.workspaceId, payload?.name))
  ipcMain.handle(workspaceArchiveChannel, (_event, payload: { workspaceId?: unknown }) => archiveWorkspace(app.getPath('userData'), payload?.workspaceId))
  ipcMain.handle(workspaceDeleteChannel, (_event, payload: { workspaceId?: unknown }) => deleteWorkspace(app.getPath('userData'), payload?.workspaceId))
  ipcMain.handle(workspaceOpenChannel, (_event, payload: { workspaceId?: unknown }) => openWorkspace(app.getPath('userData'), payload?.workspaceId))
  ipcMain.handle(workspaceAutosaveChannel, (_event, payload: unknown) => autosaveWorkspaceDraft(app.getPath('userData'), payload))
  ipcMain.handle(workspaceCommitChannel, (_event, payload: unknown) => commitActiveWorkspace(app.getPath('userData'), payload))
  ipcMain.handle(proposalMemoryListChannel, () => listAgentProposalMemory(app.getPath('userData')))
  ipcMain.handle(proposalMemoryRememberChannel, (_event, payload: unknown) => rememberAgentProposal(app.getPath('userData'), payload))
  ipcMain.handle(proposalMemoryStatusChannel, (_event, payload: { graphFingerprint?: unknown; status?: unknown; versionId?: unknown }) => (
    updateAgentProposalMemoryStatus(app.getPath('userData'), payload?.graphFingerprint, payload?.status, payload?.versionId)
  ))
  ipcMain.handle(workspaceRecoveryChannel, (_event, payload: { action?: unknown }) => {
    const state = resolveWorkspaceRecovery(app.getPath('userData'), payload?.action)
    workspaceSessionWasUnclean = false
    return state
  })
  ipcMain.handle(activeAiSourceChannel, () => ({ source: currentActiveAiSource() }))
  ipcMain.handle(activeAiSourceSaveChannel, (_event, payload: { source?: unknown }) => selectActiveAiSource(payload ?? {}))
  ipcMain.handle(diagnosticsRecordChannel, (_event, payload: unknown) => recordDiagnosticEvent(app.getPath('userData'), payload))
  ipcMain.handle(diagnosticsExportChannel, () => exportDiagnosticBundle(app.getPath('userData')))
  ipcMain.handle(diagnosticsSettingsChannel, () => loadDiagnosticSettings(app.getPath('userData')))
  ipcMain.handle(diagnosticsSettingsSaveChannel, (_event, payload: unknown) => saveDiagnosticSettings(app.getPath('userData'), payload))
  ipcMain.handle(diagnosticsOpenChannel, () => {
    const path = ensureDiagnosticLog(app.getPath('userData'))
    shell.showItemInFolder(path)
    return { opened: true, path }
  })
  ipcMain.handle(incidentsListChannel, () => listIncidentEvents(app.getPath('userData')))
  ipcMain.handle(incidentsRecordChannel, (_event, payload: unknown) => recordIncidentEvent(app.getPath('userData'), payload))
  ipcMain.handle(incidentsClearChannel, () => clearIncidentEvents(app.getPath('userData')))
  ipcMain.handle(applicationRestartChannel, () => {
    setTimeout(() => { app.relaunch(); app.quit() }, 80)
    return { restarting: true }
  })
  ipcMain.handle(appUpdateStatusChannel, () => appUpdates?.getStatus())
  ipcMain.handle(appUpdateSetChannel, (_event, payload: { channel?: unknown }) => {
    if (payload?.channel !== 'stable' && payload?.channel !== 'main') throw new Error('Invalid application update channel')
    saveAppSetting(app.getPath('userData'), 'app-update-channel', payload.channel)
    saveSetupChannel(app.getPath('userData'), payload.channel)
    return appUpdates?.setChannel(payload.channel)
  })
  ipcMain.handle(appUpdateCheckChannel, () => appUpdates?.check())
  ipcMain.handle(appUpdateDownloadChannel, () => appUpdates?.download())
  ipcMain.handle(appUpdateOpenSetupChannel, () => {
    const channel = appUpdates?.getStatus().channel ?? 'stable'
    saveAppSetting(app.getPath('userData'), 'app-update-channel', channel)
    return openSetupUpdater(app.getPath('userData'), channel)
  })
  ipcMain.handle(appUpdateInstallChannel, async (event) => {
    const status = appUpdates?.getStatus()
    if (!status?.canInstall) throw new Error('No verified update is ready to install')
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'question' as const,
      title: 'Install verified GAME LAB update',
      message: `Restart and install GAME LAB ${status.availableVersion ?? 'update'}?`,
      detail: 'The application will close. The operating system and electron-updater will enforce the downloaded application signature before replacement.',
      buttons: ['Restart & install', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }
    const confirmation = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    if (confirmation.response !== 0) return status
    return appUpdates?.install()
  })
  createMainWindow()
  void appUpdates.initialize()
  app.on('activate', () => {
    focusMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  chatGPT?.stop()
  markWorkspaceSessionClean(app.getPath('userData'))
  closeWorkspaceDatabase()
})
