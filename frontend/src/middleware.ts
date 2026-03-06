import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/@vite/client') {
    return new NextResponse('', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/@vite/client'],
};
