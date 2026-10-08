import React, { useState, useRef, useEffect } from 'react'
import { Send, Camera, Square } from 'lucide-react'

interface ChatInputProps {
  isGenerating: boolean
  onSend: (text: string, attachScreen: boolean) => void
  onCancel: () => void
}

export const ChatInput: React.FC<ChatInputProps> = ({
  isGenerating,
  onSend,
  onCancel
}) => {
  const [text, setText] = useState('')
  const [attachScreen, setAttachScreen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Foca automaticamente ao montar
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (): void => {
    if (isGenerating) {
      onCancel()
      return
    }

    const trimmed = text.trim()
    if (!trimmed) return

    onSend(trimmed, attachScreen)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape' && isGenerating) {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="p-2.5 bg-surface border-t border-border flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte à IA (Enter envia, Shift+Enter pula linha)..."
          rows={2}
          className="flex-1 bg-background text-slate-100 text-xs rounded-lg px-2.5 py-1.5 border border-border/70 focus:border-accent focus:outline-none resize-none placeholder:text-muted/70"
        />

        <div className="flex flex-col gap-1 justify-center">
          {/* Anexar Tela Atual */}
          <button
            onClick={() => setAttachScreen(!attachScreen)}
            title={attachScreen ? 'Tela atual anexada' : 'Anexar captura da tela atual'}
            className={`p-1.5 rounded transition-colors text-xs flex items-center justify-center ${
              attachScreen
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surfaceHover text-muted hover:text-slate-200 border border-border'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          {/* Botão Enviar / Cancelar */}
          {isGenerating ? (
            <button
              onClick={onCancel}
              title="Cancelar geração (Esc)"
              className="p-1.5 rounded bg-danger/20 text-danger hover:bg-danger/30 border border-danger/40 transition-colors flex items-center justify-center"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              title="Enviar pergunta (Enter)"
              className="p-1.5 rounded bg-accent text-background font-medium hover:bg-accentHover disabled:opacity-40 disabled:hover:bg-accent transition-colors flex items-center justify-center"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted select-none">
        <span className="flex items-center gap-1">
          {attachScreen && <span className="text-accent font-medium">● Captura de tela ativada</span>}
        </span>
        <span>Enter envia • Esc cancela</span>
      </div>
    </div>
  )
}
