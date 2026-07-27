import type { ActiveAiSource, AiProposalResponse, AiSettings, AiStatus, ChatGPTSessionStatus } from './domain/ai'
import type { WorkspaceManagerState, WorkspacePayload, WorkspaceSummary } from './domain/workspace'
import type { DiagnosticBundle, DiagnosticInput, DiagnosticSettings } from './domain/diagnostics'
import type { AppUpdateChannel, AppUpdateStatus } from './domain/updates'
import type { IncidentEvent, IncidentEventInput, IncidentRecordResult } from './domain/incidents'
import type { AgentProposalMemoryEntry, AgentProposalMemoryStatus, RememberAgentProposalInput } from './domain/proposal-memory'
import type { GameActionCommand, GameActionReceipt, GameBridgeSettings, GameBridgeStatus, GameCheckpointSummary, GameObservation } from './domain/game-bridge'

declare global {
  interface Window {
    gameLab?: {
      runtime: 'electron'
      platform: 'darwin' | 'win32' | 'linux'
      notifyHumanReview(payload: { cardLabel: string; reason: string; versionId?: string; remind?: boolean }): Promise<{ shown: boolean; deduplicated?: boolean }>
      getAiStatus(): Promise<AiStatus>
      saveAiSettings(payload: Partial<AiSettings> & { apiKey?: string; clearKey?: boolean }): Promise<AiStatus>
      testAiConnection(): Promise<AiStatus & { availableModels: string[] }>
      refreshAiModelCatalog(provider: import('./domain/ai').ApiProvider): Promise<AiStatus>
      runAiProposal(payload: unknown): Promise<AiProposalResponse>
      cancelAiProposal(): Promise<{ cancelled: boolean }>
      getChatGPTStatus(): Promise<ChatGPTSessionStatus>
      connectChatGPT(): Promise<ChatGPTSessionStatus>
      cancelChatGPTLogin(): Promise<{ cancelled: boolean }>
      disconnectChatGPT(): Promise<ChatGPTSessionStatus>
      configureChatGPT(payload: { model: string; effort: string }): Promise<ChatGPTSessionStatus>
      runChatGPTProposal(payload: unknown): Promise<AiProposalResponse>
      cancelChatGPTProposal(): Promise<{ cancelled: boolean }>
      loadWorkspaceState(): Promise<WorkspaceManagerState>
      createWorkspace(name: string, workspace: WorkspacePayload): Promise<WorkspaceManagerState>
      renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceSummary[]>
      duplicateWorkspace(workspaceId: string, name?: string): Promise<WorkspaceManagerState>
      archiveWorkspace(workspaceId: string): Promise<WorkspaceManagerState>
      deleteWorkspace(workspaceId: string): Promise<WorkspaceManagerState>
      openWorkspace(workspaceId: string): Promise<WorkspaceManagerState>
      autosaveWorkspace(workspace: WorkspacePayload): Promise<{ saved: true; workspaceId: string; updatedAt: string } | { saved: false; reason: 'no-active-workspace' }>
      commitWorkspace(workspace: WorkspacePayload): Promise<{ saved: true; workspaceId: string; updatedAt: string }>
      resolveWorkspaceRecovery(action: 'recover' | 'discard'): Promise<WorkspaceManagerState>
      listAgentProposalMemory(): Promise<AgentProposalMemoryEntry[]>
      rememberAgentProposal(proposal: RememberAgentProposalInput): Promise<AgentProposalMemoryEntry>
      updateAgentProposalMemoryStatus(graphFingerprint: string, status: AgentProposalMemoryStatus, versionId?: string): Promise<AgentProposalMemoryEntry | undefined>
      getActiveAiSource(): Promise<{ source: ActiveAiSource }>
      setActiveAiSource(source: ActiveAiSource): Promise<{ source: ActiveAiSource }>
      recordDiagnostic(event: DiagnosticInput): Promise<(DiagnosticInput & { id: string; timestamp: string }) | undefined>
      exportDiagnostics(): Promise<DiagnosticBundle>
      openDiagnosticLogs(): Promise<{ opened: true; path: string }>
      getDiagnosticSettings(): Promise<DiagnosticSettings>
      saveDiagnosticSettings(settings: DiagnosticSettings): Promise<DiagnosticSettings>
      listIncidentEvents(): Promise<IncidentEvent[]>
      recordIncidentEvent(event: IncidentEventInput): Promise<IncidentRecordResult>
      clearIncidentEvents(): Promise<{ deleted: number; workspaceId?: string }>
      restartApplication(): Promise<{ restarting: true }>
      getAppUpdateStatus(): Promise<AppUpdateStatus>
      setAppUpdateChannel(channel: AppUpdateChannel): Promise<AppUpdateStatus>
      checkForAppUpdate(): Promise<AppUpdateStatus>
      downloadAppUpdate(): Promise<AppUpdateStatus>
      installAppUpdate(): Promise<AppUpdateStatus>
      openAppSetupUpdater(): Promise<{ opened: true; channel: AppUpdateChannel; path: string }>
      getGameBridgeSettings(): Promise<GameBridgeSettings>
      saveGameBridgeSettings(settings: GameBridgeSettings): Promise<GameBridgeSettings>
      getGameBridgeStatus(): Promise<GameBridgeStatus>
      getGameObservation(source?: import('./domain/game-bridge').GameObservationSource): Promise<GameObservation>
      executeGameAction(command: GameActionCommand): Promise<GameActionReceipt>
      emergencyStopGameBridge(): Promise<{ stopped: boolean; commandId: string; summary: string }>
      resumeGameBridge(): Promise<{ resumed: boolean; summary: string }>
      listGameCheckpoints(limit?: number): Promise<GameCheckpointSummary[]>
      onAppUpdateStatusChanged(callback: (status: AppUpdateStatus) => void): () => void
      onHumanReviewOpened(callback: (payload: { versionId?: string }) => void): () => void
      getWindowState(): Promise<{ fullscreen: boolean }>
      onWindowStateChanged(callback: (state: { fullscreen: boolean }) => void): () => void
    }
  }
}

export {}
