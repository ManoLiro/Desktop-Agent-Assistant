import React, { useState, useEffect, useCallback } from 'react'
import type { PerssuaState, ChatMessage, TranscriptSegment } from '@preload/index.d'
import { TitleBar } from './components/TitleBar'
import { StatusBadge } from './components/StatusBadge'
import { TabsNav } from './components/TabsNav'
import { ChatView } from './components/Chat/ChatView'
import { TranscriptView } from './components/Transcript/TranscriptView'
import { NotesView } from './components/Notes/NotesView'
import { SettingsModal } from './components/Settings/SettingsModal'
import { useShortcuts } from './hooks/useShortcuts'

export const App: React.FC = () => {
  const [state, setState] = useState<PerssuaState>({
    isAssistantActive: false,
    isPanelVisible: true,
    panelMode: 'edit',
    isAudioCapturing: false,
    isTranscribing: false,
    isGeneratingResponse: false,
    hasApiKey: false,
    whisperServerStatus: 'stopped',
    contentProtectionStatus: 'Proteção ativada; compatibilidade não verificada',
    activeTab: 'chat'
  })

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingChunk, setStreamingChunk] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [includeNotesInContext, setIncludeNotesInContext] = useState(true)

  // Carrega estado e configurações iniciais
  useEffect(() => {
    if (window.perssua) {
      window.perssua.getState().then(setState)
      window.perssua.getSettings().then((s) => {
        setIncludeNotesInContext(s.includeNotesInContext)
      })

      const unsubState = window.perssua.onStateChange((newState) => {
        setState(newState)
      })

      const unsubChunk = window.perssua.onChatChunk((chunk) => {
        setStreamingChunk((prev) => prev + chunk)
      })

      const unsubDone = window.perssua.onChatDone((message) => {
        setStreamingChunk('')
        setMessages((prev) => {
          // Substitui se já houver mensagem com mesmo id ou adiciona
          const filtered = prev.filter((m) => m.id !== message.id)
          return [...filtered, message]
        })
      })

      const unsubError = window.perssua.onChatError((error) => {
        setStreamingChunk('')
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${error}`,
          timestamp: Date.now(),
          error: true
        }
        setMessages((prev) => [...prev, errorMsg])
      })

      const unsubTranscript = window.perssua.onTranscriptSegment((seg) => {
        setSegments((prev) => [...prev, seg])
      })

      return () => {
        unsubState()
        unsubChunk()
        unsubDone()
        unsubError()
        unsubTranscript()
      }
    }
    return undefined
  }, [])

  const handleToggleAssistant = (): void => {
    window.perssua?.setAssistantActive(!state.isAssistantActive)
  }

  const handleToggleMode = (): void => {
    const nextMode = state.panelMode === 'edit' ? 'query' : 'edit'
    window.perssua?.setPanelMode(nextMode)
  }

  const handleSelectTab = (tab: 'chat' | 'transcript' | 'notes'): void => {
    window.perssua?.setActiveTab(tab)
  }

  const handleSendMessage = (text: string, attachScreen: boolean): void => {
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      hasScreenContext: attachScreen
    }
    setMessages((prev) => [...prev, userMsg])
    setStreamingChunk('')
    window.perssua?.sendChatMessage(text, attachScreen)
  }

  const handleCancelGeneration = (): void => {
    window.perssua?.cancelChat()
    setStreamingChunk('')
  }

  const handleQuickAction = (
    action: 'explain-screen' | 'analyze-bug' | 'suggest-answer' | 'summarize'
  ): void => {
    if (action === 'explain-screen') {
      window.perssua?.captureScreenAndExplain()
    } else if (action === 'analyze-bug') {
      window.perssua?.captureScreenAndAnalyzeBug()
    } else if (action === 'suggest-answer') {
      window.perssua?.suggestAnswerToLastQuestion()
    } else if (action === 'summarize') {
      window.perssua?.summarizeConversation()
    }
  }

  const handleToggleIncludeNotes = async (include: boolean): Promise<void> => {
    setIncludeNotesInContext(include)
    await window.perssua?.saveSettings({ includeNotesInContext: include })
  }

  const handleCopyLastResponse = useCallback((): void => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant) {
      window.perssua?.copyToClipboard(lastAssistant.content)
    }
  }, [messages])

  const handleCancelOrExit = useCallback((): void => {
    if (state.isGeneratingResponse) {
      handleCancelGeneration()
    } else {
      // Alterna modo de edição para consulta
      window.perssua?.setPanelMode('query')
    }
  }, [state.isGeneratingResponse])

  // Atalhos de teclado no painel
  useShortcuts({
    onSwitchTab: handleSelectTab,
    onCopyLastResponse: handleCopyLastResponse,
    onCancelOrExit: handleCancelOrExit
  })

  return (
    <div className="flex flex-col h-full w-full bg-background select-none overflow-hidden">
      {/* Barra de Título (arrastável) */}
      <TitleBar
        state={state}
        onToggleAssistant={handleToggleAssistant}
        onToggleMode={handleToggleMode}
      />

      {/* Badges de Estado */}
      <StatusBadge state={state} />

      {/* Navegação por Abas */}
      <TabsNav
        activeTab={state.activeTab}
        onSelectTab={handleSelectTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Conteúdo Principal de cada Aba */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {state.activeTab === 'chat' && (
          <ChatView
            messages={messages}
            streamingChunk={streamingChunk}
            isGenerating={state.isGeneratingResponse}
            hasApiKey={state.hasApiKey}
            onSendMessage={handleSendMessage}
            onCancelGeneration={handleCancelGeneration}
            onQuickAction={handleQuickAction}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {state.activeTab === 'transcript' && (
          <TranscriptView
            segments={segments}
            state={state}
            onToggleTranscription={() => window.perssua?.toggleTranscription()}
            onClearTranscript={() => {
              window.perssua?.clearTranscript()
              setSegments([])
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {state.activeTab === 'notes' && (
          <NotesView
            includeInContext={includeNotesInContext}
            onToggleIncludeInContext={handleToggleIncludeNotes}
          />
        )}
      </main>

      {/* Modal de Configurações */}
      <SettingsModal
        isOpen={isSettingsOpen}
        hasApiKey={state.hasApiKey}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={() => {
          window.perssua?.getState().then(setState)
        }}
      />
    </div>
  )
}
