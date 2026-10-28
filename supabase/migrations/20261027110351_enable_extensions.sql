-- Extensions required by DevGuide AI (see docs/03-Architecture.md §4)
create extension if not exists vector;    -- pgvector: embeddings + HNSW index
create extension if not exists pg_trgm;   -- fuzzy matching for search suggestions
