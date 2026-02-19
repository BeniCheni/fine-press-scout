---
description: Fine Press Scout project context and coding guidelines. Load these instructions for all TypeScript, Next.js, and scraper-related tasks within this repository.
applyTo: '**/*.{ts,tsx,js,mjs}'
---

# Fine Press Scout — Project Context & Coding Guidelines

## Project Purpose

Fine Press Scout is a RAG-powered book discovery assistant for fine press 
and limited edition speculative fiction. Users enter a budget and an optional 
keyword (e.g. "signed", "limited") to receive AI-recommended titles sourced 
from targeted independent publishers. The project also serves as a documented 
case study comparing DIY scraping against the TinyFish API 
(https://www.tinyfish.ai) as a build-vs-buy architectural decision.

## Current Status

Phase 0 is complete. Phase 1 (data ingestion pipeline) is in progress.

**What is actually implemented today:**
- `app/lib/scraper.ts` — a concrete `ConversationTreeScraper` class (no abstract base class yet)
- `app/lib/types.ts` — `RawBook`, `CleanedBook`, `EmbeddedBook`, `SearchResult`, `RAGResponse` interfaces
- `app/scripts/scrape.ts` — standalone runner that writes scraped data to `public/data/books.json`
- `app/page.tsx` — default Next.js boilerplate; no application UI has been built yet

**Not yet implemented:** abstract scraper base class, `app/lib/scrapers/` directory,
`app/lib/rag/` directory, Qdrant integration, embedding pipeline, LLM integration,
and the entire frontend UI.

## Technology Stack

- **Framework:** Next.js with App Router, TypeScript in strict mode
- **Vector Database:** Qdrant (local instance via Docker Compose)
- **LLM Inference:** OpenRouter — primary model Mistral 7B Instruct, 
  with Llama 3.1 8B and Gemma 2 9B as fallbacks
- **Embeddings:** HuggingFace Inference API (all-MiniLM-L6-v2)
- **Scraping:** Playwright for JS-rendered pages, Cheerio for static HTML
- **Styling:** Tailwind CSS v4 with custom design tokens

## Target Publisher Data Sources

| Publisher | URL | Notes |
|---|---|---|
| Conversation Tree Press | conversationtreepress.com/collections/all | Shopify — currently scrapes paginated HTML (`?page=N`) and parses embedded `var meta` JSON; **migrate to `/collections/all/products.json`** REST endpoint (see Shopify guideline below) |
| Curious King | curiousking.co.uk/books | Static HTML, low anti-bot risk |
| Subterranean Press | subterraneanpress.com/all-books | Standard e-commerce HTML |
| Centipede Press | centipedepress.com/books.html | Standard e-commerce HTML |
| Midworld Press | midworldpress.com/store | Scraper not yet built |
| Suntup Press | suntup.press/editions | Verify edition variant handling |

## Feature Currently in Development

A budget-aware, keyword-filtered recommendation layer on top of the existing 
RAG pipeline. The following requirements must be respected in all related code:

- **Budget filtering** is implemented as a Qdrant price range payload filter, 
  not as post-processing in application code.
- **Keyword filtering** (e.g. "signed", "limited") drives both a vector 
  similarity search and a Qdrant `edition` payload filter (field name matches 
  `CleanedBook.edition` in `app/lib/types.ts`). Semantic matching must account 
  for synonyms common in fine press collecting: "lettered," "traycased," 
  "hand-numbered," "remarqued." The `edition` union type and `extractEdition()` 
  in `app/lib/scraper.ts` must be extended to cover these terms before the 
  Qdrant filter layer is built.
- **Availability state** (in-stock vs. sold-out) must be captured at scrape 
  time and stored as a Qdrant payload field, enabling live inventory filtering.
- **LLM prompt framing** should reflect active buying intent — 
  "what can I purchase within this budget right now" — rather than the 
  current research assistant framing.

## Outstanding Work Items

1. **Abstract scraper base class** — create `app/lib/scrapers/base.ts` with the abstract class that all publisher scrapers must extend. Use `ConversationTreeScraper` in `app/lib/scraper.ts` as the reference implementation.
2. **Migrate `ConversationTreeScraper`** to use the `/collections/all/products.json` Shopify REST endpoint instead of paginated HTML scraping, then move it to `app/lib/scrapers/`.
3. **Midworld Press scraper** — create `app/lib/scrapers/midworld.ts` extending the new base class.
4. **Suntup Press scraper** — create `app/lib/scrapers/suntup.ts`; verify it correctly handles edition variants (numbered, lettered, traycase).
5. **Extend `edition` vocabulary** — update the `CleanedBook.edition` union type in `app/lib/types.ts` and `extractEdition()` in `app/lib/scraper.ts` to cover "traycased", "hand-numbered", "remarqued", and other fine press synonyms.
6. **Qdrant integration** — create `app/lib/rag/` with embedding ingest and query modules; implement budget (price range) and keyword (`edition`) payload filters at the database layer.
7. **Frontend UI** — build the search interface in `app/page.tsx` from scratch: budget input, keyword input, and results display.
8. **LLM system prompt** — write the buying-intent prompt in `app/lib/rag/`.

## Coding Guidelines

When generating or reviewing code in this repository, apply the following 
conventions without exception:

**TypeScript:** Strict mode is enabled. All new code must be fully typed. 
Avoid `any`; use `unknown` with type guards where the shape is uncertain.

**Scrapers:** All new scrapers must extend the abstract base class in
`app/lib/scrapers/base.ts` (create it if it doesn't exist yet, using
`ConversationTreeScraper` in `app/lib/scraper.ts` as the reference
implementation). Each scraper must extract title, price (as a number),
edition type, availability status, and direct product URL as its minimum
required fields. Flag any JavaScript rendering requirements or anti-bot
challenges in a comment at the top of the file.

**Shopify stores:** Use the `/collections/{handle}/products.json` endpoint
directly rather than scraping HTML. This is faster, more stable, and avoids
brittle DOM selectors. Note: the current `ConversationTreeScraper` still uses
paginated HTML scraping and must be migrated to this endpoint (see Outstanding
Work Items).

**Qdrant interactions:** All filters must be applied at the database query
level as payload filters, not in application logic. This keeps query
performance consistent as the collection grows. The relevant payload field
names are `price` (number), `edition` (string matching `CleanedBook.edition`),
and `availability` (string: `'Available'` or `'Sold Out'`).

**Project patterns:** Follow existing project conventions before introducing 
new abstractions. When in doubt, read the nearest existing implementation 
and mirror its structure.

**Build-vs-buy narrative:** When a scraper encounters anti-bot protection, 
JavaScript rendering complexity, or significant maintenance risk, add a 
`// TINYFISH_CANDIDATE:` comment with a brief rationale. These annotations 
serve the project's documented case study comparing DIY and TinyFish 
approaches.
