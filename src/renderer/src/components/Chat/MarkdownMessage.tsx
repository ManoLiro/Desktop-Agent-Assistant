import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import rehypeKatex from 'rehype-katex'
import { Copy, Check } from 'lucide-react'

interface MarkdownMessageProps {
  content: string
}

interface CodeBlockProps {
  code: string
  language: string
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = (): void => {
    window.perssua?.copyToClipboard(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-2.5 rounded-lg bg-[#090d13] border border-border/80 overflow-hidden text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1 bg-surfaceHover/80 border-b border-border/60 text-[10px] text-muted font-mono select-none">
        <span className="font-semibold text-accent/90">{language || 'código'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-slate-100 transition-colors px-1.5 py-0.5 rounded hover:bg-surface"
          title="Copiar código"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-success" />
              <span className="text-success text-[10px]">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px]">Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed select-text">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function preprocessMarkdown(raw: string): string {
  if (!raw) return ''

  // 1. Garante que cabeçalhos ### tenham linha antes e depois se colados
  let text = raw.replace(/([^\n])\s*(#{1,6}\s+[^\n]+)/g, '$1\n\n$2')

  // 2. Garante que separadores --- tenham linha em branco antes e depois
  text = text.replace(/([^\n])\s*(\n---+\n)/g, '$1\n$2')
  text = text.replace(/(\n---+\n)\s*([^\n])/g, '$1\n$2')

  // 3. Se houver itens de lista numerada colados na mesma linha (ex: "texto. 1. Item 2. Item")
  text = text.replace(/([.:;!?)])\s+(\d+\.\s+[A-ZÀ-Ú`*])/g, '$1\n$2')

  // 4. Se houver marcadores com asterisco colados na mesma linha (ex: "quando: * $\text{...}")
  text = text.replace(/([.:;!?)])\s+(\*\s+[A-ZÀ-Ú`$*])/g, '$1\n$2')

  return text
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  const processedContent = preprocessMarkdown(content)

  return (
    <div className="markdown-content select-text font-normal text-xs leading-relaxed text-slate-200 space-y-1.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-slate-100 mt-3 mb-1.5 pb-1 border-b border-border/50">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-accent mt-2.5 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-slate-100 mt-2 mb-1 flex items-center gap-1.5">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-slate-200 mt-1.5 mb-0.5">{children}</h4>
          ),
          p: ({ children }) => <p className="leading-relaxed mb-1.5 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-4 space-y-1 my-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="my-2.5 border-t border-border/60" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-2.5 py-0.5 my-1.5 text-muted italic bg-surfaceHover/30 rounded-r">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-100">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded border border-border">
              <table className="w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surfaceHover border-b border-border">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1 text-left font-semibold text-slate-200">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-1 border-t border-border/50 text-slate-300">{children}</td>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '')
            const textContent = String(children).replace(/\n$/, '')
            const isBlock = match || textContent.includes('\n')

            if (isBlock) {
              const lang = match ? match[1] : ''
              return <CodeBlock code={textContent} language={lang} />
            }

            return (
              <code
                className="px-1.5 py-0.5 mx-0.5 rounded bg-surfaceHover border border-border/60 text-accent font-mono text-[11px] select-text"
                {...props}
              >
                {children}
              </code>
            )
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
