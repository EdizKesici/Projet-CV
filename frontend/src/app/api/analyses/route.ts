import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/analyses - Retrieve all saved analyses
export async function GET() {
  try {
    const analyses = await db.cvAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json(analyses);
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la récupération des analyses.' }, { status: 500 });
  }
}

// POST /api/analyses - Save a new analysis result
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      candidateName,
      targetRole,
      filename,
      stage,
      label,
      confidence,
      modelName,
      fairnessAdjusted,
      topDriver,
      reasons,
      probabilitiesInvite,
      probabilitiesReject,
      shapValues,
      features,
      hardFilterReasons,
      decisionDrivers,
      version,
    } = body;

    if (!candidateName || !label) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const analysis = await db.cvAnalysis.create({
      data: {
        candidateName,
        targetRole: targetRole || '',
        filename: filename || '',
        stage: stage || 'ml_model',
        label,
        confidence: confidence || 0,
        modelName: modelName || '',
        fairnessAdjusted: fairnessAdjusted || false,
        topDriver: topDriver || '',
        reasons: reasons || '',
        probabilitiesInvite: probabilitiesInvite || 0,
        probabilitiesReject: probabilitiesReject || 0,
        shapValues: typeof shapValues === 'object' ? JSON.stringify(shapValues) : (shapValues || '{}'),
        features: typeof features === 'object' ? JSON.stringify(features) : (features || '{}'),
        hardFilterReasons: Array.isArray(hardFilterReasons) ? JSON.stringify(hardFilterReasons) : (hardFilterReasons || '[]'),
        decisionDrivers: decisionDrivers || '',
        version: version || 'V2',
      },
    });

    return NextResponse.json(analysis, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde de l\'analyse.' }, { status: 500 });
  }
}

// DELETE /api/analyses - Delete all analyses
export async function DELETE() {
  try {
    await db.cvAnalysis.deleteMany();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  }
}
