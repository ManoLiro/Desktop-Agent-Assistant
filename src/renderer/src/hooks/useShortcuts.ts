import { useEffect } from 'react'

interface UseShortcutsOptions {
  onSwitchTab: (tab: 'chat' | 'transcript' | 'notes') => void
  onCopyLastResponse: () => void
  onCancelOrExit: () => void
}

export function useShortcuts({
  onSwitchTab,
  onCopyLastResponse,
  onCancelOrExit
}: UseShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ctrl+1, Ctrl+2, Ctrl+3
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault()
          onSwitchTab('chat')
        } else if (e.key === '2') {
          e.preventDefault()
          onSwitchTab('transcript')
        } else if (e.key === '3') {
          e.preventDefault()
          onSwitchTab('notes')
        }
      }

      // Ctrl+Shift+C (copiar última resposta)
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault()
        onCopyLastResponse()
      }

      // Esc
      if (e.key === 'Escape') {
        onCancelOrExit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSwitchTab, onCopyLastResponse, onCancelOrExit])
}
