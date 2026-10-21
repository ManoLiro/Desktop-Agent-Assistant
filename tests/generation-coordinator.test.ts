import { describe, it, expect, vi } from 'vitest'
import { GenerationCoordinator } from '../src/main/services/GenerationCoordinator'

describe('GenerationCoordinator - Concorrência, Preempção e Sessões', () => {
  it('permite reserva de requisição manual quando ocioso', () => {
    const coordinator = new GenerationCoordinator('sess_1')
    const res = coordinator.reserve('manual', 'sess_1')

    expect(res.ok).toBe(true)
    expect(res.requestId).toBeDefined()
    expect(res.abortController).toBeDefined()
    expect(coordinator.isGenerating()).toBe(true)
    expect(coordinator.getCurrentOrigin()).toBe('manual')
    expect(coordinator.isJobActive(res.requestId!, 'sess_1')).toBe(true)
  })

  it('requisição manual preempciona e aborta requisição auto-assist em andamento', () => {
    const coordinator = new GenerationCoordinator('sess_1')

    // 1. Inicia Auto-Assist A
    const jobA = coordinator.reserve('auto-assist', 'sess_1')
    expect(jobA.ok).toBe(true)
    expect(jobA.abortController?.signal.aborted).toBe(false)

    // 2. Chega Manual B
    const jobB = coordinator.reserve('manual', 'sess_1')
    expect(jobB.ok).toBe(true)

    // O Auto-Assist A deve ter sido abortado imediatamente
    expect(jobA.abortController?.signal.aborted).toBe(true)
    expect(coordinator.isJobActive(jobA.requestId!, 'sess_1')).toBe(false)

    // O Manual B deve ser o job ativo
    expect(coordinator.isJobActive(jobB.requestId!, 'sess_1')).toBe(true)
    expect(coordinator.getCurrentOrigin()).toBe('manual')
  })

  it('rejeita requisição auto-assist se uma requisição manual já estiver ativa', () => {
    const coordinator = new GenerationCoordinator('sess_1')

    const manual = coordinator.reserve('manual', 'sess_1')
    expect(manual.ok).toBe(true)

    const auto = coordinator.reserve('auto-assist', 'sess_1')
    expect(auto.ok).toBe(false)
    expect(auto.requestId).toBeUndefined()
    expect(coordinator.isJobActive(manual.requestId!, 'sess_1')).toBe(true)
  })

  it('o término/release de A (antigo) NÃO altera o estado de B (novo que preempcionou A)', () => {
    const coordinator = new GenerationCoordinator('sess_1')

    // Auto-assist A inicia
    const jobA = coordinator.reserve('auto-assist', 'sess_1')
    expect(jobA.ok).toBe(true)

    // Manual B preempciona A
    const jobB = coordinator.reserve('manual', 'sess_1')
    expect(jobB.ok).toBe(true)

    // O finally do job A é executado agora: release(jobA)
    coordinator.release(jobA.requestId!)

    // O job B AINDA DEVE ESTAR ATIVO!
    expect(coordinator.isGenerating()).toBe(true)
    expect(coordinator.isJobActive(jobB.requestId!, 'sess_1')).toBe(true)
    expect(coordinator.getCurrentOrigin()).toBe('manual')

    // Somente o release do job B deve liberar o coordenador
    coordinator.release(jobB.requestId!)
    expect(coordinator.isGenerating()).toBe(false)
  })

  it('iniciar nova sessão aborta trabalho em andamento e invalida jobs da sessão anterior', () => {
    const coordinator = new GenerationCoordinator('sess_1')

    const job1 = coordinator.reserve('manual', 'sess_1')
    expect(job1.ok).toBe(true)

    const newSessionId = coordinator.startNewSession()
    expect(newSessionId).not.toBe('sess_1')

    // Job antigo deve ter sido abortado e considerado inativo
    expect(job1.abortController?.signal.aborted).toBe(true)
    expect(coordinator.isJobActive(job1.requestId!, 'sess_1')).toBe(false)
    expect(coordinator.isJobActive(job1.requestId!, newSessionId)).toBe(false)
    expect(coordinator.isGenerating()).toBe(false)
  })

  it('rejeita tentativas de reserva com sessionId obsoleto', () => {
    const coordinator = new GenerationCoordinator('sess_current')
    const res = coordinator.reserve('manual', 'sess_old')
    expect(res.ok).toBe(false)
  })
})
