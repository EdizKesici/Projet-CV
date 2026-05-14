import { NextResponse } from 'next/server';
import { MOCK_PARSE } from '@/lib/mock-data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cvText = body.cv_text || '';

    if (!cvText.trim()) {
      return NextResponse.json({ error: 'cv_text is required' }, { status: 400 });
    }

    const parsed = { ...MOCK_PARSE };
    const nameMatch = cvText.match(/Name:\s*(.+)/i);
    if (nameMatch) {
      parsed.name = nameMatch[1].trim();
    }

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
