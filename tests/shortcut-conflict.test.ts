import { describe, it, expect } from 'vitest'

interface ShortcutRegistry {
  registered: Map<string, string> // accelerator -> action
  conflicts: string[]
}

function registerShortcuts(
  map: Record<string, string>,
  mockConflictChecker: (acc: string) => boolean
): ShortcutRegistry {
  const registered = new Map<string, string>()
  const conflicts: string[] = []

  for (const [action, accelerator] of Object.entries(map)) {
    if (!accelerator) continue
    if (mockConflictChecker(accelerator) || registered.has(accelerator)) {
      conflicts.push(accelerator)
    } else {
      registered.set(accelerator, action)
    }
  }

  return { registered, conflicts }
}

describe('Gerenciamento de Atalhos e Conflitos', () => {
  const defaultShortcuts = {
    toggleAssistant: 'Ctrl+Alt+Space',
    togglePanel: 'Ctrl+Alt+O',
    focusChat: 'Ctrl+Alt+Enter',
    captureScreen: 'Ctrl+Alt+S',
    suggestAnswer: 'Ctrl+Alt+R',
    summarize: 'Ctrl+Alt+M',
    toggleTranscription: 'Ctrl+Alt+T',
    openNotes: 'Ctrl+Alt+N',
    panicStop: 'Ctrl+Alt+Backspace'
  }

  it('registra todos os 9 atalhos padrão quando não há conflitos', () => {
    const result = registerShortcuts(defaultShortcuts, () => false)
    expect(result.conflicts).toHaveLength(0)
    expect(result.registered.size).toBe(9)
    expect(result.registered.get('Ctrl+Alt+O')).toBe('togglePanel')
  })

  it('detecta conflitos e duplicatas entre atalhos', () => {
    const conflictingShortcuts = {
      ...defaultShortcuts,
      focusChat: 'Ctrl+Alt+O' // Duplicado com togglePanel
    }

    const result = registerShortcuts(conflictingShortcuts, () => false)
    expect(result.conflicts).toContain('Ctrl+Alt+O')
  })

  it('detecta quando o sistema operacional rejeita um atalho ocupado por outro app', () => {
    const osOccupied = (acc: string) => acc === 'Ctrl+Alt+S'

    const result = registerShortcuts(defaultShortcuts, osOccupied)
    expect(result.conflicts).toContain('Ctrl+Alt+S')
    expect(result.registered.has('Ctrl+Alt+S')).toBe(false)
    expect(result.registered.size).toBe(8)
  })
})
