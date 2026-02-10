import crypto from "node:crypto";
import { scrapeSubterranean } from "@/lib/scrapers/subterranean";
import { embedBatch } from "@/lib/embeddings";
import { initCollection, upsertChunks, COLLECTION_NAME } from "@/lib/qdrant";
import type { Document, Chunk } from "@/types";

/** Generate a deterministic UUID from a string (for Qdrant point IDs). */
function stringToUuid(s: string): string {
  const hash = crypto.createHash("sha256").update(s).digest();
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Chunk a document into vector-searchable units.
 * For MVP, we create a single chunk per document for simplicity.
 * TODO: Phase 1 will implement proper chunking with overlap for longer documents.
 */
function chunkDocument(doc: Document): Omit<Chunk, "embedding">[] {
  return [
    {
      id: `${doc.id}_chunk_0`,
      text: doc.rawText,
      payload: {
        bookId: doc.id,
        title: doc.title,
        author: doc.author,
        publisher: doc.publisher,
        price: doc.price ?? null,
        currency: doc.currency ?? null,
        editionType: doc.editionType ?? null,
        availability: doc.availability ?? null,
        genreTags: doc.genreTags,
        url: doc.url,
        chunkIndex: 0,
      },
    },
  ];
}

/**
 * Main ingestion orchestrator.
 * Runs the complete pipeline: scrape → chunk → embed → store
 */
async function main() {
  console.log("Starting Fine Press Scout data ingestion pipeline...\n");

  try {
    // Step 1: Initialize Qdrant collection
    console.log("Step 1: Initializing Qdrant collection...");
    await initCollection();
    console.log("");

    // Step 2: Scrape Subterranean Press
    console.log("Step 2: Scraping Subterranean Press...");
    const documents = await scrapeSubterranean();
    if (documents.length === 0) {
      console.warn("No documents scraped. Exiting.");
      return;
    }
    console.log("");

    // Step 3: Chunk documents
    console.log("Step 3: Chunking documents...");
    const chunksWithoutEmbeddings = documents.flatMap(chunkDocument);
    console.log(`✓ Created ${chunksWithoutEmbeddings.length} chunks`);
    console.log("");

    // Step 4: Embed chunks in batch
    console.log("Step 4: Embedding chunks (this may take 30-60 seconds)...");
    const texts = chunksWithoutEmbeddings.map((c) => c.text);
    const embeddings = await embedBatch(texts);
    console.log(`✓ Generated ${embeddings.length} embeddings`);
    console.log("");

    // Step 5: Upsert to Qdrant (point IDs must be UUID or integer)
    console.log("Step 5: Upserting to Qdrant...");
    const points = chunksWithoutEmbeddings.map((chunk, i) => ({
      id: stringToUuid(chunk.id),
      vector: embeddings[i],
      payload: chunk.payload as Record<string, unknown>,
    }));

    await upsertChunks(points);
    console.log("");

    // Summary
    console.log("✅ Ingestion complete!");
    console.log(`   Books scraped: ${documents.length}`);
    console.log(`   Chunks created: ${chunksWithoutEmbeddings.length}`);
    console.log(`   Collection: ${COLLECTION_NAME}`);
    console.log(`   View in Qdrant dashboard: http://localhost:6333/dashboard`);
  } catch (error) {
    console.error("\n❌ Ingestion failed:", error);
    process.exit(1);
  }
}

main();
