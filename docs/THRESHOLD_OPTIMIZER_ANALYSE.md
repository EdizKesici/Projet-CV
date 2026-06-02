# Analyse du ThresholdOptimizer (Fairlearn) — Décision technique

## Contexte

Le système AuxTalent Advisory utilise un pipeline ML fairness-aware (V2.2) incluant un **ThresholdOptimizer** de la bibliothèque Fairlearn. Ce post-traitement ajuste les seuils de décision par groupe sensible (genre) pour garantir l'équité des prédictions. Ce document détaille les expérimentations menées et la décision technique qui en a résulté.

---

## Ce qu'est le ThresholdOptimizer

Le ThresholdOptimizer est un algorithme de post-traitement qui fonctionne après l'entraînement du modèle de base. Plutôt que d'utiliser un seuil unique (ex: 0.45) pour tous les candidats, il détermine des **seuils spécifiques par groupe** (ex: un seuil pour les femmes, un autre pour les hommes) de manière à satisfaire une contrainte de fairness :

- **`demographic_parity`** : le taux d'invitation doit être égal entre les groupes
- **`equalized_odds`** : le taux de vrais positifs ET le taux de faux positifs doivent être égaux entre les groupes

---

## Expérimentations menées

### Configuration du dataset

| Paramètre | Valeur |
|---|---|
| Nombre total d'enregistrements | 500 |
| Split train/test | 80/20 (400/100) |
| Distribution des labels | 80% Reject / 20% Invite |
| Attribut sensible | Gender (2 groupes : Male=267, Female=233) |
| Samples par groupe (test) | ~50 |

### Test 1 — Configuration originale (`class_weight='balanced'`, `INVITE_RATE_FLOOR=0.15`)

Le ThresholdOptimizer avec `demographic_parity` produit un taux d'invitation de **7%**, en dessous du seuil plancher de 15%. Avec `equalized_odds`, le taux est de **10%**, toujours insuffisant. Le système tombe en fallback vers le modèle de base sans post-traitement.

### Test 2 — Sans `class_weight='balanced'` (`class_weight=None`, `INVITE_RATE_FLOOR=0.15`)

Le modèle de base sans pondération produit un taux d'invitation de **11%** (trop bas). Le ThresholdOptimizer aggrave encore la situation : 7% pour `demographic_parity` et 9% pour `equalized_odds`. Le fallback se déclenche à nouveau.

### Test 3 — Avec `class_weight='balanced'`, seuil abaissé (`INVITE_RATE_FLOOR=0.05`)

Le ThresholdOptimizer avec `demographic_parity` passe le seuil à 5% avec un taux d'invitation de **7%**. Cependant, les performances sont catastrophiques :

| Métrique | Modèle de base | Avec ThresholdOptimizer |
|---|---|---|
| Taux d'invitation | 43% | 7% |
| Recall (Invite) | 80% | 15% |
| Vrais positifs (sur 20) | 16 | 3 |
| F1 Invite | 0.508 | 0.222 |

Le modèle ne retient que **3 candidats sur 20** qui mériteraient une invitation. Ce comportement est inutilisable en production.

---

## Cause racine de l'échec

Le ThresholdOptimizer échoue pour deux raisons combinées :

### 1. Dataset trop petit

Avec 500 enregistrements et un split 80/20, le jeu de test ne contient que **~50 samples par groupe sensible**. Le ThresholdOptimizer estime des seuils de décision par groupe à partir de ces données. Avec si peu d'observations, les seuils estimés sont **instables et extrêmes** — il bascule vers un conservatisme excessif (rejeter presque tout le monde) car c'est le moyen le plus simple de satisfaire la contrainte de fairness.

Pour un fonctionnement fiable du ThresholdOptimizer, la documentation Fairlearn recommande **au minimum 1000+ samples par groupe**, soit un dataset de **4000+ enregistrements** pour 2 groupes. Notre dataset est 8 fois trop petit.

### 2. Conflit avec `class_weight='balanced'`

Le paramètre `class_weight='balanced'` compense le déséquilibre 4:1 (Reject/Invite) en gonflant artificiellement les probabilités d'invitation. Le modèle de base passe de ~20% à ~43% d'invitation. Le ThresholdOptimizer reçoit ces probabilités gonflées et cherche à égaliser les taux par groupe, mais la distorsion initiale rend l'estimation des seuils encore plus instable.

---

## Décision technique : mode audit-only

Le ThresholdOptimizer est **désactivé** en production. Le système fonctionne en **mode audit-only** avec `INVITE_RATE_FLOOR = 0.15`, ce qui provoque le fallback automatique vers le modèle de base.

### Justification

Les métriques de fairness du modèle de base sont **déjà bonnes** sur l'attribut genre :

| Métrique | Valeur | Statut |
|---|---|---|
| EPD (Écart Parité Démographique) | 0.2% | OK |
| RID (Ratio Impact Disparate) | 0.995 | OK |
| Delta TPR | 16.2 pts | Alert |

L'EPD de 0.2% signifie que l'écart de taux d'invitation entre hommes et femmes est quasi nul. Le RID de 0.995 est très proche de la parité parfaite (1.0). Ces bons résultats s'expliquent par la **prévention en amont** :

1. **Exclusion du genre des features** (depuis la V2) — le modèle ne peut pas utiliser le genre pour prendre sa décision
2. **Exclusion de l'âge des features** (depuis la V2.1) — élimination de la discrimination directe par l'âge
3. **Analyse des proxies** — vérification qu'aucune feature restante n'est corrélée au genre (résultat : aucune corrélation significative détectée)

### Limites documentées

- **Biais âge** : Le modèle de base présente un biais important sur l'âge (EPD = 52.9%, RID = 0.14 entre les groupes "Under 30" et "30-45"). Ce biais provient des **labels d'entraînement** (taux d'invitation de 10.3% pour les Under 30 vs 25.2% pour les 30-45), ce qui suggère un biais historique dans les décisions de recrutement. Le ThresholdOptimizer ne corrige pas ce biais car les groupes d'âge intersectionnels ont trop peu de samples pour une estimation fiable.
- **Delta TPR genre** : L'alerte sur le Delta TPR (16.2 pts) indique une différence de taux de vrais positifs entre genres. Sur un test set de 100 samples, cette métrique est bruitée et pourrait ne pas refléter un biais réel en production.

---

## Recommandations futures

1. **Augmenter le dataset** : Avec 2000+ enregistrements, le ThresholdOptimizer pourrait fonctionner de manière fiable et être réactivé.
2. **Envisager ExponentiatedGradient** : Cet algorithme de Fairlearn fait un compromis progressif entre performance et fairness, mais nécessite une réécriture significative du pipeline de prédiction (pas de `predict_proba`, impact sur SHAP et le calcul de confiance).
3. **Correction des labels** : Le biais âge dans les labels d'entraînement devrait être investigué et potentiellement corrigé (re-weighting, ré-étiquetage) avant tout ré-entraînement.
4. **Monitoring continu** : Les métriques de fairness du dashboard restent actives et permettent de surveiller les dérives en production.
