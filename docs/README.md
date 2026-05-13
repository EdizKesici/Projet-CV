# Documentation Technique V2 — Systeme de Pre-Selection Automatisee de CV
**LuxTalent Advisory Group S.A.**
Work Package 2 — Fairness Audit, Ethical Reflection and Model Redesign

---

## Table des matieres

1. [Presentation du systeme V2](#1-presentation-du-systeme-v2)
2. [Changements V1 -> V2](#2-changements-v1--v2)
3. [Architecture globale V2](#3-architecture-globale-v2)
4. [Structure du projet](#4-structure-du-projet)
5. [Flux de donnees V2](#5-flux-de-donnees-v2)
6. [Extraction de features (V2)](#6-extraction-de-features-v2)
7. [Pipeline ML V2](#7-pipeline-ml-v2)
8. [Audit de fairness](#8-audit-de-fairness)
9. [Explicabilite SHAP](#9-explicabilite-shap)
10. [API REST V2 — Endpoints](#10-api-rest-v2--endpoints)
11. [Comparaison V1 vs V2](#11-comparaison-v1-vs-v2)
12. [Lancement du projet](#12-lancement-du-projet)

---

## 1. Presentation du systeme V2

La V2 est une refonte critique du systeme de pre-selection automatisee de CV. Elle ne remplace pas la V1, mais l'eprend et l'ameliorne en integrant des mecanismes de fairness, d'explicabilite et de transparence, conformement au Work Package 2.

### Objectifs V2

- **Supprimer la discrimination directe** : retrait de la feature `gender` du modele ML
- **Corriger la discrimination indirecte** : Fairlearn ThresholdOptimizer (post-traitement)
- **Rendre les decisions explicables** : SHAP (SHapley Additive exPlanations)
- **Auditer les disparites** : metriques EPD, RID, Delta-TPR
- **Detecter les proxies** : analyse de correlation entre gender et features
- **Satisfaire le cadre reglementaire** : AI Act (art. 9, 10, 12, 13, 43), RGPD (art. 9)

### Cadre reglementaire

| Reglementation | Articles | Application |
|---|---|---|
| **AI Act** | Art. 10 | Gouvernance des donnees — detecter et corriger les biais |
| **AI Act** | Art. 9 | Gestion des risques tout au long du cycle de vie |
| **AI Act** | Art. 12-13 | Tracabilite et transparence des decisions |
| **AI Act** | Art. 43 | Intervention humaine sur les decisions |
| **RGPD** | Art. 9 | Genre comme donnee sensible — interdiction dans les decisions automatisees |
| **Dir. 2006/54/CE** | Art. 2 | Discrimination indirecte (RID) |

### Principes ethiques AI4People

- **Bienfaisance** : promouvoir le bien-etre
- **Non-malfaisance** : ne pas nuire (vie privee, securite)
- **Autonomie** : droit humain de decider
- **Justice** : equite, lutte contre les discriminations
- **Explicabilite** : intelligibilite et redevabilite

---

## 2. Changements V1 -> V2

| Composant | V1 | V2 |
|---|---|---|
| **FEATURE_COLUMNS** | 9 features (incluant `gender`) | 8 features (`gender` exclu) |
| **Feature extractor** | `gender` = feature ML | `gender` = metadonnee (audit uniquement) |
| **Post-traitement** | Seuil fixe (0.45) | ThresholdOptimizer (equalized_odds) |
| **Explicabilite** | Aucune | SHAP LinearExplainer |
| **Audit fairness** | Aucun | EPD, RID, Delta-TPR, analyse proxy |
| **API endpoints** | 5 endpoints | 7 endpoints (+ `/explain`, `/fairness-metrics`) |
| **Plots** | 5 plots | 8 plots (+ fairness, proxy, SHAP) |
| **Artifacts sauvegardes** | model.pkl, scaler.pkl, model_meta.pkl | + threshold_optimizer.pkl, shap_explainer.pkl, fairness_metrics.pkl |
| **requirements.txt** | 6 packages | 9 packages (+ fairlearn, shap, scipy) |

---

## 3. Architecture globale V2

```
                         +---------------------------+
                         |     Docker Compose        |
                         +---------------------------+
                         |                           |
  +----------+   HTTP    |   +-------------------+   |
  |   n8n    | --------> |   | Flask API (V2)    |   |
  | (5678)   |   POST    |   | (8000)            |   |
  |          | <-------- |   |                   |   |
  | Workflow |   JSON    |   | feature_extractor |   |
  |          |           |   | hard_filter       |   |
  +----+-----+           |   | ml/predict (V2)   |   |
       |                 |   | ml/audit (V2)     |   |
       |                 |   | ml/explain (V2)   |   |
       v                 |   +-------------------+   |
  +----------+           |                           |
  | Watcher  |           |   Volume: /app/data       |
  | daemon   |           |   inbox/ processed/       |
  | (V2)     |           |   output/ screening_log   |
  +----------+           +---------------------------+
```

---

## 4. Structure du projet

```
project-files/
|
+-- docker-compose.yml
+-- Dockerfile
|
+-- data/
|   +-- input_CVs/          <- CVs a traiter
|   +-- training_data/
|       +-- CVs/            <- 500 CVs d'entrainement
|       +-- student_labels.csv
|       +-- cv_features_labeled.csv
|
+-- docs/
|   +-- README.md           <- Cette documentation
|   +-- WORK PACKAGE 1.pdf
|   +-- WORK PACKAGE 2.pdf
|   +-- diagram.bpmn
|   +-- diagram.svg
|
+-- src/python/
    +-- app.py               <- API Flask V2 (7 endpoints)
    +-- feature_extractor.py <- Extraction des features (gender = metadonnee)
    +-- hard_filter.py       <- Filtre eliminatoire
    +-- logger.py            <- Journalisation CSV (V2: + fairness_adjusted, top_driver)
    +-- main.py              <- Point d'entree unifie V2
    +-- prepare_training_data.py
    +-- registry.py          <- Deduplication SHA-256
    +-- watcher.py           <- Demon inbox (V2)
    +-- requirements.txt     <- V2: + fairlearn, shap, scipy
    +-- ml/
    |   +-- train.py         <- Entrainement V2 (sans gender + ThresholdOptimizer + SHAP)
    |   +-- predict.py       <- Prediction V2 (ThresholdOptimizer + SHAP)
    |   +-- audit.py         <- NOUVEAU: Metriques de fairness (EPD, RID, Delta-TPR)
    |   +-- explain.py       <- NOUVEAU: Module SHAP d'explicabilite
    |   +-- model/           <- Artifacts (model, scaler, meta, threshold_opt, shap, fairness)
    |   +-- plots/           <- 8 graphiques de diagnostic
    +-- tests/
        +-- test_all.py      <- Tests unitaires V2
```

---

## 5. Flux de donnees V2

```
CV (.txt)
    |
    v
[feature_extractor.extract_features()]
    |
    |--> Features ML (8 features, SANS gender)
    |--> gender = metadonnee (0=F, 1=M, -1=inconnu)
    |
    v
[hard_filter.apply()]
    |
    |--> Si REJETE: label = "Reject", stage = "hard_filter"
    |--> Si ACCEPTE:
    |
    v
[ml/predict.predict(features, explain=True)]
    |
    |--> 1. RobustScaler.transform(features ML)
    |--> 2. model.predict_proba() -> probabilite
    |--> 3. ThresholdOptimizer.predict(sensitive_features=gender) -> decision equitable
    |--> 4. SHAP explainer.shap_values() -> contribution de chaque feature
    |
    v
Resultat V2:
{
    "label": "Invite" | "Reject",
    "confidence": float,
    "probabilities": {"Invite": float, "Reject": float},
    "fairness_adjusted": True,
    "explanation": {
        "base_value": float,
        "shap_values": {"Age": 0.05, "Years of Experience": 0.23, ...},
        "top_features": [("Years of Experience", +0.23), ...],
        "decision_drivers": "The main factors for this decision are: ..."
    }
}
```

---

## 6. Extraction de features (V2)

### Features ML (8 — gender exclu)

| Feature | Type | Description |
|---|---|---|
| `age` | int | Age calcule depuis la date de naissance |
| `years_experience` | float | Somme des durees d'emploi en annees |
| `education_level` | int (1-5) | Niveau de diplome |
| `nb_certifications` | int | Nombre de certifications |
| `nb_extra_languages` | int | Langues au-dela de l'anglais |
| `nb_extra_skills` | int | Nombre total de competences |
| `has_management_experience` | int (0/1) | Experience de management detectee |
| `has_international_experience` | int (0/1) | Experience internationale detectee |

### Metadonnees (non ML)

| Feature | Type | Description |
|---|---|---|
| `gender` | int (0/1/-1) | 0=Female, 1=Male, -1=inconnu — **V2: metadonnee uniquement** |
| `filename` | string | Nom du fichier source |
| `name` | string | Nom du candidat |
| `target_role` | string | Poste vise |
| `languages_list` | list | Noms des langues (hard filter) |
| `skills_list` | list | Noms des competences (hard filter) |

---

## 7. Pipeline ML V2

### Etape 1 : Suppression de gender des features ML

La feature `gender` est retiree de `FEATURE_COLUMNS` dans `train.py` et `predict.py`. Elle reste extraite par `feature_extractor.py` comme metadonnee pour l'audit et le ThresholdOptimizer.

### Etape 2 : Fairlearn ThresholdOptimizer

Algorithme de post-traitement qui ajuste les seuils de decision pour satisfaire une contrainte de fairness (equalized_odds), sans reentrainer le modele.

**Processus :**
1. Entrainement du modele de base SANS gender
2. Fitting du ThresholdOptimizer sur les predictions + labels + genre (ensemble d'entrainement)
3. A l'inference : le modele produit une probabilite, le ThresholdOptimizer applique le seuil optimal par groupe

### Hyperparametres

- **Modele** : Logistic Regression, RobustScaler, class_weight="balanced"
- **Selection** : GridSearchCV (5-fold, F1 metric)
- **Seuil de base** : 0.45
- **Contrainte fairness** : equalized_odds (equilibre TPR et FPR entre groupes)

---

## 8. Audit de fairness

### Metriques calculees

| Metrique | Formule | Seuil d'alerte | Reference |
|---|---|---|---|
| **EPD** (Ecart de Parite Demographique) | \|P(Invite\|H) - P(Invite\|F)\| | > 5 points | AI Act, consid. 27 |
| **RID** (Ratio d'Impact Differentiel) | P(Invite\|F) / P(Invite\|H) | < 0.8 | Dir. 2006/54/CE, AI Act art. 10 |
| **Delta TPR** (Egalite des Chances) | \|TPR_H - TPR_F\| | > 5 points | Equalized Odds |

### Analyse de proxy

Pour chaque feature, on calcule :
- **Correlation de Pearson** entre la feature et gender
- **Mutual Information** entre la feature et gender
- Un feature est identifie comme proxy si |r| > 0.3

### Visualisations generees

- `06_fairness_metrics.png` — EPD, RID, Delta-TPR avec zones d'alerte
- `07_proxy_analysis.png` — Correlations feature-gender

---

## 9. Explicabilite SHAP

SHAP (SHapley Additive exPlanations) attribue a chaque feature sa contribution a la prediction individuelle.

**Utilisation :**
- `LinearExplainer` pour la Regression Logistique (exact, rapide)
- Valeurs de base (esperance du modele) + valeurs SHAP par feature
- Top 3 features avec le plus d'impact
- Resume textuel lisible par les consultants RH

**Plot genere :**
- `08_shap_summary.png` — Beeswarm plot sur le jeu de test

---

## 10. API REST V2 — Endpoints

Base URL : `http://localhost:8000`

### `GET /health`

```json
{
    "status": "ok",
    "model_ready": true,
    "model_name": "Logistic Regression (C=0.5, l2)",
    "fairness_enabled": true,
    "version": "V2"
}
```

### `POST /predict` (modifie V2)

Retourne la prediction avec SHAP explanation et flag `fairness_adjusted`.

```json
{
    "name": "Olivia Martinez",
    "target_role": "Senior Data Analyst",
    "label": "Invite",
    "confidence": 78.5,
    "probabilities": {"Invite": 78.5, "Reject": 21.5},
    "model_name": "Logistic Regression (C=0.5, l2)",
    "fairness_adjusted": true,
    "version": "V2",
    "explanation": {
        "base_value": -0.8234,
        "shap_values": {"Years of Experience": 0.45, "Education Level": 0.23, ...},
        "top_features": [("Years of Experience", 0.45), ("Education Level", 0.23), ("Age", 0.12)],
        "decision_drivers": "The main factors for this decision are: Years of Experience (+0.45, strongly favoring Invite), Education Level (+0.23, moderately favoring Invite), and Age (+0.12, moderately favoring Invite)."
    }
}
```

### `POST /explain` (NOUVEAU V2)

Endpoint dedie a l'explicabilite. Meme fonctionnement que `/predict` avec emphasis sur l'explication SHAP.

### `GET /fairness-metrics` (NOUVEAU V2)

Retourne les metriques d'audit de fairness calculees lors de l'entrainement.

```json
{
    "version": "V2",
    "fairness_constraint": "equalized_odds",
    "base_model": {
        "epd": 8.3,
        "epd_alert": true,
        "rid": 0.789,
        "rid_alert": true,
        "delta_tpr": 4.2,
        "delta_tpr_alert": false,
        "group_stats": {...}
    },
    "fair_model": {
        "epd": 2.1,
        "epd_alert": false,
        "rid": 0.956,
        "rid_alert": false,
        "delta_tpr": 1.3,
        "delta_tpr_alert": false,
        "group_stats": {...}
    },
    "performance_comparison": {
        "base": {"accuracy": 0.66, "f1_invite": 0.46, "auc": 0.72},
        "fair": {"accuracy": 0.64, "f1_invite": 0.43}
    },
    "proxy_analysis": [...]
}
```

### Autres endpoints (inchanges)

- `POST /parse` — Extraction features uniquement
- `POST /process-inbox` — Traitement batch
- `GET /processed-files` — Liste des fichiers traites
- `DELETE /processed-files/<filename>` — Retirer du registre

---

## 11. Comparaison V1 vs V2

| Aspect | V1 | V2 |
|---|---|---|
| **Feature gender** | Dans le modele (coef +0.2444) | Exclu du modele (metadonnee) |
| **Seuil de decision** | Fixe (0.45) pour tous | Ajuste par groupe via ThresholdOptimizer |
| **Explicabilite** | Aucune | SHAP (contribution par feature) |
| **Audit fairness** | Aucun | EPD, RID, Delta-TPR, proxy analysis |
| **Discrimination directe** | Oui (gender dans le modele) | Non (gender exclu) |
| **Discrimination indirecte** | Non corrigee | Corrigee (ThresholdOptimizer) |
| **Conformite AI Act** | Partielle | Art. 9, 10, 12, 13, 43 |
| **Transparence** | Score + probabilite | Score + probabilite + explication SHAP |

---

## 12. Lancement du projet

### Demarrer les services

```bash
cd project-files/
docker compose up --build
```

### Verifier que tout tourne

```bash
curl http://localhost:8000/health
# {"fairness_enabled": true, "model_ready": true, "status": "ok", "version": "V2"}
```

### Entrainer le modele V2

```bash
docker exec luxtalent-api python src/python/main.py train
```

### Verifier les metriques de fairness

```bash
curl http://localhost:8000/fairness-metrics
```

### Obtenir une explication SHAP

```bash
curl -X POST http://localhost:8000/explain \
  -H "Content-Type: application/json" \
  -d '{"text": "Name: Jane Doe\nGender: Female\n...", "filename": "test.txt"}'
```

### Arreter les services

```bash
docker compose down
```

---

*Documentation redigee dans le cadre du Work Package 2 — LuxTalent Advisory Group AI Project V2*
