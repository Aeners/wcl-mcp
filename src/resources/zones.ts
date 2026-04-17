import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let zonesData: string | null = null;

export function getZonesResource(): string {
  if (!zonesData) {
    zonesData = readFileSync(join(__dirname, '..', 'data', 'zones.json'), 'utf-8');
  }
  return zonesData;
}
