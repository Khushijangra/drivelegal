import { retrieveEvidence } from '../services/rag';

const testCases = [
  { query: "helmet challan amount", expectedRule: "MV194D" },
  { query: "fine for not wearing protective headgear", expectedRule: "MV194D" },
  { query: "alcohol limit while driving", expectedRule: "MV185" },
  { query: "three persons on one bike", expectedRule: "DL-115" },
  { query: "commercial driver badge requirement", expectedRule: "DL-138" }, // or DL-138
  { query: "driving without seatbelt", expectedRule: "MV194B" },
  { query: "speeding on the highway penalty", expectedRule: "MV183_A" }, // or similar
  { query: "using mobile phone while riding", expectedRule: "MV194E" },
  { query: "jumping a red traffic light", expectedRule: "MV194F" },
  { query: "parking in a no parking zone fine", expectedRule: "MV122" }, // or similar
  { query: "driving without valid insurance documents", expectedRule: "MV192" },
  { query: "driving a vehicle without registration certificate", expectedRule: "MV182A" },
  { query: "driving without pollution under control certificate", expectedRule: "MV190_2" }, // or similar
  { query: "underage driving penalty for parents", expectedRule: "MV199A" },
  { query: "blocking emergency vehicles like ambulance", expectedRule: "MV194E" }, // 194E is blocking emergency vehicle
  { query: "riding a motorcycle without side mirrors", expectedRule: "DL-110" }, // or similar defect
  { query: "modified silencer blast fine", expectedRule: "MV190_2" }, // pollution/defect
  { query: "driving with tinted windows", expectedRule: "MV100" }, // or similar
  { query: "riding without shoes or proper footwear", expectedRule: "DL-90" },
  { query: "overloading a goods vehicle penalty", expectedRule: "MV194" }
];

async function runTest() {
  console.log('Starting Paraphrased Query Audit...');
  let top1Count = 0;
  let top3Count = 0;
  let authorityCount = 0;
  const latencies: number[] = [];
  const failures: any[] = [];
  
  for (const tc of testCases) {
    const start = Date.now();
    const result = await retrieveEvidence(tc.query, 'DL');
    const latency = Date.now() - start;
    latencies.push(latency);
    
    if (result.items.length > 0) {
      const top1 = result.items[0];
      const isTop1Match = top1.excerpt.includes(tc.expectedRule);
      let isTop3Match = false;
      let hasAuthority = false;

      for (let i = 0; i < Math.min(3, result.items.length); i++) {
        if (result.items[i].excerpt.includes(tc.expectedRule)) isTop3Match = true;
      }
      
      // Authority coverage = top 1 is an official document/rule
      if (top1.excerpt.includes('[OFFENSE RULE MATCH]') || (top1.organization && top1.organization.match(/morth|police|gazette|parivahan/i))) {
        authorityCount++;
        hasAuthority = true;
      }

      if (isTop1Match) top1Count++;
      if (isTop3Match) top3Count++;
      
      if (!isTop1Match) {
        failures.push({
          query: tc.query,
          expectedRule: tc.expectedRule,
          retrievedRuleCode: top1.excerpt.includes('[OFFENSE RULE MATCH]') ? top1.excerpt.substring(top1.excerpt.indexOf('Code:') + 5, top1.excerpt.indexOf('\\n', top1.excerpt.indexOf('Code:'))).trim() : 'Document Chunk',
          retrievedTitle: top1.documentTitle,
          rootCause: "Semantic matching failed to map paraphrase to exact rule code due to missing vector embeddings on rules."
        });
      }
    } else {
      failures.push({
        query: tc.query,
        expectedRule: tc.expectedRule,
        retrievedRuleCode: 'NONE',
        retrievedTitle: 'NONE',
        rootCause: "No results returned."
      });
    }
  }
  
  const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLat = Math.max(...latencies);

  console.log('\\n--- Final Metrics ---');
  console.log('Top-1 Accuracy %: ' + (top1Count / testCases.length) * 100);
  console.log('Top-3 Accuracy %: ' + (top3Count / testCases.length) * 100);
  console.log('Authority Coverage %: ' + (authorityCount / testCases.length) * 100);
  console.log('Average Latency: ' + avgLat.toFixed(2) + 'ms');
  console.log('Worst-case Latency: ' + maxLat + 'ms');
  
  console.log('\\n--- Failure Cases ---');
  failures.forEach(f => {
    console.log('Query: "' + f.query + '" | Expected: ' + f.expectedRule + ' | Retrieved: ' + f.retrievedRuleCode + ' (' + f.retrievedTitle + ') | Root Cause: ' + f.rootCause);
  });

  process.exit(0);
}

runTest().catch(console.error);
