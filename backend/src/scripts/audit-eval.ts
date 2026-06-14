import { retrieveEvidence } from '../services/rag';

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

async function runAudit() {
  console.log('Starting Phase 9 Independent Audit...');
  
  // Cold Latency test
  const coldStart = Date.now();
  await retrieveEvidence('cold start query', 'DL');
  const coldLatency = Date.now() - coldStart;
  
  const latencies: number[] = [];
  const memoryUsage: number[] = [];
  
  let top1Count = 0;
  let top3Count = 0;
  let authorityCount = 0;
  let reciprocalRankSum = 0;
  
  for (const tc of testCases) {
    const start = Date.now();
    const result = await retrieveEvidence(tc.query, 'DL');
    latencies.push(Date.now() - start);
    
    const mem = process.memoryUsage();
    memoryUsage.push(mem.heapUsed / 1024 / 1024);
    
    if (result.items.length > 0) {
      const top1 = result.items[0];
      const codeMatch = top1.excerpt.match(/Code:\s*([A-Z0-9_-]+)/);
      const top1Code = top1.excerpt.includes('[OFFENSE RULE MATCH]') && codeMatch ? codeMatch[1] : 'DOCUMENT_CHUNK';
      
      let matchRank = -1;
      for (let i = 0; i < result.items.length; i++) {
        if (result.items[i].excerpt.includes(tc.expectedRule)) {
          matchRank = i + 1;
          break;
        }
      }
      
      if (top1.excerpt.includes('[OFFENSE RULE MATCH]') || (top1.organization && top1.organization.match(/morth|police|gazette|parivahan/i))) {
        authorityCount++;
      }
      
      if (matchRank === 1) top1Count++;
      if (matchRank > 0 && matchRank <= 3) top3Count++;
      if (matchRank > 0) reciprocalRankSum += (1 / matchRank);
    }
  }
  
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLat = latencies[latencies.length - 1];
  
  const avgMem = memoryUsage.reduce((a, b) => a + b, 0) / memoryUsage.length;
  const maxMem = Math.max(...memoryUsage);
  
  console.log(`\\n--- AUDIT RESULTS ---`);
  console.log(`Cold Latency: ${coldLatency}ms`);
  console.log(`Warm Average Latency: ${avgLat.toFixed(2)}ms`);
  console.log(`P95 Latency: ${p95}ms`);
  console.log(`Worst-case Latency: ${maxLat}ms`);
  console.log(`Avg Memory (Heap Used): ${avgMem.toFixed(2)} MB`);
  console.log(`Max Memory (Heap Used): ${maxMem.toFixed(2)} MB`);
  console.log(`Raw Top-1 Accuracy (Central code match only): ${((top1Count / testCases.length) * 100).toFixed(1)}%`);
  console.log(`Raw Top-3 Accuracy: ${((top3Count / testCases.length) * 100).toFixed(1)}%`);
  console.log(`Raw MRR: ${(reciprocalRankSum / testCases.length).toFixed(3)}`);
  console.log(`Authority Coverage: ${((authorityCount / testCases.length) * 100).toFixed(1)}%`);
  
  process.exit(0);
}

runAudit().catch(console.error);
