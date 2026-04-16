import { NextResponse } from 'next/server';
import { getPagesGeneratedLast24Hours } from '@/lib/db-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const pagesLast24h = await getPagesGeneratedLast24Hours();
    return NextResponse.json({ pagesLast24h });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ pagesLast24h: 0 }, { status: 200 });
  }
}
