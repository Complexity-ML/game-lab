import { contextBridge, ipcRenderer } from 'electron'

const statusChannel = 'game-lab:datahub-status'
const datasetChannel = 'game-lab:datahub-dataset'
const mcpStatusChannel = 'game-lab:datahub-mcp-status'
const mcpConnectChannel = 'game-lab:datahub-mcp-connect'
const mcpSettingsSaveChannel = 'game-lab:datahub-mcp-settings-save'
const mcpAuditChannel = 'game-lab:datahub-mcp-audit'
const mcpSearchChannel = 'game-lab:datahub-mcp-search'
const mcpInspectChannel = 'game-lab:datahub-mcp-inspect'
const mcpInvalidateChannel = 'game-lab:datahub-mcp-invalidate'
const mcpWritebackChannel = 'game-lab:datahub-mcp-writeback'
const catalogConnectorsListChannel = 'game-lab:catalog-connectors-list'
const catalogConnectorSaveChannel = 'game-lab:catalog-connector-save'
const catalogConnectorDeleteChannel = 'game-lab:catalog-connector-delete'
const catalogConnectorTestChannel = 'game-lab:catalog-connector-test'
const catalogSearchChannel = 'game-lab:catalog-search'
const catalogInspectChannel = 'game-lab:catalog-inspect'
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
const catalogCheckpointLoadChannel = 'game-lab:catalog-checkpoint-load'
const catalogCheckpointSaveChannel = 'game-lab:catalog-checkpoint-save'
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

contextBridge.exposeInMainWorld('dataLab', {
  runtime: 'electron',
  platform: process.platform,
  getDataHubStatus: () => ipcRenderer.invoke(statusChannel),
  loadDatasetContext: (urn: string) => ipcRenderer.invoke(datasetChannel, { urn }),
  getDataHubMcpStatus: () => ipcRenderer.invoke(mcpStatusChannel),
  connectDataHubMcp: () => ipcRenderer.invoke(mcpConnectChannel),
  saveDataHubMcpSettings: (payload: { transport: 'http' | 'stdio'; url: string; catalogReadRoute?: 'auto' | 'gms' | 'mcp'; token?: string; clearToken?: boolean; writebackEnabled?: boolean }) => ipcRenderer.invoke(mcpSettingsSaveChannel, payload),
  auditDataHubWithMcp: (urn: string, force = false) => ipcRenderer.invoke(mcpAuditChannel, { urn, force }),
  searchDataHubAssets: (query: string) => ipcRenderer.invoke(mcpSearchChannel, { query }),
  inspectDataHubAsset: (urn: string, force = false, mode: 'summary' | 'deep' = 'deep') => ipcRenderer.invoke(mcpInspectChannel, { urn, force, mode }),
  invalidateDataHubContext: (urn?: string) => ipcRenderer.invoke(mcpInvalidateChannel, { urn }),
  writeDataHubDecision: (payload: { revisionId: string; title: string; rationale: string; author: string; relatedAssets: string[] }) => ipcRenderer.invoke(mcpWritebackChannel, payload),
  listCatalogConnectors: () => ipcRenderer.invoke(catalogConnectorsListChannel),
  saveCatalogConnector: (payload: unknown) => ipcRenderer.invoke(catalogConnectorSaveChannel, payload),
  deleteCatalogConnector: (id: string) => ipcRenderer.invoke(catalogConnectorDeleteChannel, { id }),
  testCatalogConnector: (id: string) => ipcRenderer.invoke(catalogConnectorTestChannel, { id }),
  searchCatalogAssets: (query: string) => ipcRenderer.invoke(catalogSearchChannel, { query }),
  inspectCatalogAsset: (connectorId: string, assetRef: string, force = false, mode: 'summary' | 'deep' = 'deep') => ipcRenderer.invoke(catalogInspectChannel, { connectorId, assetRef, force, mode }),
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
  loadCatalogCheckpoint: (key: string) => ipcRenderer.invoke(catalogCheckpointLoadChannel, { key }),
  saveCatalogCheckpoint: (key: string, progress: unknown) => ipcRenderer.invoke(catalogCheckpointSaveChannel, { key, progress }),
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
