import { useState, useCallback, useRef } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseChatOptions {
  getContext: () => string
}

export function useChat({ getContext }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    const userMessage: ChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setIsLoading(true)
    setError(null)

    // Build message history for API (just role + content)
    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          dynamicContext: getContext(),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(errText || `API error: ${response.status}`)
      }

      // Read SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let assistantContent = ''
      let buffer = ''

      // Add placeholder assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data) as { type: string; text?: string; error?: string }
              if (parsed.type === 'content_block_delta' && parsed.text) {
                assistantContent += parsed.text
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: assistantContent }
                  }
                  return updated
                })
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Stream error')
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      }

      // If we got no content, something went wrong
      if (!assistantContent) {
        setMessages(prev => prev.slice(0, -1)) // Remove empty assistant message
        setError('No response received')
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const errorMsg = (err as Error).message || 'Failed to send message'
      setError(errorMsg)
      // Remove the empty assistant message if it was added
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && !last.content) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [messages, getContext])

  const clearMessages = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setMessages([])
    setError(null)
    setIsLoading(false)
  }, [])

  return { messages, isLoading, error, sendMessage, clearMessages }
}
