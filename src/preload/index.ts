import { contextBridge, ipcRenderer } from 'electron'
import type { PerssuaAPI, PerssuaState, AppSettings, TranscriptSegment, ChatMessage } from './index.d'

const api: PerssuaAPI = {
  getState: () => ipcRenderer.invoke('perssua:get-state'),
  onStateChange: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, state: PerssuaState): void => callback(state)
    ipcRenderer.on('perssua:state-changed', handler)
    return () => ipcRenderer.removeListener('perssua:state-changed', handler)
  },
  setAssistantActive: (active: boolean) => ipcRenderer.invoke('perssua:set-assistant-active', active),
  setPanelMode: (mode: 'edit' | 'query') => ipcRenderer.invoke('perssua:set-panel-mode', mode),
  setActiveTab: (tab: 'chat' | 'transcript' | 'notes') => ipcRenderer.invoke('perssua:set-active-tab', tab),
  minimizeToTray: () => ipcRenderer.invoke('perssua:minimize-to-tray'),
  quitApp: () => ipcRenderer.invoke('perssua:quit-app'),

  updateBounds: (bounds) => ipcRenderer.invoke('perssua:update-bounds', bounds),

  sendChatMessage: (prompt: string, attachScreen = false) =>
    ipcRenderer.invoke('perssua:send-chat', { prompt, attachScreen }),
  cancelChat: () => ipcRenderer.invoke('perssua:cancel-chat'),
  onChatChunk: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string): void => callback(chunk)
    ipcRenderer.on('perssua:chat-chunk', handler)
    return () => ipcRenderer.removeListener('perssua:chat-chunk', handler)
  },
  onChatDone: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, message: ChatMessage): void => callback(message)
    ipcRenderer.on('perssua:chat-done', handler)
    return () => ipcRenderer.removeListener('perssua:chat-done', handler)
  },
  onChatError: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, error: string): void => callback(error)
    ipcRenderer.on('perssua:chat-error', handler)
    return () => ipcRenderer.removeListener('perssua:chat-error', handler)
  },
  copyToClipboard: (text: string) => ipcRenderer.invoke('perssua:copy-clipboard', text),

  captureScreenAndExplain: () => ipcRenderer.invoke('perssua:capture-screen-and-explain'),
  suggestAnswerToLastQuestion: () => ipcRenderer.invoke('perssua:suggest-answer-last-question'),
  summarizeConversation: () => ipcRenderer.invoke('perssua:summarize-conversation'),

  getNotes: () => ipcRenderer.invoke('perssua:get-notes'),
  saveNotes: (notes: string) => ipcRenderer.invoke('perssua:save-notes', notes),
  getSettings: () => ipcRenderer.invoke('perssua:get-settings'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('perssua:save-settings', settings),
  saveApiKey: (key: string) => ipcRenderer.invoke('perssua:save-api-key', key),
  hasApiKey: () => ipcRenderer.invoke('perssua:has-api-key'),

  toggleTranscription: () => ipcRenderer.invoke('perssua:toggle-transcription'),
  onTranscriptSegment: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, segment: TranscriptSegment): void => callback(segment)
    ipcRenderer.on('perssua:transcript-segment', handler)
    return () => ipcRenderer.removeListener('perssua:transcript-segment', handler)
  },
  clearTranscript: () => ipcRenderer.invoke('perssua:clear-transcript'),

  onAudioWorkerCommand: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, cmd: { action: 'start' | 'stop' }): void => callback(cmd)
    ipcRenderer.on('perssua:audio-worker-command', handler)
    return () => ipcRenderer.removeListener('perssua:audio-worker-command', handler)
  },
  sendAudioChunk: (chunk: ArrayBuffer, sampleRate: number) =>
    ipcRenderer.invoke('perssua:audio-worker-chunk', { chunk, sampleRate })
}

contextBridge.exposeInMainWorld('perssua', api)
