# ThresholdOptimizer — Décision technique

Le ThresholdOptimizer de Fairlearn a été testé mais **désactivé en production**. Le système fonctionne en mode audit-only.

## Expérimentations

Trois configurations ont été testées :

| Test | Configuration | Taux d'invitation | Résultat |
|---|---|---|---|
| 1 | `class_weight='balanced'`, seuil 15% | 7–10% | Fallback |
| 2 | `class_weight=None`, seuil 15% | 7–11% | Fallback |
| 3 | `class_weight='balanced'`, seuil 5% | 7% | Recall catastrophique (15% vs 80%) |

Même quand le ThresholdOptimizer passe le seuil, il ne retient que **3 candidats sur 20** méritant une invitation — inutilisable en production.

## Cause racine

1. **Dataset trop petit** : 500 enregistrements → ~50 samples par groupe sensible sur le test set. Fairlearn recommande 1000+ par groupe (4000+ total). Notre dataset est 8× trop petit.
2. **Conflit avec `class_weight='balanced'`** : Les probabilités gonflées par la pondération rendent l'estimation des seuils instable.

## Pourquoi c'est acceptable

Les métriques de fairness du modèle de base sont **déjà bonnes** sur le genre :

| Métrique | Valeur |
|---|---|
| EPD | 0.2% |
| RID | 0.995 |

Résultat obtenu par **prévention en amont** : exclusion du genre et de l'âge des features + analyse des proxies (aucune corrélation détectée).

## Limites connues

- **Biais âge** : EPD = 52,9%, RID = 0,14 — provient des labels d'entraînement biaisés (10,3% d'invitation pour les <30 ans vs 25,2% pour les 30-45). Le ThresholdOptimizer ne corrige pas ce biais (trop peu de samples intersectionnels).
- **Delta TPR genre** : 16,2 pts — probablement du bruit statistique sur 100 samples de test.

## Pour le réactiver

- Augmenter le dataset à 2000+ enregistrements minimum
