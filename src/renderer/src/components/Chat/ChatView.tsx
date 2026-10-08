import React, { useRef, useEffect, useState } from 'react'
import type { ChatMessage } from '@preload/index.d'
import { ChatInput } from './ChatInput'
import { Camera, Lightbulb, FileText, Copy, Check, Sparkles } from 'lucide-react'

interface ChatViewProps {
  messages: ChatMessage[]
  streamingChunk: string
  isGenerating: boolean
  onSendMessage: (text: string, attachScreen: boolean) => void
  onCancelGeneration: () => void
  onQuickAction: (action: 'explain-screen' | 'suggest-answer' | 'summarize') => void
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  streamingChunk,
  isGenerating,
  onSendMessage,
  onCancelGeneration,
  onQuickAction
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingChunk])

  const handleCopy = async (id: string, text: string): Promise<void> => {
    await window.perssua?.copyToClipboard(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Pílulas de Ações Rápidas */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-surface/50 border-b border-border/40 overflow-x-auto text-[11px] select-none">
        <button
          onClick={() => onQuickAction('explain-screen')}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-1 rounded bg-surfaceHover hover:bg-border text-slate-200 transition-colors shrink-0 disabled:opacity-50"
          title="Captura o monitor e explica o conteúdo visualmente (Ctrl+Alt+S)"
        >
          <Camera className="w-3 h-3 text-accent" />
          <span>Explicar Tela</span>
        </button>

        <button
          onClick={() => onQuickAction('suggest-answer')}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-1 rounded bg-surfaceHover hover:bg-border text-slate-200 transition-colors shrink-0 disabled:opacity-50"
          title="Sugere resposta curta e assertiva para a última pergunta feita (Ctrl+Alt+R)"
        >
          <Lightbulb className="w-3 h-3 text-warning" />
          <span>Sugerir Resposta</span>
        </button>

        <button
          onClick={() => onQuickAction('summarize')}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-1 rounded bg-surfaceHover hover:bg-border text-slate-200 transition-colors shrink-0 disabled:opacity-50"
          title="Resumo estruturado dos tópicos e decisões tomadas (Ctrl+Alt+M)"
        >
          <FileText className="w-3 h-3 text-emerald-400" />
          <span>Resumir</span>
        </button>
      </div>

      {/* Área de Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !streamingChunk && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted">
            <Sparkles className="w-8 h-8 text-accent/60 mb-2" />
            <p className="text-xs font-medium text-slate-300">Assistente Contextual Pronto</p>
            <p className="text-[11px] mt-1 max-w-[280px]">
              Faça uma pergunta livre, utilize as ações rápidas acima ou use os atalhos globais.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-lg p-2.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent/20 border border-accent/40 text-slate-100'
                  : 'bg-surface border border-border text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-4 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {msg.role === 'user' ? 'Você' : 'Perssua'}
                </span>

                {msg.role === 'assistant' && (
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="p-1 rounded text-muted hover:text-slate-100 transition-colors"
                    title="Copiar resposta (Ctrl+Shift+C)"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>

              <div className="whitespace-pre-wrap select-text font-normal">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {/* Streaming Ativo */}
        {streamingChunk && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] rounded-lg p-2.5 text-xs leading-relaxed bg-surface border border-accent/40 text-slate-200">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
                <Sparkles className="w-3 h-3 animate-spin" />
                <span>Perssua Gerando...</span>
              </div>
              <div className="whitespace-pre-wrap select-text font-normal">
                {streamingChunk}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        isGenerating={isGenerating}
        onSend={onSendMessage}
        onCancel={onCancelGeneration}
      />
    </div>
  )
}
