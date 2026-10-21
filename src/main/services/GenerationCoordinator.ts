export type JobOrigin = 'manual' | 'quick-action' | 'auto-assist'

export interface ActiveJob {
  requestId: string
  sessionId: string
  origin: JobOrigin
  abortController: AbortController
  startTime: number
}

export interface ReservationResult {
  ok: boolean
  requestId?: string
  abortController?: AbortController
}

export class GenerationCoordinator {
  private currentJob: ActiveJob | null = null
  private activeSessionId: string

  constructor(initialSessionId?: string) {
    this.activeSessionId = initialSessionId || `sess_${Date.now()}`
  }

  public getSessionId(): string {
    return this.activeSessionId
  }

  public startNewSession(): string {
    if (this.currentJob) {
      try {
        this.currentJob.abortController.abort()
      } catch {}
      this.currentJob = null
    }
    this.activeSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    return this.activeSessionId
  }

  public reserve(origin: JobOrigin, sessionId: string): ReservationResult {
    // 1. Rejeita se a sessão for antiga ou inválida
    if (sessionId !== this.activeSessionId) {
      return { ok: false }
    }

    // 2. Se houver job em andamento, aplica regras de preempção e prioridade
    if (this.currentJob && !this.currentJob.abortController.signal.aborted) {
      // Se for auto-assist tentando rodar enquanto qualquer job já está ativo: rejeita
      if (origin === 'auto-assist') {
        return { ok: false }
      }

      // Se for manual ou quick-action e o job atual for auto-assist: preempciona e cancela o auto-assist
      if (this.currentJob.origin === 'auto-assist') {
        console.log(`[GenerationCoordinator] Requisição ${origin} preempcionou auto-assist ativo (${this.currentJob.requestId})`)
        try {
          this.currentJob.abortController.abort()
        } catch {}
        this.currentJob = null
      } else {
        // Se já era manual/quick-action e chega nova manual: cancela a anterior e assume a nova
        console.log(`[GenerationCoordinator] Nova requisição ${origin} substituindo requisição manual anterior (${this.currentJob.requestId})`)
        try {
          this.currentJob.abortController.abort()
        } catch {}
        this.currentJob = null
      }
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const abortController = new AbortController()

    this.currentJob = {
      requestId,
      sessionId,
      origin,
      abortController,
      startTime: Date.now()
    }

    return {
      ok: true,
      requestId,
      abortController
    }
  }

  public isJobActive(requestId: string, sessionId?: string): boolean {
    if (sessionId && sessionId !== this.activeSessionId) {
      return false
    }
    if (!this.currentJob) {
      return false
    }
    return this.currentJob.requestId === requestId && !this.currentJob.abortController.signal.aborted
  }

  public release(requestId: string): void {
    // Regra crítica: se o job atual não for o requestId que está finalizando,
    // significa que uma nova requisição já assumiu. NÃO limpa this.currentJob!
    if (this.currentJob?.requestId !== requestId) {
      return
    }
    this.currentJob = null
  }

  public cancelCurrent(): void {
    if (this.currentJob) {
      try {
        this.currentJob.abortController.abort()
      } catch {}
      this.currentJob = null
    }
  }

  public cancelAutoAssist(): void {
    if (this.currentJob && this.currentJob.origin === 'auto-assist') {
      try {
        this.currentJob.abortController.abort()
      } catch {}
      this.currentJob = null
    }
  }

  public isGenerating(): boolean {
    return this.currentJob !== null && !this.currentJob.abortController.signal.aborted
  }

  public getCurrentOrigin(): JobOrigin | null {
    return this.currentJob ? this.currentJob.origin : null
  }
}
