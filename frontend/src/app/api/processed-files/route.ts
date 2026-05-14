import { NextResponse } from 'next/server';
import { MOCK_PROCESSED_FILES } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json(MOCK_PROCESSED_FILES);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  }

  const updatedFiles = MOCK_PROCESSED_FILES.files.filter((f) => f !== filename);
  return NextResponse.json({
    success: true,
    count: updatedFiles.length,
    files: updatedFiles,
  });
}
