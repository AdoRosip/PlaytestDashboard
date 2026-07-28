import type { NextRequest } from 'next/server';
import { requireDashboardAuth } from '@/lib/server/requestAuth';

export function proxy(request: NextRequest) {
  return requireDashboardAuth(request) ?? undefined;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
