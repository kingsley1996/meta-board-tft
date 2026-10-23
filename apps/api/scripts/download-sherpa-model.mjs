import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = 'ad6f873b5f5b6ed083821253a88d81afed2505c4';
const modelDirectory = fileURLToPath(new URL('../models/sherpa-vi/', import.meta.url));
const modelFiles = [
  {
    name: 'encoder-epoch-20-avg-10.int8.onnx',
    size: 27_699_063,
    sha256: '8ef5286dd427eb108055c2ddc1982aa31e544706072d5ea228729292dacade68',
  },
  {
    name: 'decoder-epoch-20-avg-10.int8.onnx',
    size: 1_308_690,
    sha256: 'b491630c33e76146b7296ab68cee5ae3a8d572732d36a552ee231d4419e06d32',
  },
  {
    name: 'joiner-epoch-20-avg-10.int8.onnx',
    size: 1_033_417,
    sha256: '7311d2e17b810ecea515d79c71cc4668af8759256a06fa01d27047772320c821',
  },
  {
    name: 'config.json',
    size: 23_238,
    sha256: 'ca8171f8bbd516c050b627582f2125c8f5f1f6ed967ab41b0fa9aae2cf61b492',
  },
];

await mkdir(modelDirectory, { recursive: true });

for (const file of modelFiles) {
  const target = path.join(modelDirectory, file.name);
  const temporary = `${target}.partial`;
  try {
    const existing = await stat(target);
    if (existing.size === file.size) {
      const contents = await readFile(target);
      if (!('sha256' in file) || createHash('sha256').update(contents).digest('hex') === file.sha256) continue;
    }
  } catch {
    // Download missing model files.
  }

  const url = `https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h/resolve/${version}/${file.name}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model download failed for ${file.name}: HTTP ${response.status}`);
  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.byteLength !== file.size) {
    throw new Error(`Unexpected size for ${file.name}: got ${contents.byteLength}, expected ${file.size}`);
  }
  if ('sha256' in file && createHash('sha256').update(contents).digest('hex') !== file.sha256) {
    throw new Error(`SHA-256 verification failed for ${file.name}`);
  }
  await writeFile(temporary, contents);
  await rename(temporary, target);
  console.log(`Downloaded and verified ${file.name}`);
}
