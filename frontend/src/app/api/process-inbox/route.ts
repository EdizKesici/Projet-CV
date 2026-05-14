import { NextResponse } from 'next/server';
import { MOCK_BATCH_RESULT } from '@/lib/mock-data';

export async function POST() {
  // Simulate batch processing delay
  return NextResponse.json(MOCK_BATCH_RESULT);
}
