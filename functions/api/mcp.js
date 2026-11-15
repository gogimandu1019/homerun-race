// Cloudflare용 /api/mcp — 실제 동작은 api/mcp.js (Vercel과 같은 코드)
import handler from '../../api/mcp.js';
import { vercelHandler } from '../_adapter.js';

export const onRequest = vercelHandler(handler);
