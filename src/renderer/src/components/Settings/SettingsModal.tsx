import React, { useState, useEffect } from 'react'
import type { AppSettings } from '@preload/index.d'
import { X, Key, Shield, Cpu, Sparkles, Sliders, Check, Monitor } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  hasApiKey: boolean
  onClose: () => void
  onSettingsSaved: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  hasApiKey,
  onClose,
  onSettingsSaved
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [availableScreens, setAvailableScreens] = useState<Array<{ id: string; name: string; isPrimary: boolean }>>([])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keySavedStatus, setKeySavedStatus] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'whisper' | 'shortcuts'>('general')
  const [activeShortcuts, setActiveShortcuts] = useState<Record<string, string>>({})
  const [shortcutConflicts, setShortcutConflicts] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) {
      window.perssua?.getSettings().then((s) => setSettings(s))
      window.perssua?.getAvailableScreens().then((screens) => setAvailableScreens(screens || []))
      window.perssua?.getActiveShortcuts().then((act) => setActiveShortcuts(act || {}))
      window.perssua?.getShortcutConflicts().then((conf) => setShortcutConflicts(conf || []))
      setApiKeyInput('')
      setKeySavedStatus(null)
    }
  }, [isOpen])

  if (!isOpen || !settings) return null

  const handleSaveApiKey = async (): Promise<void> => {
    if (!apiKeyInput.trim()) return
    const ok = await window.perssua?.saveApiKey(apiKeyInput.trim())
    if (ok) {
      setApiKeyInput('') // Limpa campo imediatamente após salvar
      setKeySavedStatus('Chave salva com sucesso com criptografia segura!')
      onSettingsSaved()
      setTimeout(() => setKeySavedStatus(null), 3000)
    } else {
      setKeySavedStatus('Erro ao salvar chave.')
    }
  }

  const handleUpdateSetting = async (key: keyof AppSettings, val: any): Promise<void> => {
    const updated = { ...settings, [key]: val }
    setSettings(updated)
    await window.perssua?.saveSettings({ [key]: val })
    onSettingsSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent" />
            <h2 className="text-xs font-semibold text-slate-100">Configurações do Perssua</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-slate-100 hover:bg-surfaceHover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas das configurações */}
        <div className="flex border-b border-border/70 text-xs px-3 bg-surface/50">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors ${
              activeTab === 'general'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-slate-200'
            }`}
          >
            Geral & IA
          </button>
          <button
            onClick={() => setActiveTab('whisper')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors ${
              activeTab === 'whisper'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-slate-200'
            }`}
          >
            whisper.cpp
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors ${
              activeTab === 'shortcuts'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-slate-200'
            }`}
          >
            Atalhos
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'general' && (
            <>
              {/* API Key do Gemini */}
              <div className="space-y-1.5 p-3 rounded-lg bg-background border border-border/70">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-accent" />
                    <span>API Key do Google Gemini</span>
                  </label>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      hasApiKey
                        ? 'bg-success/20 text-success border border-success/30'
                        : 'bg-danger/20 text-danger border border-danger/30'
                    }`}
                  >
                    {hasApiKey ? 'Configurada (Segura)' : 'Não Configurada'}
                  </span>
                </div>

                <p className="text-[11px] text-muted leading-tight">
                  A chave é armazenada com criptografia de sistema (safeStorage). O campo é limpo após o salvamento.
                </p>

                <div className="flex gap-2 pt-1">
                  <input
                    type="password"
                    placeholder={hasApiKey ? '•••••••••••••••••••••••• (Substituir)' : 'Cole sua API Key do Gemini...'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="flex-1 bg-surface border border-border text-slate-100 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleSaveApiKey}
                    disabled={!apiKeyInput.trim()}
                    className="px-3 py-1.5 rounded bg-accent text-background font-medium hover:bg-accentHover disabled:opacity-40 transition-colors"
                  >
                    Salvar
                  </button>
                </div>

                {keySavedStatus && (
                  <p className="text-[11px] text-success flex items-center gap-1 pt-1">
                    <Check className="w-3 h-3" />
                    <span>{keySavedStatus}</span>
                  </p>
                )}
              </div>

              {/* Modelo Gemini */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Modelo Gemini</span>
                </label>
                <select
                  value={settings.geminiModel === 'gemini-3.8-flash' ? 'models/gemini-3.8-flash' : settings.geminiModel}
                  onChange={(e) => handleUpdateSetting('geminiModel', e.target.value)}
                  className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none"
                >
                  <option value="models/gemini-3.8-flash">models/gemini-3.8-flash (Recomendado - Interactions API)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Raciocínio complexo)</option>
                </select>
              </div>

              {/* Monitor para Captura */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-accent" />
                  <span>Monitor para Captura de Tela</span>
                </label>
                <select
                  value={settings.selectedMonitorId}
                  onChange={(e) => handleUpdateSetting('selectedMonitorId', e.target.value)}
                  className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none"
                >
                  <option value="">Automático (Monitor Principal)</option>
                  {availableScreens.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name} {sc.isPrimary ? '(Principal)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted leading-tight">
                  Selecione qual tela o Perssua deve ler ao usar &quot;Explicar Tela&quot; ou &quot;Analisar Bug&quot;.
                </p>
              </div>

              {/* Idioma de resposta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-200">Idioma das Respostas</label>
                  <select
                    value={settings.responseLanguage}
                    onChange={(e) => handleUpdateSetting('responseLanguage', e.target.value)}
                    className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none"
                  >
                    <option value="pt-BR">Português (pt-BR)</option>
                    <option value="en">Inglês (en)</option>
                    <option value="es">Espanhol (es)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-200">Idioma da Transcrição</label>
                  <select
                    value={settings.transcriptionLanguage}
                    onChange={(e) => handleUpdateSetting('transcriptionLanguage', e.target.value)}
                    className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none"
                  >
                    <option value="pt">Português (pt)</option>
                    <option value="en">Inglês (en)</option>
                    <option value="auto">Automático</option>
                  </select>
                </div>
              </div>

              {/* Assistência Automática */}
              <div className="space-y-2 p-3 rounded-lg bg-background border border-border/70">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={settings.autoAssistEnabled}
                    onChange={(e) => handleUpdateSetting('autoAssistEnabled', e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-surface border-border text-accent focus:ring-0 cursor-pointer"
                  />
                  <span>Assistência Automática Periódica</span>
                </label>
                <p className="text-[11px] text-muted">
                  Atualiza automaticamente tópicos da reunião a cada intervalo se houver nova fala transcrita.
                </p>
                {settings.autoAssistEnabled && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-300">Intervalo (segundos):</span>
                    <input
                      type="number"
                      min={10}
                      max={180}
                      value={settings.autoAssistIntervalSeconds}
                      onChange={(e) => handleUpdateSetting('autoAssistIntervalSeconds', Number(e.target.value))}
                      className="w-20 bg-surface border border-border text-slate-100 rounded px-2 py-1 text-xs"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'whisper' && (
            <div className="space-y-3">
              <div className="p-2.5 rounded bg-surface/50 border border-border/70 text-[11px] text-muted space-y-1">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-accent" />
                  <span>Transcrição Local com whisper.cpp</span>
                </p>
                <p>
                  O Perssua roda o <code className="text-slate-300">whisper-server.exe</code> como processo filho local na máquina.
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-200">Caminho do whisper-server.exe</label>
                <input
                  type="text"
                  placeholder="Ex: C:\whisper.cpp\build\bin\Release\whisper-server.exe"
                  value={settings.whisperBinaryPath}
                  onChange={(e) => handleUpdateSetting('whisperBinaryPath', e.target.value)}
                  className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-200">Caminho do Modelo ggml-*.bin</label>
                <input
                  type="text"
                  placeholder="Ex: C:\whisper.cpp\models\ggml-base.bin"
                  value={settings.whisperModelPath}
                  onChange={(e) => handleUpdateSetting('whisperModelPath', e.target.value)}
                  className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none font-mono text-[11px]"
                />
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted">
                  Atalhos globais do sistema. Clique para editar caso algum colida com outros apps:
                </p>
                <button
                  onClick={async () => {
                    const defaults: Record<string, string> = {
                      toggleAssistant: 'CommandOrControl+Alt+Space',
                      togglePanel: 'CommandOrControl+Alt+O',
                      focusChat: 'CommandOrControl+Alt+Return',
                      captureScreen: 'CommandOrControl+Alt+S',
                      suggestAnswer: 'CommandOrControl+Alt+R',
                      summarize: 'CommandOrControl+Alt+M',
                      toggleTranscription: 'CommandOrControl+Alt+T',
                      openNotes: 'CommandOrControl+Alt+N',
                      panicStop: 'CommandOrControl+Alt+Backspace'
                    }
                    await handleUpdateSetting('shortcuts', defaults)
                    const act = await window.perssua?.getActiveShortcuts()
                    if (act) setActiveShortcuts(act)
                    const conf = await window.perssua?.getShortcutConflicts()
                    if (conf) setShortcutConflicts(conf)
                  }}
                  className="text-[10px] text-accent hover:underline"
                >
                  Restaurar Padrões
                </button>
              </div>

              {shortcutConflicts.length > 0 && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 space-y-0.5">
                  <p className="font-semibold">⚠️ Conflito com outro aplicativo no Windows:</p>
                  <p className="text-[10px] text-amber-200/80">
                    O Windows já tinha alguns atalhos ocupados. O Perssua registrou automaticamente alternativas de fallback:
                  </p>
                  <ul className="list-disc list-inside text-[10px] font-mono text-amber-300/90 pt-0.5">
                    {shortcutConflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {[
                  { key: 'toggleAssistant', label: 'Ativar / Desativar assistente' },
                  { key: 'togglePanel', label: 'Mostrar / Ocultar painel' },
                  { key: 'focusChat', label: 'Abrir chat em modo edição' },
                  { key: 'captureScreen', label: 'Capturar monitor e explicar' },
                  { key: 'suggestAnswer', label: 'Sugerir resposta à pergunta' },
                  { key: 'summarize', label: 'Resumir conversa e ações' },
                  { key: 'toggleTranscription', label: 'Iniciar / pausar áudio' },
                  { key: 'openNotes', label: 'Abrir notas para edição' },
                  { key: 'panicStop', label: 'Interromper tudo e ocultar' }
                ].map(({ key, label }) => {
                  const isFallback =
                    activeShortcuts[key] &&
                    settings.shortcuts?.[key] &&
                    activeShortcuts[key] !== settings.shortcuts[key]

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 p-1.5 rounded bg-background border border-border/70 text-xs"
                    >
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-muted font-sans text-[11px] truncate">{label}</span>
                        {isFallback && (
                          <span className="text-[9px] text-amber-300 font-mono">
                            ⚡ Ativo no SO: {activeShortcuts[key]}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={settings.shortcuts?.[key] || ''}
                        onChange={async (e) => {
                          const updated = {
                            ...(settings.shortcuts || {}),
                            [key]: e.target.value
                          }
                          await handleUpdateSetting('shortcuts', updated)
                          const act = await window.perssua?.getActiveShortcuts()
                          if (act) setActiveShortcuts(act)
                          const conf = await window.perssua?.getShortcutConflicts()
                          if (conf) setShortcutConflicts(conf)
                        }}
                        className="bg-surface border border-border text-accent font-mono text-[11px] px-2 py-0.5 rounded w-48 text-right focus:border-accent focus:outline-none"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-surfaceHover hover:bg-border text-slate-200 transition-colors text-xs font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
