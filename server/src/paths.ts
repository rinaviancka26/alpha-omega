import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = process.env.ALPHA_OMEGA_ROOT ? path.resolve(process.env.ALPHA_OMEGA_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SATORU = path.join(REPO_ROOT, '.satoru');
export const CARD_JSON = path.join(REPO_ROOT, 'web', 'src', 'card.generated.json');
