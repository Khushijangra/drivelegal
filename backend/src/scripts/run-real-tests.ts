import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyzeRoadImage, initVisionModels } from '../services/vision';

const TEST_IMAGES = [
  { name: 'helmet_present', url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500&q=80' },
  { name: 'helmet_absent', url: 'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=500&q=80' },
  { name: 'seatbelt_present', url: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?w=500&q=80' },
  { name: 'seatbelt_absent', url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&q=80' },
  { name: 'pothole', url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=500&q=80' },
  { name: 'road_damage', url: 'https://images.unsplash.com/photo-1584464457692-23c21a117b3f?w=500&q=80' },
  { name: 'motorcycle_rider', url: 'https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=500&q=80' },
  { name: 'car_driver', url: 'https://images.unsplash.com/photo-1511252199320-c9a17387cc2d?w=500&q=80' },
  { name: 'traffic_scene', url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=500&q=80' },
  { name: 'empty_road', url: 'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=500&q=80' }
];

async function downloadAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${buffer.toString('base64')}`;
}

async function runTests() {
  console.log('Initializing models in OFFLINE mode...');
  await initVisionModels();

  const reportFile = path.resolve(__dirname, '../../../vision_evidence_output.md');
  fs.writeFileSync(reportFile, '# Real Image Inference Evidence\n\n');

  for (const img of TEST_IMAGES) {
    try {
      console.log(`Testing ${img.name}...`);
      const base64 = await downloadAsBase64(img.url);
      const start = Date.now();
      const result = await analyzeRoadImage(base64, img.name);
      const latency = Date.now() - start;

      const md = `
### Test: ${img.name}
- **Latency**: ${latency} ms
- **Violations Detected**: ${result.violations.length}
- **Summary**: ${result.summary}
- **Details**:
\`\`\`json
${JSON.stringify(result.violations, null, 2)}
\`\`\`
- **Stage 1 Detections**: ${result.rawDetections.length} objects.
`;
      fs.appendFileSync(reportFile, md);
    } catch (e: any) {
      fs.appendFileSync(reportFile, `### Test: ${img.name}\n**Error**: ${e.message}\n`);
    }
  }

  console.log('Done running tests! Report saved.');
}

runTests().catch(console.error);
