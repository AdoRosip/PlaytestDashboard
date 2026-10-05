import { portalApi } from '@/lib/server/portalApi';
export function GET(request: Request) { return portalApi(request); }
