# Fine Press Scout

A transparent RAG-powered research assistant for fine press and limited edition speculative fiction books.

## Overview

Fine Press Scout helps collectors and readers discover and compare limited edition books across multiple small press publishers. Users ask natural-language questions about books, editions, publishers, and collecting — and get grounded, citation-backed answers with full visibility into how the system searched, retrieved, and reasoned.

### Key Features

- **Transparent RAG Pipeline**: Reasoning Panel shows query analysis, retrieval results, and generation context
- **Source Cards**: Every response includes verifiable citations with direct publisher links
- **Cross-Publisher Search**: Single query searches across 5 (curating more in the future) fine press publishers simultaneously
- **Metadata Filtering**: Search by publisher, price range, edition type, and availability
- **Speculative Fiction Aesthetic**: Dark mode "The Void" and light mode "The Archive" with custom design tokens

## Technology Stack

### Frontend

- Next.js 16+ (App Router, TypeScript)
- Tailwind CSS v4 with custom design tokens
- Vercel AI SDK for streaming chat
- next-themes for dark/light mode
- Framer Motion for animations

### Backend

- OpenRouter (free tier) for LLM inference
  - Primary: Mistral 7B Instruct
  - Fallbacks: Llama 3.1 8B, Gemma 2 9B
- HuggingFace Inference API for embeddings (all-MiniLM-L6-v2)
- Qdrant vector database
- Playwright + Cheerio for web scraping

### Data Sources (V1)

- Conversation Tree Press
- Curious King
- Zagava
- Subterranean Press
- Centipede Press

## Getting Started

### Prerequisites

- Node.js >= 18.17.0
- npm >= 9.0.0
- Docker and Docker Compose (for local Qdrant)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd fine-press-scout
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

- Get OpenRouter API key from https://openrouter.ai/
- Get HuggingFace API key from https://huggingface.co/settings/tokens

4. Start local Qdrant instance:

```bash
npm run docker:up
```

5. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

```bash
# Install all dependencies
npm install

# Start Qdrant in Docker
npm run docker:up

# Verify Qdrant is running (should return dashboard)
curl http://localhost:6333

# Run linting
npm run lint

# Check TypeScript compilation
npm run type-check

# Format code with Prettier
npm run format

# Check code formatting
npm run format:check

# Start development server
npm run dev
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with theme provider
│   ├── page.tsx                # Home page / chat interface
│   ├── globals.css             # Global styles and design tokens
│   └── api/
│       ├── chat/route.ts       # RAG pipeline orchestration
│       ├── ingest/route.ts     # Data ingestion trigger
│       └── health/route.ts     # Health check + stats
├── components/
│   ├── chat/                   # Chat UI components
│   ├── layout/                 # Header, sidebar, theme toggle
│   ├── providers/              # React context providers
│   └── ui/                     # Shared UI primitives
├── lib/
│   ├── rag/                    # RAG pipeline modules
│   ├── llm/                    # LLM client configuration
│   ├── scrapers/               # Publisher-specific scrapers
│   └── utils/                  # Utilities and helpers
├── hooks/                      # React hooks
├── styles/                     # Design tokens
└── types/                      # TypeScript type definitions
```

## Architecture

### RAG Pipeline Flow

```
User Query
    ↓
1. Parse Intent & Extract Filters
    ↓
2. Embed Query (HuggingFace API)
    ↓
3. Vector Search (Qdrant with payload filters)
    ↓
4. Assemble Context + Prompt
    ↓
5. Stream LLM Response (OpenRouter)
    ↓
6. Return with Source Citations
```

### Design Tokens

**Dark Mode (The Void)**

- Background: `#0a0a0f`
- Primary: `#7c3aed` (electric violet)
- Secondary: `#06b6d4` (cyan)
- Accent: `#f59e0b` (amber)

**Light Mode (The Archive)**

- Background: `#faf9f7` (warm parchment)
- Primary: `#6d28d9` (deeper violet)
- Secondary: `#0891b2` (teal)
- Accent: `#d97706` (deeper amber)

## Development Roadmap

### Phase 0: Scaffolding ✅ (Done)

- Project setup with Next.js 16, AI SDK by Vercel, TypeScript, Tailwind v4
- Docker Compose for local Qdrant
- Environment configuration
- Theme system with dark/light modes

### Phase 1: Data Ingestion (In Progress)

- Abstract scraper base class
- Publisher-specific scrapers (5 publishers)
- Chunking pipeline with metadata preservation
- Embedding integration (HuggingFace API)
- Qdrant collection setup and ingestion

### Phase 2: RAG Engine

- Query embedding
- Vector retrieval with metadata filtering
- Prompt assembly
- OpenRouter streaming integration
- Conversation memory

### Phase 3: Frontend Chat UI

- Chat window with streaming responses
- Message bubbles with markdown rendering
- Reasoning panel (collapsible)
- Source cards
- Empty state and suggested queries
- Mobile responsive design

### Phase 4: Production Hardening

- Rate limiting
- Response caching
- Error handling and fallbacks
- Logging and observability
- Testing suite
- Deployment (Vercel + Railway/Fly.io)

### Phase 5: Polish & GTM

- Landing page
- Curated demo flows
- Feedback mechanism
- Analytics
- Documentation
- Blog post

## License

MIT. This project is open-source and maintained as a public GitHub repository.

---

**Status**: Phase 0 complete ✅ | Phase 1 in progress 🔨
