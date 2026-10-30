import { fileURLToPath } from 'node:url';

export type SharedDataFile =
  | 'economy.json'
  | 'loot-tables.json'
  | 'mechanics-knowledge.json'
  | 'meta.json'
  | 'tft.json'
  | 'translation-catalog.json';

export function sharedDataPath(file: SharedDataFile): string {
  return fileURLToPath(import.meta.resolve(`@tftiq/shared/data/${file}`));
}
