import { query } from '../database/db';
import { generateEmbedding, saveRuleIndex, RuleVectorEntry } from '../rag/vector-store';

async function generateRuleEmbeddings() {
  console.log('Fetching rules from database...');
  const rules = await query<{ id: string, offense_code: string, description: string }>(
    'SELECT id, offense_code, description FROM rules'
  );

  console.log(`Found ${rules.length} rules. Generating embeddings...`);
  const entries: RuleVectorEntry[] = [];

  let count = 0;
  for (const rule of rules) {
    const textToEmbed = `Offense: ${rule.description} (Code: ${rule.offense_code})`;
    try {
      const embedding = await generateEmbedding(textToEmbed);
      entries.push({
        ruleId: rule.id,
        embedding
      });
      count++;
      process.stdout.write(`\\rProcessed ${count}/${rules.length}`);
    } catch (e) {
      console.error(`\\nFailed to embed rule ${rule.id}:`, e);
    }
  }

  console.log(`\\nSaving ${entries.length} vectors to data/rules.vector.index.json...`);
  await saveRuleIndex(entries);
  
  console.log('Rule embeddings generation complete.');
  process.exit(0);
}

generateRuleEmbeddings().catch((err) => {
  console.error(err);
  process.exit(1);
});
