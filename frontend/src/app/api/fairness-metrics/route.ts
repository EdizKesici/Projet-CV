import { NextResponse } from 'next/server';
import { MOCK_FAIRNESS_METRICS } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json(MOCK_FAIRNESS_METRICS);
}
