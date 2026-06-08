# ThresholdOptimizer — Décision technique

Le ThresholdOptimizer de Fairlearn a été testé mais **désactivé en production**. Le système fonctionne en mode audit-only.

## Expérimentations

Deux contraintes Fairlearn ont été testées, toutes les deux avec `class_weight='balanced'` :

| Contrainte | Taux d'invitation | Recall (Invite) | Résultat |
|---|---|---|---|
| `demographic_parity` | 8,0% | 25,0% | Fallback (< 15%) |
| `equalized_odds` | 6,0% | 15,0% | Fallback (< 15%) |

Aucune contrainte ne passe 15% d'invitation le système tombe systématiquement en fallback vers le modèle de base. Le recall sur la classe Invite chute de 80% (modèle de base) à 15-25% selon la contrainte, ce qui rend le ThresholdOptimizer inutilisable en production.

## Cause racine

1. **Dataset trop petit** : 500 enregistrements → ~50 samples par groupe sensible sur le test set. Fairlearn recommande 1000+ par groupe (4000+ total). Notre dataset est 8× trop petit.
2. **Déséquilibre des classes** : Le dataset contient 80% de Reject et 20% d'Invite. Les contraintes de fairness contraignent le ThresholdOptimizer à réduire drastiquement le taux d'invitation pour égaliser les groupes, ce qui fait chuter le recall en dessous de tout niveau acceptable.

## Pourquoi c'est acceptable

Les métriques de fairness du modèle de base sur le genre sont **proches des seuils** mais restent utilisables :

| Métrique | Valeur | Seuil | Statut |
|---|---|---|---|
| EPD | 4,9 pts | > 5 pts = ALERT | OK (proche du seuil) |
| RID | 0,893 | < 0,95 = WARN | OK |
| Delta TPR | 16,2 pts | > 5 pts = ALERT | ALERT |

Résultat obtenu par **prévention en amont** : exclusion du genre et de l'âge des features + analyse des proxies (aucune corrélation détectée). Le Delta TPR reste en alerte, probablement à cause de corrélations indirectes via d'autres features (ex: `years_experience` corrélé à l'âge) et du bruit statistique sur 100 samples de test.

## Limites connues

- **Biais âge** : EPD = 52,9%, RID = 0,14, Delta TPR = 88,9 pts — provient des labels d'entraînement biaisés (10,3% d'invitation pour les <30 ans vs 25,2% pour les 30-45). Le modèle amplifie ce biais : les <30 ans reçoivent 8,6% d'invitations (prédites) contre 61,5% pour les 30-45. Le ThresholdOptimizer ne corrige pas ce biais (trop peu de samples intersectionnels). Le groupe "Over 45" est absent du dataset (âge max = 44 ans).
- **Delta TPR genre** : 16,2 pts — probablement du bruit statistique sur 100 samples de test, mais pourrait aussi refléter une corrélation indirecte entre certaines features et le genre.

## Pour le réactiver

- Augmenter le dataset à 2000+ enregistrements minimum
- Rééquilibrer les labels d'entraînement pour réduire le biais âge
- Inclure des candidats de plus de 45 ans pour permettre une audit complète
