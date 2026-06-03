import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/filter-config - Retrieve the active filter configuration
export async function GET() {
  try {
    // Try to find the active config first, fall back to any config, then create default
    let config = await db.filterConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!config) {
      config = await db.filterConfig.findFirst({
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!config) {
      // Create default config if none exists
      config = await db.filterConfig.create({
        data: {
          name: 'default',
          requiredLanguages: '[]',
          requiredSkills: '[]',
          minEducationLevel: 2,
          minYearsExperience: 0,
          minNbPositions: 0,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      id: config.id,
      name: config.name,
      requiredLanguages: JSON.parse(config.requiredLanguages),
      requiredSkills: JSON.parse(config.requiredSkills),
      minEducationLevel: config.minEducationLevel,
      minYearsExperience: config.minYearsExperience,
      minNbPositions: config.minNbPositions,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la configuration.' },
      { status: 500 }
    );
  }
}

// PUT /api/filter-config - Update or create the filter configuration
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      requiredLanguages,
      requiredSkills,
      minEducationLevel,
      minYearsExperience,
      minNbPositions,
      isActive,
    } = body;

    // Deactivate all existing configs if this one is being activated
    if (isActive) {
      await db.filterConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    // Upsert: update if a config with this name exists, create otherwise
    const config = await db.filterConfig.upsert({
      where: { name: name || 'default' },
      update: {
        requiredLanguages: JSON.stringify(requiredLanguages || []),
        requiredSkills: JSON.stringify(requiredSkills || []),
        minEducationLevel: minEducationLevel !== undefined ? minEducationLevel : null,
        minYearsExperience: minYearsExperience !== undefined ? minYearsExperience : null,
        minNbPositions: minNbPositions !== undefined ? minNbPositions : null,
        isActive: isActive !== undefined ? isActive : true,
      },
      create: {
        name: name || 'default',
        requiredLanguages: JSON.stringify(requiredLanguages || []),
        requiredSkills: JSON.stringify(requiredSkills || []),
        minEducationLevel: minEducationLevel !== undefined ? minEducationLevel : null,
        minYearsExperience: minYearsExperience !== undefined ? minYearsExperience : null,
        minNbPositions: minNbPositions !== undefined ? minNbPositions : null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({
      id: config.id,
      name: config.name,
      requiredLanguages: JSON.parse(config.requiredLanguages),
      requiredSkills: JSON.parse(config.requiredSkills),
      minEducationLevel: config.minEducationLevel,
      minYearsExperience: config.minYearsExperience,
      minNbPositions: config.minNbPositions,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: 'Erreur lors de la sauvegarde de la configuration.' },
      { status: 500 }
    );
  }
}
