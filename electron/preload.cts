import { contextBridge, ipcRenderer } from 'electron'

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
const gameBridgeResumeChannel = 'game-lab:game-bridge-resume'
const gameBridgeCheckpointsChannel = 'game-lab:game-bridge-checkpoints'

contextBridge.exposeInMainWorld('gameLab', {
  runtime: 'electron',
  platform: process.platform,
  notifyHumanReview: (payload: { cardLabel: string; reason: string; versionId?: string; remind?: boolean }) => ipcRenderer.invoke(humanReviewNotificationChannel, payload),
  getAiStatus: () => ipcRenderer.invoke(aiStatusChannel),
  saveAiSettings: (payload: unknown) => ipcRenderer.invoke(aiSaveChannel, payload),
  testAiConnection: () => ipcRenderer.invoke(aiTestChannel),
  refreshAiModelCatalog: (provider: 'openai' | 'anthropic' | 'moonshot') => ipcRenderer.invoke(aiCatalogRefreshChannel, { provider }),
  runAiProposal: (payload: unknown) => ipcRenderer.invoke(aiProposalChannel, payload),
  cancelAiProposal: () => ipcRenderer.invoke(aiCancelChannel),
  getChatGPTStatus: () => ipcRenderer.invoke(chatGPTStatusChannel),
  connectChatGPT: () => ipcRenderer.invoke(chatGPTConnectChannel),
  cancelChatGPTLogin: () => ipcRenderer.invoke(chatGPTLoginCancelChannel),
  disconnectChatGPT: () => ipcRenderer.invoke(chatGPTDisconnectChannel),
  configureChatGPT: (payload: { model: string; effort: string }) => ipcRenderer.invoke(chatGPTConfigureChannel, payload),
  runChatGPTProposal: (payload: unknown) => ipcRenderer.invoke(chatGPTProposalChannel, payload),
  cancelChatGPTProposal: () => ipcRenderer.invoke(chatGPTCancelChannel),
  loadWorkspaceState: () => ipcRenderer.invoke(workspaceLoadChannel),
  createWorkspace: (name: string, workspace: unknown) => ipcRenderer.invoke(workspaceCreateChannel, { name, workspace }),
  renameWorkspace: (workspaceId: string, name: string) => ipcRenderer.invoke(workspaceRenameChannel, { workspaceId, name }),
  duplicateWorkspace: (workspaceId: string, name?: string) => ipcRenderer.invoke(workspaceDuplicateChannel, { workspaceId, name }),
  archiveWorkspace: (workspaceId: string) => ipcRenderer.invoke(workspaceArchiveChannel, { workspaceId }),
  deleteWorkspace: (workspaceId: string) => ipcRenderer.invoke(workspaceDeleteChannel, { workspaceId }),
  openWorkspace: (workspaceId: string) => ipcRenderer.invoke(workspaceOpenChannel, { workspaceId }),
  autosaveWorkspace: (workspace: unknown) => ipcRenderer.invoke(workspaceAutosaveChannel, workspace),
  commitWorkspace: (workspace: unknown) => ipcRenderer.invoke(workspaceCommitChannel, workspace),
  resolveWorkspaceRecovery: (action: 'recover' | 'discard') => ipcRenderer.invoke(workspaceRecoveryChannel, { action }),
  listAgentProposalMemory: () => ipcRenderer.invoke(proposalMemoryListChannel),
  rememberAgentProposal: (proposal: unknown) => ipcRenderer.invoke(proposalMemoryRememberChannel, proposal),
  updateAgentProposalMemoryStatus: (graphFingerprint: string, status: string, versionId?: string) => ipcRenderer.invoke(proposalMemoryStatusChannel, { graphFingerprint, status, versionId }),
  getActiveAiSource: () => ipcRenderer.invoke(activeAiSourceChannel),
  setActiveAiSource: (source: 'chatgpt' | 'openai' | 'anthropic' | 'moonshot') => ipcRenderer.invoke(activeAiSourceSaveChannel, { source }),
  recordDiagnostic: (event: unknown) => ipcRenderer.invoke(diagnosticsRecordChannel, event),
  exportDiagnostics: () => ipcRenderer.invoke(diagnosticsExportChannel),
  openDiagnosticLogs: () => ipcRenderer.invoke(diagnosticsOpenChannel),
  getDiagnosticSettings: () => ipcRenderer.invoke(diagnosticsSettingsChannel),
  saveDiagnosticSettings: (settings: unknown) => ipcRenderer.invoke(diagnosticsSettingsSaveChannel, settings),
  listIncidentEvents: () => ipcRenderer.invoke(incidentsListChannel),
  recordIncidentEvent: (event: unknown) => ipcRenderer.invoke(incidentsRecordChannel, event),
  clearIncidentEvents: () => ipcRenderer.invoke(incidentsClearChannel),
  restartApplication: () => ipcRenderer.invoke(applicationRestartChannel),
  getAppUpdateStatus: () => ipcRenderer.invoke(appUpdateStatusChannel),
  setAppUpdateChannel: (channel: 'stable' | 'main') => ipcRenderer.invoke(appUpdateSetChannel, { channel }),
  checkForAppUpdate: () => ipcRenderer.invoke(appUpdateCheckChannel),
  downloadAppUpdate: () => ipcRenderer.invoke(appUpdateDownloadChannel),
  installAppUpdate: () => ipcRenderer.invoke(appUpdateInstallChannel),
  openAppSetupUpdater: () => ipcRenderer.invoke(appUpdateOpenSetupChannel),
  getGameBridgeSettings: () => ipcRenderer.invoke(gameBridgeSettingsChannel),
  saveGameBridgeSettings: (payload: { endpoint: string }) => ipcRenderer.invoke(gameBridgeSettingsSaveChannel, payload),
  getGameBridgeStatus: () => ipcRenderer.invoke(gameBridgeStatusChannel),
  getGameObservation: (source?: string) => ipcRenderer.invoke(gameBridgeObservationChannel, source),
  executeGameAction: (payload: unknown) => ipcRenderer.invoke(gameBridgeActionChannel, payload),
  emergencyStopGameBridge: () => ipcRenderer.invoke(gameBridgeStopChannel),
  resumeGameBridge: () => ipcRenderer.invoke(gameBridgeResumeChannel),
  listGameCheckpoints: (limit = 20) => ipcRenderer.invoke(gameBridgeCheckpointsChannel, { limit }),
  onAppUpdateStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on(appUpdateStatusChangedChannel, listener)
    return () => ipcRenderer.removeListener(appUpdateStatusChangedChannel, listener)
  },
  onHumanReviewOpened: (callback: (payload: { versionId?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { versionId?: string } = {}) => callback(payload)
    ipcRenderer.on(humanReviewOpenedChannel, listener)
    return () => ipcRenderer.removeListener(humanReviewOpenedChannel, listener)
  },
  getWindowState: () => ipcRenderer.invoke(windowStateChannel),
  onWindowStateChanged: (callback: (state: { fullscreen: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { fullscreen: boolean }) => callback(state)
    ipcRenderer.on(windowStateChangedChannel, listener)
    return () => ipcRenderer.removeListener(windowStateChangedChannel, listener)
  },
})
