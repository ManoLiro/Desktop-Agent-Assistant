import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Cloud } from 'lucide-react'

interface NotesViewProps {
  includeInContext: boolean
  onToggleIncludeInContext: (include: boolean) => void
}

export const NotesView: React.FC<NotesViewProps> = ({
  includeInContext,
  onToggleIncludeInContext
}) => {
  const [content, setContent] = useState('')
  const [isSaved, setIsSaved] = useState(true)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    window.perssua?.getNotes().then((saved) => {
      setContent(saved)
    })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const val = e.target.value
    setContent(val)
    setIsSaved(false)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Auto-save debounced em 600ms
    saveTimeoutRef.current = setTimeout(async () => {
      await window.perssua?.saveNotes(val)
      setIsSaved(true)
    }, 600)
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Barra de Ferramentas de Notas */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface/60 border-b border-border/50 text-xs select-none">
        <label className="flex items-center gap-2 cursor-pointer text-slate-200">
          <input
            type="checkbox"
            checked={includeInContext}
            onChange={(e) => onToggleIncludeInContext(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-surface border-border text-accent focus:ring-0 cursor-pointer"
          />
          <span className="text-[11px] font-medium">Incluir notas no contexto da IA</span>
        </label>

        <div className="flex items-center gap-1 text-[10px] text-muted">
          {isSaved ? (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="w-3 h-3" />
              <span>Salvo</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted">
              <Cloud className="w-3 h-3 animate-pulse" />
              <span>Salvando...</span>
            </span>
          )}
        </div>
      </div>

      {/* Editor Textarea */}
      <div className="flex-1 p-3 flex flex-col">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Escreva aqui seu roteiro de entrevista, dúvidas prioritárias ou tópicos de aula..."
          className="flex-1 w-full bg-surface text-slate-100 text-xs font-mono p-3 rounded-lg border border-border/70 focus:border-accent focus:outline-none resize-none leading-relaxed placeholder:text-muted/60"
        />
      </div>
    </div>
  )
}
