import React from 'react'
import type { PerssuaState } from '@preload/index.d'
import { Minus, X, Eye, Edit3, Power } from 'lucide-react'

interface TitleBarProps {
  state: PerssuaState
  onToggleAssistant: () => void
  onToggleMode: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({
  state,
  onToggleAssistant,
  onToggleMode
}) => {
  const handleMinimize = (): void => {
    window.perssua?.minimizeToTray()
  }

  return (
    <header className="drag-region flex items-center justify-between px-3 py-2 bg-surface border-b border-border select-none h-10">
      {/* Logo e Título */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-accent" />
        <span className="font-semibold text-xs tracking-wide text-slate-100">Perssua</span>
        <span className="text-[10px] px-1 py-0.2 rounded bg-surfaceHover text-muted font-mono">MVP</span>
      </div>

      {/* Ações Centrais */}
      <div className="no-drag flex items-center gap-2">
        {/* Ativar/Desativar Assistente Master */}
        <button
          onClick={onToggleAssistant}
          title={state.isAssistantActive ? 'Desativar Assistente (Ctrl+Alt+Space)' : 'Ativar Assistente (Ctrl+Alt+Space)'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            state.isAssistantActive
              ? 'bg-success/20 text-success hover:bg-success/30 border border-success/40'
              : 'bg-surfaceHover text-muted hover:text-slate-200 border border-border'
          }`}
        >
          <Power className="w-3 h-3" />
          <span>{state.isAssistantActive ? 'Ligado' : 'Desligado'}</span>
        </button>

        {/* Modo Consulta / Edição */}
        <button
          onClick={onToggleMode}
          title={
            state.panelMode === 'edit'
              ? 'Modo Edição (Foco ativo). Clique para Modo Consulta (sem foco/passivo)'
              : 'Modo Consulta (Passivo). Clique para Modo Edição'
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            state.panelMode === 'edit'
              ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/40'
              : 'bg-surfaceHover text-muted hover:text-slate-200 border border-border'
          }`}
        >
          {state.panelMode === 'edit' ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span>{state.panelMode === 'edit' ? 'Edição' : 'Consulta'}</span>
        </button>
      </div>

      {/* Controles de Janela */}
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="p-1 rounded text-muted hover:text-slate-100 hover:bg-surfaceHover transition-colors"
          title="Minimizar para bandeja"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMinimize}
          className="p-1 rounded text-muted hover:text-danger hover:bg-danger/20 transition-colors"
          title="Ocultar para bandeja"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  )
}
