'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface BookCard {
  title: string;
  author: string;
  publisher: string;
  edition: string;
  price: string;
  url: string;
}

// ── Book card parser ────────────────────────────────────────────────────────
// Pull structured book blocks from the assistant message text so we can
// render them as visual cards alongside the prose.
function parseBookCards(content: string): BookCard[] {
  const cardRegex =
    /\*\*(.+?)\*\*\s+by\s+(.+?)\s+[—–-]+\s+(.+?)\nEdition:\s*(.+?)\s*[·•]\s*Price:\s*(\S+)[^\n]*\n[^\n]*\b(https?:\/\/\S+)/gm;

  const cards: BookCard[] = [];
  let match: RegExpExecArray | null;
  while ((match = cardRegex.exec(content)) !== null) {
    cards.push({
      title: match[1].trim(),
      author: match[2].trim(),
      publisher: match[3].trim(),
      edition: match[4]?.trim() ?? '',
      price: match[5].trim(),
      url: match[6].trim(),
    });
  }
  return cards;
}

// ── Custom streaming chat hook ───────────────────────────────────────────────
function useStreamChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function send(
    userText: string,
    budget?: number,
    keyword?: string
  ) {
    if (!userText.trim()) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: userText };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
          budget,
          keyword,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const current = accumulated;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: current } : m))
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Sorry, something went wrong: ${errMsg}` } : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, isLoading, send };
}

export default function FinePressScout() {
  const [budget, setBudget] = useState('');
  const [keyword, setKeyword] = useState('');
  const [inputText, setInputText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, send } = useStreamChat();

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const budgetNum = budget ? parseFloat(budget) : undefined;
    let query = inputText.trim();
    if (!query) {
      // Synthesise a query from budget + keyword when the text field is empty
      const parts: string[] = [];
      if (budget) parts.push(`I have a budget of $${budget}`);
      if (keyword) parts.push(`looking for ${keyword} editions`);
      if (parts.length === 0) return;
      query = parts.join(', ') + '. What fine press books do you recommend?';
    }
    send(query, budgetNum, keyword || undefined);
    setInputText('');
  }

  return (
    <div className="flex flex-col h-screen bg-[#FAF7F2] text-[#1a1a1a] font-serif">
      {/* ── Header ── */}
      <header className="border-b border-[#d4c9b0] px-6 py-4 bg-[#FAF7F2] shrink-0">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-[#2c1a0e]">
            Fine Press Scout
          </h1>
          <p className="text-sm text-[#6b5a45] mt-0.5">
            Discover limited-edition books across six specialist publishers
          </p>
        </div>
      </header>

      {/* ── Transcript ── */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <p className="text-3xl mb-3">📚</p>
              <h2 className="text-xl font-semibold text-[#2c1a0e] mb-2">
                What are you searching for today?
              </h2>
              <p className="text-[#6b5a45] max-w-sm mx-auto text-sm leading-6">
                Enter your budget and an optional keyword like{' '}
                <span className="italic">signed</span>,{' '}
                <span className="italic">lettered</span>, or{' '}
                <span className="italic">traycased</span>, then ask away.
              </p>
            </div>
          )}

          {messages.map((msg: Message) => {
            const isUser = msg.role === 'user';
            const cards = parseBookCards(msg.content);
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-[#4a2c0a] text-[#fdf5e9] rounded-br-sm'
                      : 'bg-white border border-[#d4c9b0] text-[#1a1a1a] rounded-bl-sm shadow-sm'
                  }`}
                >
                  {/* Plain text */}
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Book cards rendered below the prose when present */}
                  {!isUser && cards.length > 0 && (
                    <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                      {cards.map((card, i) => (
                        <a
                          key={i}
                          href={card.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 w-52 rounded-xl border border-[#d4c9b0] bg-[#FAF7F2] p-3 hover:border-[#8b5e3c] hover:shadow-md transition-all"
                        >
                          <div className="text-xs font-semibold text-[#8b5e3c] uppercase tracking-wide mb-1">
                            {card.edition || 'Standard'}
                          </div>
                          <p className="font-bold text-[#2c1a0e] text-sm leading-snug line-clamp-2">
                            {card.title}
                          </p>
                          <p className="text-xs text-[#6b5a45] mt-0.5">{card.author}</p>
                          <p className="text-xs text-[#6b5a45]">{card.publisher}</p>
                          <p className="mt-2 text-base font-bold text-[#4a2c0a]">
                            {card.price}
                          </p>
                          <span className="inline-block mt-1 text-xs bg-[#e8f5e9] text-[#2e7d32] px-2 py-0.5 rounded-full">
                            Available
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-[#d4c9b0] rounded-2xl rounded-bl-sm px-5 py-3 shadow-sm">
                <div className="flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-[#8b5e3c] rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-[#8b5e3c] rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-[#8b5e3c] rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Pinned input bar ── */}
      <footer className="border-t border-[#d4c9b0] bg-[#FAF7F2] px-4 py-4 shrink-0">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto space-y-3">
          {/* Budget + keyword row */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b5e3c] text-sm font-bold pointer-events-none">
                $
              </span>
              <input
                type="number"
                min="0"
                step="5"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Budget"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-[#d4c9b0] bg-white text-sm text-[#1a1a1a] placeholder:text-[#b0a090] focus:outline-none focus:border-[#8b5e3c] focus:ring-1 focus:ring-[#8b5e3c]"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Keyword: signed, lettered…"
                className="w-full px-4 py-2.5 rounded-xl border border-[#d4c9b0] bg-white text-sm text-[#1a1a1a] placeholder:text-[#b0a090] focus:outline-none focus:border-[#8b5e3c] focus:ring-1 focus:ring-[#8b5e3c]"
              />
            </div>
          </div>

          {/* Message input + send */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask about fine press books, or just click Find Books…"
              className="flex-1 px-4 py-3 rounded-xl border border-[#d4c9b0] bg-white text-sm text-[#1a1a1a] placeholder:text-[#b0a090] focus:outline-none focus:border-[#8b5e3c] focus:ring-1 focus:ring-[#8b5e3c]"
            />
            <button
              type="submit"
              disabled={isLoading || (!inputText.trim() && !budget)}
              className="px-5 py-3 bg-[#4a2c0a] text-[#fdf5e9] text-sm font-semibold rounded-xl hover:bg-[#6b3f12] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isLoading ? 'Searching…' : 'Find Books'}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
