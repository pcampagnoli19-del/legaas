import { toNextJsHandler } from 'better-auth/next-js';
import type { NextRequest } from 'next/server';
import { getAuth } from '@/server/auth/config';

export async function GET(request: NextRequest) {
  const handler = toNextJsHandler(getAuth());
  return handler.GET(request);
}

export async function POST(request: NextRequest) {
  const handler = toNextJsHandler(getAuth());
  return handler.POST(request);
}
