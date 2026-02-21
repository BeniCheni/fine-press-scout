# Fine Press Scout

A RAG-powered knowledge store for fine press and limited-edition speculative fiction collectors. The current implementation is a streaming chat interface backed by Qdrant and a publisher scraping pipeline. It is evolving toward an **agentic research panel** — a multi-tool AI agent that can gauge market pricing, compare editions, surface buying and selling signals, and reason across the collection rather than answering one query at a time.

The project also serves as a documented case study comparing DIY scraping against a managed data API ([TinyFish](https://www.tinyfish.ai)) as a build-vs-buy architectural decision.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict mode |
| UI | React 19, Tailwind CSS v4 |
| Vector database | Qdrant (local via Docker Compose) |
| Embeddings | HuggingFace Inference API — `sentence-transformers/all-MiniLM-L6-v2` (384-dim) |
| LLM | OpenRouter — primary `mistralai/mistral-7b-instruct` |
| Scraping | Playwright (JS-rendered pages), Cheerio (static HTML) |
| Testing | Vitest |

---

## Architecture & Data Flow

```
Publisher websites
       │
       ▼
app/lib/scrapers/          ← one file per publisher, all extend BaseScraper
       │  scrapeAllPages() → RawBook[]
       │  cleanData()      → BookDocument[]
       ▼
public/data/books-*.json   ← intermediate JSON per publisher
       │
       ▼
app/scripts/ingest.ts      ← reads JSON files, calls getEmbedding(), upserts to Qdrant
       │
       ▼
Qdrant (Docker)            ← `books` collection, 384-dim cosine, payload indexes on
       │                      price (float), edition_type, availability, publisher,
       │                      author (text), genre_tags
       ▼
app/lib/rag/query.ts       ← queryBooks(): embeds the query, applies Qdrant payload
       │                      filters (price range, edition_type, availability) at the
       │                      database layer — no post-processing JS
       ▼
app/api/chat/route.ts      ← Next.js Route Handler; retrieves up to 8 results,
       │                      injects them as a context block into the LLM messages
       ▼
OpenRouter (Mistral 7B)    ← streams a buying-intent recommendation response
       ▼
app/page.tsx               ← streaming chat UI with budget/keyword inputs and
                              structured book-card rendering
```

### Filter resolution

`queryBooks()` supports two paths:

- **Explicit params** (`budget`, `keyword`) — backward-compatible; always adds `availability = in_print`.
- **NLP extraction** (activated when neither `budget` nor `keyword` is supplied) — `extractFilters()` in `app/lib/rag/filters.ts` parses publisher, author, edition type, price ceiling, availability, and genre tags from the raw query string and maps them to typed Qdrant conditions.

---

## Agentic RAG — Implementation Path

The current single-lookup RAG flow will be extended into a **ReAct-style agent** (Reason + Act): the LLM is given a toolbelt of named Qdrant queries, decides which tools to call and in what order, observes results, and reasons across them before responding. The UI evolves from a chat thread into a structured **research panel**.

### Why the chatbot pattern is the floor, not the ceiling

A chatbot performs one RAG lookup per turn. It cannot compare asking prices across publishers for the same title, reason about whether a $450 lettered edition is expensive relative to comparable titles, or produce a structured market brief. A multi-tool agent can.

### Planned tool surface

| Tool | Intent it serves | Underlying query |
|---|---|---|
| `search_books(query, budget?, edition_type?)` | Recommendations by theme / budget | Existing `queryBooks()` |
| `get_price_range(title)` | Is this asking price reasonable? | Qdrant `scroll` + min/max/avg aggregation |
| `compare_editions(title)` | Trade vs. Lettered vs. Remarqued pricing | `edition_type` facet queries |
| `find_comparable(title, n)` | What else is like this? | Qdrant `recommend` kNN |
| `gauge_market_value(title, edition, asking_price)` | Buy / pass signal | Cross-query reasoning across comparable titles |
| `publisher_inventory(publisher)` | What's in-stock right now? | `availability = in_print` publisher filter |
| `collection_gaps(owned_titles[])` | What should I acquire next? | Embedding similarity across owned list |

### Migration steps from the current codebase

1. **Wrap existing query functions as AI SDK tools** — `queryBooks()`, a new `getPriceRange()`, and `findComparable()` use the `tool()` helper from `ai` and are registered in `app/api/agent/route.ts` under `tools:`.
2. **Switch `streamText` to agentic mode** — pass `maxSteps > 1` so the model can invoke multiple tools per user turn before producing a final response.
3. **Add aggregation queries to `query.ts`** — `getPriceRange()` uses Qdrant `scroll` to fetch all prices for a title and returns min/max/avg; `findComparable()` wraps the Qdrant `recommend` endpoint.
4. **Accumulate price history** — `scraped_at` is already on `BookDocument`; running scrapers on a schedule lets Qdrant build price history per title, enabling trend and valuation queries.
5. **Replace the chat UI with a research panel** — responses render as structured market briefs (price band, comparable titles, buy/pass signal, book cards) rather than a prose conversation thread.

---

## Project Structure

```
app/
  api/chat/route.ts          ← streaming chat endpoint (OpenRouter via AI SDK)
  lib/
    types.ts                 ← shared interfaces: RawBook, BookDocument, EmbeddedBook,
    │                           SearchResult, QueryParams, EditionType, QdrantCondition …
    scrapers/
      base.ts                ← abstract BaseScraper (scrapeAllPages, cleanData, helpers)
      conversation-tree.ts   ← Conversation Tree Press (Shopify REST endpoint)
      curious-king.ts        ← Curious King Books (static HTML, Cheerio)
      subterranean.ts        ← Subterranean Press
      centipede.ts           ← Centipede Press
      midworld.ts            ← Midworld Press
      suntup.ts              ← Suntup Press (edition variant handling)
      zagava.ts              ← Zagava
    rag/
      embed.ts               ← getEmbedding() via HuggingFace, exponential back-off
      ingest.ts              ← ensureCollection(), ingestBooks() — batch upsert to Qdrant
      query.ts               ← queryBooks() — vector search + Qdrant payload filters
      filters.ts             ← extractFilters() NLP helper, KEYWORD_EDITION_MAP synonym table
      prompt.ts              ← SYSTEM_PROMPT (buying-intent framing), buildContextBlock()
    utils/
      normalizer.ts
  scripts/
    scrape.ts                ← run all scrapers → public/data/books-*.json
    scrape-single.ts         ← run one scraper by name
    ingest.ts                ← embed + upsert all JSON files to Qdrant
  page.tsx                   ← chat UI (budget input, keyword input, streaming messages,
                                structured book cards parsed from assistant response)
public/data/
  books-*.json               ← per-publisher scraped + cleaned data
docker-compose.yml           ← Qdrant service
__tests__/
  retriever.test.ts
```

---

## Publisher Data Sources

| Publisher | URL | Scraper notes |
|---|---|---|
| Conversation Tree Press | conversationtreepress.com | Shopify `/collections/all/products.json` REST endpoint |
| Curious King | curiousking.co.uk/books | Static HTML, Cheerio |
| Subterranean Press | subterraneanpress.com/all-books | Standard e-commerce HTML |
| Centipede Press | centipedepress.com/books.html | Standard e-commerce HTML |
| Midworld Press | midworldpress.com/store | Playwright |
| Suntup Press | suntup.press/editions | Edition variant handling (numbered, lettered, traycase) |
| Zagava | zagava.de | Static HTML |

> **Build-vs-buy:** When a scraper encounters anti-bot protection, JS rendering complexity, or high maintenance risk, the source file contains a `// TINYFISH_CANDIDATE:` comment explaining the rationale for evaluating the [TinyFish API](https://www.tinyfish.ai) as an alternative.

---

## Edition Vocabulary

The `EditionType` union and `KEYWORD_EDITION_MAP` synonym table cover the full range of fine press collecting terminology:

`Standard` · `Trade` · `Limited` · `Collector` · `Deluxe` · `Lettered` · `Artist` · `Traycased` · `Hand-numbered` · `Remarqued`

Synonyms (e.g. "traycase", "hand numbered", "lettered copy") are resolved at query time before the Qdrant edition filter is applied.

---

## Setup

### Prerequisites

- Node.js 20+
- Docker (for Qdrant)

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Environment variables

Create `.env.local` at the project root:

```env
HUGGINGFACE_API_KEY=hf_...
OPENROUTER_API_KEY=sk-or-...
QDRANT_URL=http://localhost:6333   # default; omit if using the Docker Compose default
```

### 3. Start Qdrant

```bash
docker compose up -d
```

### 4. Scrape + ingest data

```bash
npm run data           # scrape all publishers then embed + upsert to Qdrant
```

Or run them separately:

```bash
npm run scrape         # → public/data/books-*.json
npm run ingest         # → Qdrant
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## NPM Scripts

| Script | Description |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with coverage |
| `npm run scrape` | Run all publisher scrapers |
| `npm run scrape-<publisher>` | Run one scraper (e.g. `scrape-suntup`) |
| `npm run ingest` | Embed all JSON files and upsert to Qdrant |
| `npm run data` | `scrape` then `ingest` in sequence |

---

## Qdrant Payload Schema

Every point in the `books` collection carries the following indexed payload fields:

| Field | Type | Notes |
|---|---|---|
| `price` | `float` | 0 when unknown; used for budget range filters |
| `edition_type` | `keyword` | Matches `EditionType` union |
| `availability` | `keyword` | `in_print` · `sold_out` · `preorder` |
| `publisher` | `keyword` | Canonical publisher name |
| `author` | `text` | Full-text index; supports partial-name queries |
| `genre_tags` | `keyword[]` | e.g. `["horror", "science fiction"]` |

---

## Roadmap

### Now — chatbot baseline (current)
- [x] Publisher scraping pipeline (7 sources, `BaseScraper` + per-publisher scrapers)
- [x] Qdrant ingest with payload indexes and 384-dim cosine vectors
- [x] `queryBooks()` with explicit-params and NLP-extraction filter paths
- [x] Streaming chat UI with budget / keyword inputs and book-card rendering

### Phase 2 — Agentic tool layer
- [ ] Wrap `queryBooks()` as an AI SDK `tool()` in a new `app/api/agent/route.ts`
- [ ] Implement `getPriceRange(title)` — Qdrant `scroll` aggregation returning min/max/avg/count
- [ ] Implement `findComparable(title, n)` — Qdrant `recommend` kNN endpoint
- [ ] Implement `compareEditions(title)` — parallel `edition_type` facet queries
- [ ] Enable multi-step `streamText` (`maxSteps > 1`) so the agent can chain tool calls per turn

### Phase 3 — Research panel UI
- [ ] Replace chat thread with a structured research panel layout
- [ ] Market brief component: price band, buy/pass signal, comparable titles, edition breakdown
- [ ] Price history chart (requires scheduled scrape runs to accumulate `scraped_at` data points)
- [ ] Collection tracker: input owned titles, surface `collection_gaps` recommendations

### Phase 4 — Data quality & coverage
- [ ] Scheduled scraper runs (cron / GitHub Actions) to build price history over time
- [ ] Evaluate [TinyFish API](https://www.tinyfish.ai) for publishers marked `// TINYFISH_CANDIDATE:`
- [ ] Expand `genre_tags` vocabulary and auto-tag at ingest time
- [ ] Secondary market price signals (e.g. eBay sold listings, AbeBooks) for valuation context
