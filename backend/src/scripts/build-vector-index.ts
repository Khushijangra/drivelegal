import { getPool, closePool } from '../db';
import { generateEmbedding, saveIndex, VectorEntry } from '../services/vector-store';

async function main() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("Fetching chunks from database...");
    const { rows } = await client.query(`
      SELECT id, document_id, chunk_text 
      FROM document_chunks
    `);
    
    console.log(`Found ${rows.length} chunks. Generating embeddings...`);
    
    const entries: VectorEntry[] = [];
    let count = 0;
    
    for (const row of rows) {
      count++;
      if (count % 10 === 0 || count === rows.length) {
        console.log(`Processing chunk ${count}/${rows.length}...`);
      }
      
      try {
        const embedding = await generateEmbedding(row.chunk_text);
        
        entries.push({
          chunkId: row.id,
          documentId: row.document_id,
          embedding
        });
      } catch (err: any) {
         console.error(`Failed to generate embedding for chunk ${row.id}:`, err.message);
      }
    }

    console.log(`Saving ${entries.length} vectors to index...`);
    await saveIndex(entries);
    console.log("Vector index successfully built.");

  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error("Failed to build vector index:", err);
  process.exitCode = 1;
});
