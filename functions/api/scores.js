// Cloudflare용 /api/scores — 실제 동작은 api/scores.js (Vercel과 같은 코드)
import handler from '../../api/scores.js';
import { vercelHandler } from '../_adapter.js';

export const onRequest = vercelHandler(handler);
