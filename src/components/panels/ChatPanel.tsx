import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { TractProperties, TerritoryConfig, SelectionSummary, Substation, DataCenter } from '../../types/territory'
import { useChat } from '../../hooks/useChat'
import { computeTractCentroids, formatTractsCSV, formatSubstationsCSV, formatDataCentersCSV, computeProximitySummaries, buildDynamicContext } from '../../lib/chat-context'
import { BATTERY_SPECS } from '../../config/quilt-specs'

interface ChatPanelProps {
  tracts: TractProperties[]
  geojson: GeoJSON.FeatureCollection | null
  substations: Substation[]
  dataCenters: DataCenter[]
  config: TerritoryConfig
  summary: SelectionSummary
  selectedTracts: Set<string>
  countyFilter: string | null
  includeBattery: boolean
}

const EXAMPLE_QUESTIONS = [
  'How many MW of capacity is within 10 miles of the Allston substation?',
  'Which county has the most electric resistance homes?',
  'Why is the peak reduction 9 kW for single family homes?',
  'How does cost per kW compare to a gas peaker plant?',
  'What would a 500-home pilot in Washington County look like?',
]

export function ChatPanel({
  tracts,
  geojson,
  substations,
  dataCenters,
  config,
  summary,
  selectedTracts,
  countyFilter,
  includeBattery,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Precompute centroids once when geojson loads
  const centroids = useMemo(() => {
    if (!geojson) return new Map()
    return computeTractCentroids(geojson)
  }, [geojson])

  // Precompute CSVs (only changes when data changes, not on selection)
  const tractsCSV = useMemo(() => formatTractsCSV(tracts, centroids), [tracts, centroids])
  const substationsCSV = useMemo(() => formatSubstationsCSV(substations), [substations])
  const dataCentersCSV = useMemo(() => formatDataCentersCSV(dataCenters), [dataCenters])

  // Pre-compute proximity summaries (distances from tracts to substations/data centers)
  const proximitySummaries = useMemo(() =>
    computeProximitySummaries(tracts, centroids, substations, dataCenters, includeBattery, BATTERY_SPECS.additionalPeakReductionKW),
    [tracts, centroids, substations, dataCenters, includeBattery]
  )

  const getContext = useCallback(() => {
    return buildDynamicContext({
      tractsCSV,
      substationsCSV,
      dataCentersCSV,
      proximitySummaries,
      summary,
      config,
      countyFilter,
      selectedCount: selectedTracts.size,
      includeBattery,
    })
  }, [tractsCSV, substationsCSV, dataCentersCSV, proximitySummaries, summary, config, countyFilter, selectedTracts.size, includeBattery])

  const { messages, isLoading, error, sendMessage, clearMessages } = useChat({ getContext })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <span className="text-xs font-medium text-gray-500">AI Assistant</span>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <WelcomeScreen onQuestion={(q) => { setInput(''); sendMessage(q) }} />
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} content={msg.content} />
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-1.5 px-3 py-2">
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        {error && (
          <div className="text-xs text-red-500 px-3 py-1.5 bg-red-50 rounded">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-200 p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the territory data..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--color-quilt-coral)] focus:ring-1 focus:ring-[var(--color-quilt-coral)] disabled:opacity-50 disabled:bg-gray-50"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-quilt-coral)] text-white disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-gray-300 mt-1.5 text-center">
          Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}

function WelcomeScreen({ onQuestion }: { onQuestion: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-6">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-quilt-coral)] to-orange-400 flex items-center justify-center mb-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700 mb-1">Territory AI</p>
      <p className="text-xs text-gray-400 mb-4 text-center">
        Ask questions about capacity, costs, geography, and methodology
      </p>
      <div className="w-full space-y-1.5">
        {EXAMPLE_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuestion(q)}
            className="w-full text-left text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md px-3 py-2 transition-colors border border-gray-100"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? 'bg-[var(--color-quilt-coral)] text-white'
            : 'bg-gray-100 text-gray-700'
        }`}
      >
        {isUser ? content : <MarkdownContent text={content} />}
      </div>
    </div>
  )
}

function MarkdownContent({ text }: { text: string }) {
  if (!text) {
    return <span className="text-gray-400 italic">Thinking...</span>
  }

  // Simple markdown rendering: bold, bullets, code spans, paragraphs
  const paragraphs = text.split(/\n\n+/)

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pi) => {
        const lines = para.split('\n')
        const isList = lines.every(l => /^[-*•]\s/.test(l.trim()) || l.trim() === '')

        if (isList) {
          const items = lines.filter(l => /^[-*•]\s/.test(l.trim()))
          return (
            <ul key={pi} className="list-disc list-inside space-y-0.5">
              {items.map((item, ii) => (
                <li key={ii}>
                  <InlineMarkdown text={item.replace(/^[-*•]\s+/, '')} />
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={pi}>
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                <InlineMarkdown text={line} />
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle bold (**text**) and code (`text`)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-gray-200 px-1 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
