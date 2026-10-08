import React, { useRef, useEffect } from 'react'
import type { TranscriptSegment, PerssuaState } from '@preload/index.d'
import { Mic, MicOff, Trash2, Cpu, AlertTriangle } from 'lucide-react'

interface TranscriptViewProps {
  segments: TranscriptSegment[]
  state: PerssuaState
  onToggleTranscription: () => void
  onClearTranscript: () => void
  onOpenSettings: () => void
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  segments,
  state,
  onToggleTranscription,
  onClearTranscript,
  onOpenSettings
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [segments])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Barra de Controle de Transcrição */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface/60 border-b border-border/50 text-xs select-none">
        <div className="flex items-center gap-2">
          {/* Status whisper.cpp */}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border ${
              state.whisperServerStatus === 'running'
                ? 'bg-success/15 text-success border-success/30'
                : state.whisperServerStatus === 'starting'
                ? 'bg-warning/15 text-warning border-warning/30'
                : 'bg-muted/10 text-muted border-border/40'
            }`}
            title="Status do processo whisper-server local"
          >
            <Cpu className="w-3 h-3" />
            <span>whisper: {state.whisperServerStatus}</span>
          </div>

          {/* Botão Iniciar/Pausar Áudio */}
          <button
            onClick={onToggleTranscription}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              state.isAudioCapturing
                ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/40'
                : 'bg-surfaceHover text-slate-300 hover:text-white border border-border'
            }`}
            title="Iniciar ou pausar captura do áudio do computador (Ctrl+Alt+T)"
          >
            {state.isAudioCapturing ? (
              <>
                <Mic className="w-3 h-3" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <MicOff className="w-3 h-3" />
                <span>Iniciar Áudio</span>
              </>
            )}
          </button>
        </div>

        {/* Limpar */}
        <button
          onClick={onClearTranscript}
          disabled={segments.length === 0}
          className="p-1 rounded text-muted hover:text-danger hover:bg-danger/20 transition-colors disabled:opacity-40"
          title="Limpar transcrição"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Alerta de Configuração de Whisper */}
      {state.whisperServerStatus === 'stopped' && (
        <div className="m-3 p-2.5 rounded-lg bg-surface border border-warning/30 text-warning text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-[11px]">whisper.cpp não configurado</p>
            <p className="text-[10px] text-muted mt-0.5">
              Para transcrição local, informe o caminho do binário <code className="text-slate-300">whisper-server.exe</code> e modelo <code className="text-slate-300">ggml-*.bin</code> nas configurações.
            </p>
            <button
              onClick={onOpenSettings}
              className="mt-1.5 px-2 py-0.5 rounded bg-warning/20 hover:bg-warning/30 text-[10px] font-medium text-warning border border-warning/40 transition-colors"
            >
              Abrir Configurações
            </button>
          </div>
        </div>
      )}

      {/* Lista de Segmentos */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 select-text font-mono text-xs">
        {segments.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted select-none">
            <Mic className="w-8 h-8 text-muted/50 mb-2" />
            <p className="text-xs text-slate-300">Aguardando Áudio do Sistema</p>
            <p className="text-[11px] mt-1 max-w-[280px]">
              O áudio reproduzido por reuniões, vídeos ou chamadas aparecerá aqui em tempo real.
            </p>
          </div>
        )}

        {segments.map((seg) => (
          <div key={seg.id} className="p-2 rounded bg-surface border border-border/60">
            <div className="flex items-center justify-between text-[10px] text-muted mb-1 select-none font-sans">
              <span className="font-semibold text-accent/80">{seg.source}</span>
              <span>{new Date(seg.timestamp).toLocaleTimeString()}</span>
            </div>
            <p className="text-slate-200 leading-relaxed text-xs">{seg.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
