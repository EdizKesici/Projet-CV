// PDF Export utility for LuxTalent CV Analysis Reports
import jsPDF from 'jspdf';
import type { PredictionResponse } from './types';

const BRAND_COLOR: [number, number, number] = [16, 185, 129]; // emerald-500
const DARK_COLOR: [number, number, number] = [30, 41, 59]; // slate-800
const MUTED_COLOR: [number, number, number] = [100, 116, 139]; // slate-500

export function exportAnalysisPDF(
  result: PredictionResponse,
  filename: string,
  analysisDuration: number | null,
  notes?: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // ── Header bar ──
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('LuxTalent Advisory', margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Rapport d\'analyse CV — V2', margin, 21);

  doc.setFontSize(8);
  doc.text(new Date().toLocaleString('fr-FR'), pageWidth - margin, 21, { align: 'right' });

  y = 38;

  // ── Candidate Section ──
  const isInvite = result.label === 'Invite';
  const decisionColor: [number, number, number] = isInvite ? [16, 185, 129] : [239, 68, 68];
  const decisionLabel = isInvite ? 'INVITÉ' : 'REJETÉ';

  // Decision badge
  doc.setFillColor(...decisionColor);
  doc.roundedRect(margin, y, 50, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(decisionLabel, margin + 25, y + 7, { align: 'center' });

  // Confidence
  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(11);
  doc.text(`Confiance : ${result.confidence.toFixed(1)}%`, margin + 56, y + 7);

  y += 18;

  // Candidate info
  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(result.name, margin, y);

  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`Poste cible : ${result.target_role}`, margin, y);
  y += 5;
  doc.text(`Étape : ${result.stage === 'hard_filter' ? 'Filtre éliminatoire' : 'Modèle ML'}`, margin, y);
  y += 5;
  doc.text(`Ajustement d'équité : ${result.fairness_adjusted ? 'Oui' : 'Non'}`, margin, y);
  y += 5;
  doc.text(`Modèle : ${result.model_name} (${result.version})`, margin, y);
  y += 5;
  doc.text(`Fichier : ${filename}`, margin, y);

  y += 10;

  // ── Probabilities Section ──
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Probabilités', margin, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  // Invite bar
  const barMaxWidth = contentWidth - 30;
  const inviteWidth = (result.probabilities.Invite / 100) * barMaxWidth;
  const rejectWidth = (result.probabilities.Reject / 100) * barMaxWidth;

  doc.setTextColor(16, 185, 129);
  doc.text('Invite', margin, y);
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + 20, y - 3.5, inviteWidth, 5, 1, 1, 'F');
  doc.setTextColor(...DARK_COLOR);
  doc.text(`${result.probabilities.Invite.toFixed(1)}%`, margin + 22 + inviteWidth, y);
  y += 8;

  doc.setTextColor(239, 68, 68);
  doc.text('Reject', margin, y);
  doc.setFillColor(239, 68, 68);
  doc.roundedRect(margin + 20, y - 3.5, rejectWidth, 5, 1, 1, 'F');
  doc.setTextColor(...DARK_COLOR);
  doc.text(`${result.probabilities.Reject.toFixed(1)}%`, margin + 22 + rejectWidth, y);
  y += 12;

  // ── SHAP Section ──
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setTextColor(...DARK_COLOR);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Facteurs de la décision (SHAP)', margin, y);
  y += 7;

  const shapEntries = Object.entries(result.explanation.shap_values)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const SHAP_LABELS: Record<string, string> = {
    'Age': 'Âge',
    'Years of Experience': "Années d'expérience",
    'Education Level': "Niveau d'éducation",
    'Certifications': 'Certifications',
    'Extra Languages': 'Langues suppl.',
    'Extra Skills': 'Compétences suppl.',
    'Management Experience': 'Exp. management',
    'International Experience': 'Exp. internationale',
  };

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const maxShapAbs = Math.max(...shapEntries.map(([, v]) => Math.abs(v)), 0.1);
  const shapBarMax = contentWidth * 0.5;

  shapEntries.forEach(([feat, val]) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    const frenchLabel = SHAP_LABELS[feat] || feat;
    const isPositive = val >= 0;
    const barWidth = (Math.abs(val) / maxShapAbs) * shapBarMax;
    const barColor: [number, number, number] = isPositive ? [16, 185, 129] : [239, 68, 68];

    doc.setTextColor(...MUTED_COLOR);
    doc.text(frenchLabel, margin, y);

    // Bar
    const barX = margin + 45;
    doc.setFillColor(...barColor);
    if (isPositive) {
      doc.roundedRect(barX, y - 3, barWidth, 4, 1, 1, 'F');
    } else {
      doc.roundedRect(barX - barWidth, y - 3, barWidth, 4, 1, 1, 'F');
    }

    // Value
    doc.setTextColor(...DARK_COLOR);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${val > 0 ? '+' : ''}${val.toFixed(4)}`,
      barX + shapBarMax + 5,
      y
    );
    doc.setFont('helvetica', 'normal');

    y += 6;
  });

  y += 4;

  // Decision drivers
  if (result.explanation.decision_drivers && y < 250) {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setTextColor(...DARK_COLOR);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Explication', margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_COLOR);
    const driversLines = doc.splitTextToSize(result.explanation.decision_drivers, contentWidth);
    doc.text(driversLines, margin, y);
    y += driversLines.length * 4 + 4;
  }

  // ── Hard filter reasons ──
  if (result.hard_filter_reasons && result.hard_filter_reasons.length > 0 && y < 250) {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setTextColor(217, 119, 6); // amber
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Filtres éliminatoires', margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    result.hard_filter_reasons.forEach((reason) => {
      doc.text(`• ${reason}`, margin + 3, y);
      y += 5;
    });
  }

  // ── Notes ──
  if (notes && y < 250) {
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setTextColor(180, 83, 9); // amber-700
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes RH', margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_COLOR);
    const noteLines = doc.splitTextToSize(notes, contentWidth);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4;
  }

  // ── Duration ──
  if (analysisDuration !== null && y < 260) {
    y += 4;
    doc.setTextColor(...MUTED_COLOR);
    doc.setFontSize(7);
    doc.text(`Durée d'analyse : ${(analysisDuration / 1000).toFixed(1)}s`, margin, y);
  }

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  doc.setFontSize(7);
  doc.setTextColor(...MUTED_COLOR);
  doc.text('LuxTalent Advisory Group — Rapport généré automatiquement', margin, footerY);
  doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, footerY, { align: 'right' });

  // Save
  const pdfName = `analyse-${result.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(pdfName);
}
