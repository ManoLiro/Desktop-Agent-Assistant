import React, { useState, useEffect } from 'react'
import type { AppSettings } from '@preload/index.d'
import { X, Key, Shield, Cpu, Sparkles, Sliders, Check } from 'lucide-react'

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
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keySavedStatus, setKeySavedStatus] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'whisper' | 'shortcuts'>('general')

  useEffect(() => {
    if (isOpen) {
      window.perssua?.getSettings().then((s) => setSettings(s))
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
                  value={settings.geminiModel}
                  onChange={(e) => handleUpdateSetting('geminiModel', e.target.value)}
                  className="w-full bg-background border border-border text-slate-200 rounded px-2.5 py-1.5 focus:border-accent focus:outline-none"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Mais rápido, multimodal e recomendado)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Raciocínio complexo)</option>
                </select>
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
            <div className="space-y-2">
              <p className="text-[11px] text-muted">
                Atalhos globais configurados no sistema operacional (disponíveis mesmo em outros apps):
              </p>
              <div className="space-y-1 divide-y divide-border/40 font-mono text-[11px]">
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Ativar/desativar assistente</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+Space</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Mostrar/ocultar painel</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+O</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Abrir chat em modo edição</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+Enter</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Capturar monitor e explicar</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+S</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Sugerir resposta à pergunta</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+R</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Resumir conversa e ações</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+M</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Iniciar/pausar áudio</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+T</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Abrir notas para edição</span>
                  <span className="text-accent bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+N</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted font-sans">Interromper tudo e ocultar</span>
                  <span className="text-danger bg-surface px-1.5 py-0.5 rounded border border-border">Ctrl+Alt+Backspace</span>
                </div>
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
