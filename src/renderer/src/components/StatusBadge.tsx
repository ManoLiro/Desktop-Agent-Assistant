import React from 'react'
import type { PerssuaState } from '@preload/index.d'
import { ShieldCheck, Mic, MicOff, Sparkles, Power } from 'lucide-react'

interface StatusBadgeProps {
  state: PerssuaState
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state }) => {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 bg-surface border-b border-border/50 text-muted overflow-x-auto select-none">
      {/* Estado do Assistente */}
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
          state.isAssistantActive
            ? 'bg-success/15 text-success border border-success/30'
            : 'bg-muted/10 text-muted border border-border/40'
        }`}
        title={state.isAssistantActive ? 'Assistente ativo (captura e IA operando)' : 'Assistente desativado'}
      >
        <Power className="w-3 h-3" />
        <span>{state.isAssistantActive ? 'Ativo' : 'Desativado'}</span>
      </div>

      {/* Áudio do Sistema */}
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
          state.isAudioCapturing
            ? 'bg-accent/15 text-accent border border-accent/30'
            : 'bg-muted/10 text-muted border border-border/40'
        }`}
        title="Captura do áudio reproduzido pelo computador (loopback)"
      >
        {state.isAudioCapturing ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
            <Mic className="w-3 h-3" />
            <span>Áudio On</span>
          </>
        ) : (
          <>
            <MicOff className="w-3 h-3" />
            <span>Áudio Pausado</span>
          </>
        )}
      </div>

      {/* IA Gerando */}
      {state.isGeneratingResponse && (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
          <Sparkles className="w-3 h-3 animate-spin" />
          <span>IA Gerando...</span>
        </div>
      )}

      {/* Proteção de Captura */}
      <div
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surfaceHover text-slate-300 ml-auto border border-border/50"
        title="Janela configurada com afinidade para exclusão de captura no Windows (WDA_EXCLUDEFROMCAPTURE)"
      >
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span className="truncate max-w-[170px]">{state.contentProtectionStatus}</span>
      </div>
    </div>
  )
}
