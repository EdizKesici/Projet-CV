# Évolution V1 vers V2 — LuxTalent Advisory

Ce document synthétise les changements entre la version 1 (Work Package 1) et la version 2 (Work Package 2) du système de pré-sélection automatique de CV.

La V2 est une refonte centrée sur l'éthique, l'explicabilité et la transparence, tout en ajoutant une interface utilisateur complète et une persistance des données.

---

## 1. Extraction de features

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Features ML | 9 (dont `gender` + `age`) | 7 (`gender` et `age` exclus) | Suppression de la discrimination directe — RGPD art. 9, attributs protégés |
| `gender` et `age` | Utilisés par le modèle | Métadonnées d'audit uniquement | Toujours extraits du CV pour l'audit fairness, mais jamais injectés dans la prédiction |
| `nb_positions` | Feature ML | Retiré | Redondant avec `years_experience` |
| Détection des langues | Basique | Améliorée | Meilleure couverture des formats de CV multilingues |

---

## 2. Pipeline Machine Learning

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Hyperparamètres | GridSearchCV (C, penalty) | GridSearchCV + C=0.5, L2 fixé | Meilleur compromis performance/régularisation identifié |
| Fairness | Aucun | Audit EPD, RID, Delta-TPR + analyse proxy | Détection et surveillance des biais résiduels |
| Explicabilité | Aucune | SHAP LinearExplainer | Conformité AI Act art. 13 — chaque décision doit être explicable |
| Artefacts | model.pkl, scaler.pkl, model_meta.pkl | + shap_explainer.pkl, fairness_metrics.pkl, model_v1/ | SHAP pré-calculé + métriques de fairness persistées + référence V1 |
| Plots de diagnostic | 5 | 9 | + fairness, proxy, SHAP, âge |
| Dépendances | 7 packages | 10 packages (+ fairlearn, shap, scipy) | Bibliothèques nécessaires à l'audit et l'explicabilité |

---

## 3. API REST

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Endpoints | 6 | 9 | + /explain, /fairness-metrics, /screening-log |
| Réponse /predict | label, confidence, probabilities | + fairness_adjusted, explanation (SHAP) | Transparence de la décision et factors contributeurs |
| /health | status, model_ready | + model_name, fairness_enabled, version | Supervision enrichie pour le monitoring |

---

## 4. Base de données et persistance

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Stockage | CSV uniquement (éphémère) | Supabase PostgreSQL (cloud persistant) | Les données survivent aux redéploiements Railway |
| Tables | Aucune | CvAnalysis, FilterConfig | Historique des analyses + configuration du hard filter |
| Logging CSV | 9 colonnes | + fairness_adjusted, top_driver | Traçabilité de l'ajustement fairness et des drivers SHAP |

---

## 5. Authentification

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Accès | Libre (aucune protection) | NextAuth JWT (mot de passe, session 24h) | Données sensibles (CV, décisions) — accès réservé aux recruteurs |

---

## 6. Interface utilisateur

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Frontend | Aucun | Dashboard Next.js 16 | Les recruteurs ont besoin d'une interface pour utiliser le système |
| Upload CV | Via fichier texte + watcher | Drag & drop dans le navigateur | Expérience utilisateur professionnelle |
| Visualisation SHAP | Aucune | Waterfall chart interactif | Compréhension intuitive des facteurs de décision |
| Audit fairness | Aucune | Jauges EPD/RID/Delta-TPR + historique | Supervision continue des métriques d'équité |
| Export PDF | Aucun | Rapport PDF générable | Partage des résultats avec les équipes RH |

---

## 7. Déploiement

| Aspect | V1 | V2 | Justification |
|---|---|---|---|
| Local | Docker Compose (api + watcher) | Docker Compose (api + frontend) | Le watcher est remplacé par le frontend pour le traitement des CV |
| Production | Non déployé | Railway (2 services) | Mise en production réelle avec réseau interne entre frontend et API |
| Watcher | Daemon de polling du dossier inbox | Supprimé | Remplacé par l'upload via le frontend — plus besoin de surveiller un dossier |

---

## 8. Conformité réglementaire

La V1 ne prenait en compte aucune considération éthique ou réglementaire. La V2 intègre la conformité au cadre européen (AI Act, RGPD) et aux principes AI4People, notamment via l'exclusion des attributs protégés du modèle, l'explicabilité systématique, la traçabilité des décisions et la surveillance des biais.
