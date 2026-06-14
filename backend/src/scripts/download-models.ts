import { pipeline, env } from '@xenova/transformers';
import * as path from 'node:path';
import * as fs from 'node:fs';

const cacheDir = path.resolve(__dirname, '../../data/models');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

env.cacheDir = cacheDir;
env.allowLocalModels = true;
env.allowRemoteModels = true;

async function downloadModels() {
  console.log('Downloading Xenova/yolos-tiny...');
  await pipeline('object-detection', 'Xenova/yolos-tiny');
  console.log('Successfully cached yolos-tiny');

  console.log('Downloading Xenova/resnet-50...');
  await pipeline('image-classification', 'Xenova/resnet-50');
  console.log('Successfully cached resnet-50');
}

downloadModels().catch(console.error);
