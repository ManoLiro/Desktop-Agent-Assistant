import React from 'react'
import { MessageSquare, Mic, FileText, Settings } from 'lucide-react'

interface TabsNavProps {
  activeTab: 'chat' | 'transcript' | 'notes'
  onSelectTab: (tab: 'chat' | 'transcript' | 'notes') => void
  onOpenSettings: () => void
}

export const TabsNav: React.FC<TabsNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenSettings
}) => {
  return (
    <nav className="flex items-center justify-between px-3 py-1.5 bg-surface/80 border-b border-border select-none text-xs">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSelectTab('chat')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
            activeTab === 'chat'
              ? 'bg-accent/20 text-accent font-semibold border border-accent/40'
              : 'text-muted hover:text-slate-200 hover:bg-surfaceHover'
          }`}
          title="Chat com IA (Ctrl+1)"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => onSelectTab('transcript')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
            activeTab === 'transcript'
              ? 'bg-accent/20 text-accent font-semibold border border-accent/40'
              : 'text-muted hover:text-slate-200 hover:bg-surfaceHover'
          }`}
          title="Transcrição ao vivo (Ctrl+2)"
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Transcrição</span>
        </button>

        <button
          onClick={() => onSelectTab('notes')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
            activeTab === 'notes'
              ? 'bg-accent/20 text-accent font-semibold border border-accent/40'
              : 'text-muted hover:text-slate-200 hover:bg-surfaceHover'
          }`}
          title="Notas e Roteiro (Ctrl+3)"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Notas</span>
        </button>
      </div>

      <button
        onClick={onOpenSettings}
        className="p-1 rounded text-muted hover:text-slate-200 hover:bg-surfaceHover transition-colors"
        title="Configurações do Perssua"
      >
        <Settings className="w-4 h-4" />
      </button>
    </nav>
  )
}
