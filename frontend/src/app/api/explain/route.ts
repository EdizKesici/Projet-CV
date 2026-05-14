import { NextResponse } from 'next/server';
import { MOCK_EXPLAIN } from '@/lib/mock-data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cvText = body.cv_text || '';

    if (!cvText.trim()) {
      return NextResponse.json({ error: 'cv_text is required' }, { status: 400 });
    }

    const explain = { ...MOCK_EXPLAIN };
    const nameMatch = cvText.match(/Name:\s*(.+)/i);
    if (nameMatch) {
      explain.name = nameMatch[1].trim();
    }

    return NextResponse.json(explain);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
