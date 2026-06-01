import { NextResponse } from 'next/server';
import { MOCK_SCREENING_LOG } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json(MOCK_SCREENING_LOG);
}
