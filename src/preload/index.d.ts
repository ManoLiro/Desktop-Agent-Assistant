export interface TranscriptSegment {
  id: string
  timestamp: number
  source: 'Áudio do sistema' | 'Microfone'
  text: string
  isFinal: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  hasScreenContext?: boolean
  error?: boolean
}

export interface AppSettings {
  geminiModel: string
  responseLanguage: string
  transcriptionLanguage: string
  whisperBinaryPath: string
  whisperModelPath: string
  selectedMonitorId: string
  autoAssistEnabled: boolean
  autoAssistIntervalSeconds: number
  includeNotesInContext: boolean
  shortcuts: Record<string, string>
}

export interface PerssuaState {
  isAssistantActive: boolean
  isPanelVisible: boolean
  panelMode: 'edit' | 'query'
  isAudioCapturing: boolean
  isTranscribing: boolean
  isGeneratingResponse: boolean
  hasApiKey: boolean
  whisperServerStatus: 'stopped' | 'starting' | 'running' | 'error'
  contentProtectionStatus: string
  activeTab: 'chat' | 'transcript' | 'notes'
}

export interface PerssuaAPI {
  // State
  getState: () => Promise<PerssuaState>
  onStateChange: (callback: (state: PerssuaState) => void) => () => void
  setAssistantActive: (active: boolean) => Promise<void>
  setPanelMode: (mode: 'edit' | 'query') => Promise<void>
  setActiveTab: (tab: 'chat' | 'transcript' | 'notes') => Promise<void>
  minimizeToTray: () => Promise<void>
  quitApp: () => Promise<void>

  // Window bounds / position
  updateBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>

  // Chat & AI
  sendChatMessage: (prompt: string, attachScreen?: boolean) => Promise<void>
  cancelChat: () => Promise<void>
  onChatChunk: (callback: (chunk: string) => void) => () => void
  onChatDone: (callback: (message: ChatMessage) => void) => () => void
  onChatError: (callback: (error: string) => void) => () => void
  onUserMessage: (callback: (message: ChatMessage) => void) => () => void
  copyToClipboard: (text: string) => Promise<boolean>

  // Quick actions
  captureScreenAndExplain: () => Promise<void>
  captureScreenAndAnalyzeBug: () => Promise<void>
  suggestAnswerToLastQuestion: () => Promise<void>
  summarizeConversation: () => Promise<void>

  // Notes & Settings
  getNotes: () => Promise<string>
  saveNotes: (notes: string) => Promise<void>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>
  saveApiKey: (key: string) => Promise<boolean>
  hasApiKey: () => Promise<boolean>
  getAvailableScreens: () => Promise<Array<{ id: string; name: string; isPrimary: boolean }>>
  getActiveShortcuts: () => Promise<Record<string, string>>
  getShortcutConflicts: () => Promise<string[]>

  // Transcription
  toggleTranscription: () => Promise<void>
  onTranscriptSegment: (callback: (segment: TranscriptSegment) => void) => () => void
  clearTranscript: () => Promise<void>

  // Audio Worker loopback bridge
  onAudioWorkerCommand: (callback: (cmd: { action: 'start' | 'stop' }) => void) => () => void
  sendAudioChunk: (chunk: ArrayBuffer, sampleRate: number) => Promise<void>
}

declare global {
  interface Window {
    perssua: PerssuaAPI
  }
}
