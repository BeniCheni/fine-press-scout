export interface BookDocument {
  id: string;
  title: string;
  author: string;
  publisher: string;
  url: string;
  description: string;
  price?: number;
  currency?: string;
  edition_type?: "trade" | "limited" | "lettered" | "artist";
  limitation?: string;
  availability?: "in_print" | "sold_out" | "preorder";
  genre_tags?: string[];
  illustrator?: string;
  binding?: string;
  page_count?: number;
  publication_year?: number;
  scraped_at: string;
  raw_text: string;
}

export interface VectorChunk {
  id: string;
  text: string;
  embedding: number[];
  payload: {
    book_id: string;
    title: string;
    author: string;
    publisher: string;
    price: number | null;
    edition_type: string | null;
    availability: string | null;
    genre_tags: string[];
    url: string;
    chunk_index: number;
  };
}
