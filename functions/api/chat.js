// Cloudflare용 /api/chat — 실제 동작은 api/chat.js (Vercel과 같은 코드)
import handler from '../../api/chat.js';
import { vercelHandler } from '../_adapter.js';

export const onRequest = vercelHandler(handler);
