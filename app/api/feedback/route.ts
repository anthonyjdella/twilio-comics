import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createFeedback } from '@/lib/db-actions';

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  const body = await request.json();
  const message = body?.message?.trim();

  if (!message || message.length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  if (message.length > 2000) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  }

  await createFeedback({ message, userId: userId ?? undefined });

  return NextResponse.json({ success: true });
}
