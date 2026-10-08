import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface MarkdownMessageProps {
  content: string
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleCopyCode = (code: string, idx: number): void => {
    window.perssua?.copyToClipboard(code)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  // Divide o texto entre blocos de código e texto comum
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-2 select-text font-normal text-xs leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          // Bloco de código
          const lines = part.slice(3, -3).trim().split('\n')
          const firstLine = lines[0].trim()
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine)
          const lang = hasLang ? firstLine : ''
          const code = (hasLang ? lines.slice(1) : lines).join('\n')

          return (
            <div key={index} className="my-2 rounded bg-[#090d13] border border-border/80 overflow-hidden text-xs">
              <div className="flex items-center justify-between px-2.5 py-1 bg-surfaceHover/80 border-b border-border/60 text-[10px] text-muted font-mono select-none">
                <span>{lang || 'código'}</span>
                <button
                  onClick={() => handleCopyCode(code, index)}
                  className="flex items-center gap-1 hover:text-slate-100 transition-colors"
                  title="Copiar código"
                >
                  {copiedIndex === index ? (
                    <>
                      <Check className="w-3 h-3 text-success" />
                      <span className="text-success">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed">
                <code>{code}</code>
              </pre>
            </div>
          )
        }

        // Renderiza formatação simples (negrito, inline code e parágrafos)
        const paragraphs = part.split('\n\n').filter(Boolean)

        return (
          <div key={index} className="space-y-1.5">
            {paragraphs.map((p, pIdx) => (
              <p key={pIdx} className="leading-relaxed">
                {renderInlineFormatting(p)}
              </p>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  // Processa inline code `...` e negrito **...**
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)

  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-surfaceHover border border-border/60 text-accent font-mono text-[11px]">
          {token.slice(1, -1)}
        </code>
      )
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-100">
          {token.slice(2, -2)}
        </strong>
      )
    }
    return token
  })
}
