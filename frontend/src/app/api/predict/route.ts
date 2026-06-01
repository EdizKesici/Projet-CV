import { NextResponse } from 'next/server';
import { MOCK_PREDICTION, MOCK_REJECT_PREDICTION } from '@/lib/mock-data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cvText = body.text || body.cv_text || '';

    if (!cvText.trim()) {
      return NextResponse.json({ error: 'Le texte du CV est requis' }, { status: 400 });
    }

    // Simple mock logic: if text contains "reject" or "junior", return reject
    const lowerText = cvText.toLowerCase();
    const isReject = lowerText.includes('reject') || lowerText.includes('junior') || lowerText.includes('stage');

    const prediction = { ...(isReject ? MOCK_REJECT_PREDICTION : MOCK_PREDICTION) };

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
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }
}
