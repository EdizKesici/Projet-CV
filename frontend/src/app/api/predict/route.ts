import { NextResponse } from 'next/server';
import { MOCK_PREDICTION } from '@/lib/mock-data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cvText = body.cv_text || '';

    if (!cvText.trim()) {
      return NextResponse.json({ error: 'cv_text is required' }, { status: 400 });
    }

    // Return mock prediction with slight variation based on input
    const prediction = { ...MOCK_PREDICTION };

    // Try to extract name from text
    const nameMatch = cvText.match(/Name:\s*(.+)/i);
    if (nameMatch) {
      prediction.name = nameMatch[1].trim();
    }

    const roleMatch = cvText.match(/Target Role:\s*(.+)/i);
    if (roleMatch) {
      prediction.target_role = roleMatch[1].trim();
    }

    return NextResponse.json(prediction);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
