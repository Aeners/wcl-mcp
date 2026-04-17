import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let knowledgeData: string | null = null;

export function getKnowledgeResource(): string {
  if (!knowledgeData) {
    knowledgeData = readFileSync(join(__dirname, '..', 'data', 'wow-knowledge.md'), 'utf-8');
  }
  return knowledgeData;
}
