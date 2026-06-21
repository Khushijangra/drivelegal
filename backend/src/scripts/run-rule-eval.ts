import { retrieveEvidence } from '../rag/rag';

const intents = [
  { expected: 'MV194D', bases: ['helmet', 'protective headgear', 'head protection', 'without wearing helmet', 'riding bareheaded', 'no helmet fine', 'challan for missing helmet', 'two wheeler head gear', 'forgetting to wear helmet', 'pillion without helmet'] },
  { expected: 'MV185', bases: ['drunk driving', 'drinking and driving', 'driving under influence', 'alcohol limit', 'intoxicated driving', 'dui penalty', 'dwi fine', 'drunk at the wheel', 'beer and driving', 'breathalyzer fail'] },
  { expected: 'DL-115', bases: ['triple riding', 'three persons', 'three people on bike', '3 on a scooter', 'carrying two pillions', 'extra passenger on motorcycle', 'tripling', 'three guys on scooty', 'overloading two wheeler passengers', '3 persons fine'] },
  { expected: 'DL-138', bases: ['commercial badge', 'transport badge', 'driving taxi without badge', 'cab driver no badge', 'commercial license badge missing', 'auto rickshaw badge', 'psv badge requirement', 'badge fine', 'badge challan', 'driving transport vehicle without authorization'] },
  { expected: 'MV122', bases: ['no parking', 'parking violation', 'parked in wrong place', 'wrong parking fine', 'parking on footpath', 'obstructing traffic parking', 'tow away zone', 'parking ticket', 'illegal parking', 'parked incorrectly'] },
  { expected: 'MV194B', bases: ['seatbelt', 'safety belt', 'without seat belt', 'driving without seatbelt', 'not wearing seatbelt', 'car seatbelt fine', 'passenger no seatbelt', 'seatbelt challan', 'unbelted driving', 'driver seat belt'] },
  { expected: 'MV194E', bases: ['mobile phone', 'talking on phone', 'using cell phone', 'texting while driving', 'calling while riding', 'phone fine', 'mobile while driving', 'holding phone', 'earphones while driving', 'bluetooth calling driving'] },
  { expected: 'MV194F', bases: ['jumping red light', 'traffic signal violation', 'running a red light', 'red signal jump', 'breaking traffic light', 'crossing on red', 'red light challan', 'ignoring stop signal', 'signal jump', 'traffic light fine'] },
  { expected: 'MV182A', bases: ['no rc', 'without registration', 'registration certificate missing', 'driving unregistered vehicle', 'rc book missing', 'vehicle registration fine', 'no papers rc', 'unregistered car', 'invalid rc', 'registration challan'] },
  { expected: 'MV190_2', bases: ['pollution', 'puc certificate', 'modified silencer', 'loud exhaust', 'smoke emission', 'no puc', 'pollution under control missing', 'loud bullet silencer', 'blast silencer', 'emission violation'] },
];

const testCases = intents.flatMap(intent => intent.bases.map(q => ({ query: q, expectedRule: intent.expected })));

async function runEval() {
  console.log(`Starting Phase 8 Evaluation Audit on ${testCases.length} queries...`);
  
  let top1Count = 0;
  let top3Count = 0;
  let authorityCount = 0;
  let reciprocalRankSum = 0;
  
  const latencies: number[] = [];
  const failures: any[] = [];
  
  // Confusion Matrix: Expected vs Retrieved
  const confusionMatrix: Record<string, Record<string, number>> = {};
  
  for (const tc of testCases) {
    const start = Date.now();
    const result = await retrieveEvidence(tc.query, 'DL');
    const latency = Date.now() - start;
    latencies.push(latency);
    
    if (!confusionMatrix[tc.expectedRule]) confusionMatrix[tc.expectedRule] = {};
    
    if (result.items.length > 0) {
      const top1 = result.items[0];
      const codeMatch = top1.excerpt.match(/Code:\s*([A-Z0-9_-]+)/);
      const top1Code = top1.excerpt.includes('[OFFENSE RULE MATCH]') && codeMatch 
        ? codeMatch[1]
        : 'DOCUMENT_CHUNK';
        
      confusionMatrix[tc.expectedRule][top1Code] = (confusionMatrix[tc.expectedRule][top1Code] || 0) + 1;

      let matchRank = -1;
      let hasAuthority = false;

      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        if (item.excerpt.includes(tc.expectedRule)) {
          if (matchRank === -1) matchRank = i + 1;
        }
      }
      
      if (top1.excerpt.includes('[OFFENSE RULE MATCH]') || (top1.organization && top1.organization.match(/morth|police|gazette|parivahan/i))) {
        authorityCount++;
      }

      if (matchRank === 1) top1Count++;
      if (matchRank > 0 && matchRank <= 3) top3Count++;
      if (matchRank > 0) reciprocalRankSum += (1 / matchRank);
      
      if (matchRank !== 1) {
        failures.push({
          query: tc.query,
          expectedRule: tc.expectedRule,
          retrieved: top1Code,
        });
      }
    } else {
      confusionMatrix[tc.expectedRule]['NONE'] = (confusionMatrix[tc.expectedRule]['NONE'] || 0) + 1;
      failures.push({ query: tc.query, expectedRule: tc.expectedRule, retrieved: 'NONE' });
    }
    
    process.stdout.write(`\\rProcessed ${latencies.length}/${testCases.length}`);
  }
  
  const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLat = Math.max(...latencies);
  
  console.log('\\n\\n=== Phase 8 Validation Audit Report ===');
  console.log(`Total Queries: ${testCases.length}`);
  console.log(`Top-1 Accuracy: ${((top1Count / testCases.length) * 100).toFixed(1)}%`);
  console.log(`Top-3 Accuracy: ${((top3Count / testCases.length) * 100).toFixed(1)}%`);
  console.log(`Mean Reciprocal Rank (MRR): ${(reciprocalRankSum / testCases.length).toFixed(3)}`);
  console.log(`Authority Coverage: ${((authorityCount / testCases.length) * 100).toFixed(1)}%`);
  console.log(`Average Latency: ${avgLat.toFixed(2)}ms`);
  console.log(`Worst-case Latency: ${maxLat}ms`);
  
  console.log('\\n=== Confusion Matrix (Expected vs Retrieved) ===');
  for (const expected of Object.keys(confusionMatrix)) {
    console.log(`Expected ${expected}:`);
    for (const [retrieved, count] of Object.entries(confusionMatrix[expected])) {
      console.log(`  -> ${retrieved}: ${count}`);
    }
  }

  if (failures.length > 0) {
    console.log('\\n=== Remaining Failure Cases ===');
    failures.slice(0, 10).forEach(f => { // Print up to 10 failures
      console.log(`Query: "${f.query}" | Expected: ${f.expectedRule} | Retrieved: ${f.retrieved}`);
    });
    if (failures.length > 10) console.log(`... and ${failures.length - 10} more.`);
  }

  process.exit(0);
}

runEval().catch(console.error);
