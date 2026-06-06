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
11. [Base de donnees Supabase et authentification](#11-base-de-donnees-supabase-et-authentification)
12. [Deploiement](#12-deploiement)

---

## 1. Presentation du systeme V2

La V2 est une refonte critique du systeme de pre-selection automatisee de CV developpe dans le Work Package 1. Elle integre des mecanismes de fairness, d'explicabilite et de transparence conformement aux exigences du Work Package 2 et au cadre reglementaire europeen.

### Objectifs V2

- **Supprimer la discrimination directe** : retrait de `gender` du modele ML (RGPD art. 9)
- **Supprimer la discrimination indirecte par l'age** : retrait de `age` des features ML (V2.1)
- **Corriger les biais residuels** : Fairlearn ThresholdOptimizer (post-traitement)
- **Rendre les decisions explicables** : SHAP LinearExplainer (contribution par feature)
- **Auditer les disparites** : metriques EPD, RID (WARN/ALERT), Delta-TPR
- **Detecter les proxies** : analyse de correlation entre gender et les features ML
- **Persister l'historique** : base de donnees Supabase (PostgreSQL cloud) — aucune perte au redeploi
- **Securiser l'acces** : authentification par mot de passe (NextAuth JWT) — acces reserve
- **Satisfaire le cadre reglementaire** : AI Act (art. 9, 10, 12, 13, 43), RGPD (art. 9)

### Cadre reglementaire

| Reglementation | Articles | Application |
|---|---|---|
| **AI Act** | Art. 10 | Gouvernance des donnees — detection et correction des biais dans les donnees d'entrainement |
| **AI Act** | Art. 9 | Gestion des risques tout au long du cycle de vie du systeme IA a haut risque |
| **AI Act** | Art. 12 | Tracabilite — logging CSV + Supabase de chaque decision avec `fairness_adjusted` |
| **AI Act** | Art. 13 | Transparence — explication SHAP fournie systematiquement pour chaque prediction |
| **AI Act** | Art. 43 | Supervision humaine — override possible sur chaque decision dans le frontend |
| **RGPD** | Art. 9 | Genre comme donnee sensible — exclu du modele ML, metadonnee d'audit uniquement |
| **Dir. 2006/54/CE** | Art. 2 | Discrimination indirecte — mesuree par le RID, corrigee par ThresholdOptimizer |
| **Loi 10/05/2007 (BE)** | Art. 3-4 | Discrimination age et genre en emploi — audit EPD, RID, Delta-TPR |

### Principes ethiques AI4People

- **Bienfaisance** : aide les recruteurs a identifier les candidats qualifies de maniere equitable
- **Non-malfaisance** : retrait de `gender` et `age` du modele, correction des biais, audit continu
- **Autonomie** : override humain possible dans le frontend ; explication SHAP pour chaque decision
- **Justice** : ThresholdOptimizer equalized_odds, metriques EPD/RID/Delta-TPR, analyse proxy
- **Explicabilite** : SHAP LinearExplainer — contribution de chaque feature visualisee en waterfall chart

---

## 2. Changements V1 -> V2

| Composant | V1 | V2 |
|---|---|---|
| **FEATURE_COLUMNS** | 9 features (dont `gender` +0.2444 et `age`) | 7 features (`gender` ET `age` exclus — attributs proteges) |
| **Discrimination directe** | `gender` dans le modele — violation RGPD art. 9 | `gender` exclu du modele, metadonnee audit uniquement |
| **Discrimination indirecte** | Non corrigee | ThresholdOptimizer Fairlearn (equalized_odds / demographic_parity) |
| **Explicabilite** | Aucune | SHAP LinearExplainer — top features + resume textuel + waterfall chart |
| **Audit fairness** | Aucun | EPD, RID (WARN 0.95 / ALERT 0.80), Delta-TPR, analyse proxy |
| **Persistance donnees** | CSV uniquement (ephemere sur Railway) | Supabase PostgreSQL cloud — historique permanent inter-sessions |
| **Authentification** | Aucune — acces libre | NextAuth JWT — mot de passe requis, session 24h |
| **Endpoints API** | 5 endpoints | 9 endpoints (+ `/explain`, `/fairness-metrics`, `/screening-log`) |
| **Artefacts ML** | model.pkl, scaler.pkl, model_meta.pkl | + shap_explainer.pkl, fairness_metrics.pkl, model_v1/ (reference) |
| **Plots generes** | 5 plots | 9 plots (+ fairness, proxy, SHAP, age_fairness) |
| **requirements.txt** | 6 packages | 9 packages (+ fairlearn, shap, scipy) |
| **Interface utilisateur** | n8n uniquement | Dashboard Next.js — SHAP waterfall, audit equite, historique Supabase |
| **Conformite AI Act** | Partielle | Art. 9, 10, 12, 13, 43 couverts |

---

## 3. Architecture globale V2

```
                    +-----------------------------------------------+
                    |           Railway (production)                |
                    |                                               |
  +----------+      |  +----------------------+                    |
  | Browser  | HTTPS|  | Frontend Next.js     |   PostgreSQL       |
  | (recru-  |----->|  | (port 8080)          |<---------------->  |
  |  teur)   |      |  |                      |   Supabase cloud   |
  +----------+      |  | - NextAuth JWT       |   (CvAnalysis,     |
                    |  | - Proxy /flask-api/* |    FilterConfig)   |
                    |  | - API routes /api/*  |                    |
                    |  +----------+-----------+                    |
                    |             |  reseau interne Railway        |
                    |             v  http://projet-cv.railway.internal:8000
                    |  +----------------------+                    |
                    |  | API Flask V2         |                    |
                    |  | (port 8000)          |                    |
                    |  |                      |                    |
                    |  | feature_extractor    |                    |
                    |  | hard_filter          |                    |
                    |  | ml/predict (V2)      |                    |
                    |  | ml/audit (V2)        |                    |
                    |  | screening_log.csv    |                    |
                    |  +----------------------+                    |
                    +-----------------------------------------------+
```

**En local (Docker Compose)** : frontend port 3000, api port 8000, reseau interne `api:8000`.

---

## 4. Structure du projet

```
Projet-CV-2/
|
+-- Dockerfile                    <- Build API Flask (Python 3.11-slim, Gunicorn, port 8000)
+-- docker-compose.yml            <- Orchestration locale : api + frontend
|
+-- data/
|   +-- input_CVs/                <- CVs a traiter (watcher en local)
|   +-- processed_CVs/            <- CVs deplaces apres traitement
|   +-- training_data/
|       +-- CVs/                  <- 500 CVs synthetiques d'entrainement
|       +-- cv_features_labeled.csv
|       +-- student_labels.csv
|
+-- docs/
|   +-- README.md                 <- Cette documentation
|   +-- THRESHOLD_OPTIMIZER_ANALYSE.md
|   +-- diagram.bpmn / diagram.svg
|
+-- src/python/
|   +-- app.py                    <- API Flask V2 — 9 endpoints REST
|   +-- feature_extractor.py      <- Extraction NLP des 7 features ML + metadonnees
|   +-- hard_filter.py            <- Filtre eliminatoire (competences, experience)
|   +-- logger.py                 <- Journalisation CSV (V2 : + fairness_adjusted, top_driver)
|   +-- main.py                   <- Point d'entree unifie
|   +-- registry.py               <- Deduplication SHA-256
|   +-- requirements.txt          <- flask, gunicorn, sklearn, fairlearn, shap, scipy, pandas
|   +-- ml/
|   |   +-- train.py              <- Entrainement V2.2 (sans gender/age, GridSearchCV, ThresholdOptimizer, SHAP)
|   |   +-- predict.py            <- Inference V2 (ThresholdOptimizer + SHAP LinearExplainer)
|   |   +-- audit.py              <- Metriques de fairness (EPD, RID, Delta-TPR, proxy analysis)
|   |   +-- model/                <- Artefacts V2 : model.pkl, scaler.pkl, model_meta.pkl,
|   |   |                            shap_explainer.pkl, fairness_metrics.pkl
|   |   +-- model_v1/             <- Artefacts V1 (reference pour la comparaison Base vs Corrige)
|   |   +-- plots/                <- 9 graphiques de diagnostic generes a l'entrainement
|   +-- tests/
|       +-- test_all.py           <- Tests unitaires pytest
|
+-- frontend/
    +-- Dockerfile                <- Build Next.js standalone (port 8080)
    +-- prisma/schema.prisma      <- Schema Prisma — tables CvAnalysis et FilterConfig (Supabase)
    +-- src/
        +-- app/
        |   +-- login/page.tsx    <- Page de connexion (NextAuth)
        |   +-- page.tsx          <- Page principale (tabs : Analyse CV, Fairness, Config)
        |   +-- api/analyses/     <- CRUD analyses dans Supabase
        |   +-- api/predict/      <- Proxy POST /predict + sauvegarde Supabase
        |   +-- api/fairness-metrics/ <- Proxy GET /fairness-metrics
        |   +-- api/filter-config/    <- Gestion FilterConfig dans Supabase
        |   +-- api/screening-log/    <- Lecture CSV via Flask
        +-- components/luxtalent/
        |   +-- cv-drop.tsx       <- Upload CV + affichage resultat SHAP
        |   +-- shap-waterfall.tsx <- Graphique en cascade des valeurs SHAP
        |   +-- fairness-gauge.tsx <- Jauges EPD/RID/Delta-TPR
        |   +-- fairness-history.tsx <- Historique depuis Supabase
        |   +-- filter-config.tsx <- Configuration du job (hard filter)
        +-- lib/
            +-- auth.ts           <- Configuration NextAuth (CredentialsProvider, JWT 24h)
            +-- db.ts             <- Client Prisma (connexion Supabase)
            +-- pdf-export.ts     <- Generation rapport PDF (jsPDF)
```

---

## 5. Flux de donnees V2

```
CV (.txt)
    |
    v
[feature_extractor.extract_features()]
    |
    |--> 7 features ML (SANS gender, SANS age)
    |--> gender = metadonnee (0=Female, 1=Male, -1=inconnu)
    |--> age    = metadonnee (audit uniquement)
    |
    v
[hard_filter.apply(features, job_config)]
    |
    |--> Si REJETE : label="Reject", stage="hard_filter"
    |    -> log dans CSV + sauvegarde dans Supabase
    |
    |--> Si ACCEPTE :
    |
    v
[ml/predict.predict(features, explain=True)]
    |
    |--> 1. RobustScaler.transform(7 features ML)
    |--> 2. model.predict_proba() -> probabilite de base
    |--> 3. ThresholdOptimizer.predict(sensitive_features=gender) -> decision equitable
    |--> 4. SHAP LinearExplainer.shap_values() -> contribution de chaque feature
    |
    v
[logger.log_result() + Supabase CvAnalysis]
    |
    v
Resultat V2 :
{
    "label": "Invite" | "Reject",
    "confidence": float,
    "probabilities": {"Invite": float, "Reject": float},
    "fairness_adjusted": true,
    "version": "V2",
    "explanation": {
        "base_value": float,
        "shap_values": {
            "Years of Experience": 0.45,
            "Education Level": 0.23,
            "Certifications": 0.12,
            "Management Experience": -0.08,
            "Extra Languages": 0.05,
            "Extra Skills": 0.03,
            "International Experience": 0.02
        },
        "top_features": [["Years of Experience", 0.45], ...],
        "decision_drivers": "The main factors for this decision are: ..."
    }
}
```

---

## 6. Extraction de features (V2)

### Features ML — V2.2 (7 features, gender ET age exclus)

| Feature | Type | Description |
|---|---|---|
| `years_experience` | float | Somme des durees d'emploi en annees |
| `education_level` | int (1-5) | Niveau de diplome : 1=aucun, 2=BAC, 3=Bachelor, 4=Master, 5=Doctorat |
| `nb_certifications` | int | Nombre de certifications professionnelles detectees |
| `nb_extra_languages` | int | Langues parles au-dela de l'anglais |
| `nb_extra_skills` | int | Nombre total de competences detectees |
| `has_management_experience` | int (0/1) | 1 si experience de management detectee |
| `has_international_experience` | int (0/1) | 1 si experience internationale detectee |

> **Note V2.2** : `age` a ete retire des features ML car c'est un attribut protege (Loi 10/05/2007, Directive 2000/78/CE). Il reste surveille dans l'audit de fairness par groupe d'age.

### Metadonnees (non ML)

| Champ | Type | Utilisation en V2 |
|---|---|---|
| `gender` | int (0=F, 1=M, -1=inconnu) | Audit fairness (EPD/RID/Delta-TPR) et ThresholdOptimizer UNIQUEMENT |
| `age` | int | Audit de fairness par groupe d'age (< 30, 30-45, > 45) |
| `name` | string | Affichage dans le log, le frontend, le PDF et Supabase |
| `target_role` | string | Affichage et personnalisation du job_config |

---

## 7. Pipeline ML V2

### Modele de base — Logistic Regression

| Hyperparametre | Valeur | Justification |
|---|---|---|
| Algorithme | Logistic Regression | Interpretable, compatible SHAP LinearExplainer (exact) |
| Regularisation | L2 (Ridge) | Selectionne par GridSearchCV (F1-score, 5-fold) |
| C optimal | 0.5 | Selectionne par GridSearchCV parmi {0.01, 0.1, 0.5, 1.0, 2.0} |
| class_weight | balanced | Compense le desequilibre Invite/Reject |
| Scaler | RobustScaler | Robuste aux outliers — fit sur train set uniquement |
| Seuil de base | 0.45 | Abaisse pour favoriser le rappel des candidats qualifies |
| Split | 80% / 20%, random_state=42 | Reproductibilite, pas de data leakage |

### Fairlearn ThresholdOptimizer

Algorithme de post-traitement qui ajuste les seuils de decision par groupe demographique pour satisfaire une contrainte de fairness, sans modifier ni reentrainer le modele de base.

**Processus :**
1. Entrainement du modele de base sur les 7 features ML (SANS gender ni age)
2. Fitting du ThresholdOptimizer sur les predictions + labels + gender (train set)
3. Contrainte prioritaire : `demographic_parity`, fallback vers `equalized_odds`
4. Garde-fou : si le taux d'invitation descend sous 15%, retour au modele de base + warning
5. A l'inference : `ThresholdOptimizer.predict(sensitive_features=gender)` -> decision equitable
6. `fairness_adjusted=True` si la decision differe de celle du modele de base

### Graphiques generes a l'entrainement

| Fichier | Contenu |
|---|---|
| `01_class_distribution.png` | Distribution des labels Invite/Reject |
| `02_confusion_matrix.png` | Matrice de confusion sur le jeu de test |
| `03_coefficients.png` | Coefficients de la Logistic Regression |
| `04_feature_distributions.png` | Box plots par feature, separes par label |
| `05_metrics_summary.png` | Accuracy, ROC AUC, F1-score, CV scores |
| `06_fairness_metrics.png` | EPD, RID, Delta-TPR avec zones d'alerte — NOUVEAU V2 |
| `07_proxy_analysis.png` | Correlation feature-gender — NOUVEAU V2 |
| `08_shap_summary.png` | Beeswarm SHAP sur le jeu de test — NOUVEAU V2 |
| `09_age_fairness_metrics.png` | Audit de fairness par groupe d'age — NOUVEAU V2.1 |

---

## 8. Audit de fairness

### Metriques calculees

| Metrique | Formule | Seuil WARN | Seuil ALERT | Reference |
|---|---|---|---|---|
| **EPD** (Ecart de Parite Demographique) | \|P(Invite\|H) - P(Invite\|F)\| | — | > 5 pts | AI Act, consid. 27 |
| **RID** (Ratio d'Impact Differentiel) | P(Invite\|F) / P(Invite\|H) | < 0.95 | < 0.80 | Dir. 2006/54/CE, art. 2 |
| **Delta-TPR** (Egalite des Chances) | \|TPR_H - TPR_F\| | — | > 5 pts | Equalized Odds |

### Resultats V1 (base) vs V2 (corrige)

Les metriques sont calculees sur le jeu de test (100 candidats) et stockees dans `fairness_metrics.pkl` :

| Metrique | V1 — Modele de base | V2 — ThresholdOptimizer | Statut |
|---|---|---|---|
| EPD | 0.2 pts | 4.9 pts | OK (< 5 pts) |
| RID | 0.995 | 0.892 | OK (> 0.80) |
| Delta-TPR | 8.3 pts | 16.2 pts | ALERTE (> 5 pts) |

> Le Delta-TPR reste en alerte en raison de la taille limitee du dataset (environ 50 candidats par genre sur le jeu de test). Le RID est dans les seuils acceptables. Voir `docs/THRESHOLD_OPTIMIZER_ANALYSE.md` pour l'analyse detaillee.

### Analyse de proxy

Pour chaque feature ML, on calcule la correlation de Pearson et la Mutual Information avec gender. Une feature est identifiee comme proxy si |r| > 0.3. Resultat V2 : aucune des 7 features ne depasse ce seuil.

---

## 9. Explicabilite SHAP

SHAP (SHapley Additive exPlanations) attribue a chaque feature sa contribution marginale a la prediction individuelle.

| Element | Detail |
|---|---|
| Explainer | `SHAP LinearExplainer` — exact et rapide pour la Logistic Regression |
| Valeur de base | E[f(X)] — esperance du modele sur le train set |
| Valeurs SHAP | Contribution positive (Invite) ou negative (Reject) par feature |
| Top features | Top 3 par valeur absolue — drivers principaux de la decision |
| Resume textuel | "The main factors for this decision are: X (+0.45)..." |
| Artefact | `shap_explainer.pkl` — pre-calcule, charge une seule fois au demarrage |
| Visualisation | Waterfall chart dans le frontend (shap-waterfall.tsx) |

---

## 10. API REST V2 — Endpoints

Base URL production (via proxy Next.js) : `https://frontend-production-922c6.up.railway.app/flask-api`
Base URL locale : `http://localhost:8000`

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

Pipeline complet : hard filter -> ML -> ThresholdOptimizer -> SHAP.

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
        "shap_values": {
            "Years of Experience": 0.45,
            "Education Level": 0.23,
            "Certifications": 0.12,
            "Management Experience": -0.08,
            "Extra Languages": 0.05,
            "Extra Skills": 0.03,
            "International Experience": 0.02
        },
        "top_features": [["Years of Experience", 0.45], ["Education Level", 0.23], ["Certifications", 0.12]],
        "decision_drivers": "The main factors for this decision are: Years of Experience (+0.45, strongly favoring Invite), Education Level (+0.23, moderately favoring Invite)."
    }
}
```

### `POST /explain` (NOUVEAU V2)

Endpoint dedie a l'explicabilite. Meme pipeline que `/predict`.

### `GET /fairness-metrics` (NOUVEAU V2)

Retourne les metriques EPD/RID/Delta-TPR calculees lors de l'entrainement (base V1 vs corrige V2).

```json
{
    "version": "V2",
    "fairness_constraint": "demographic_parity",
    "base_model": {
        "epd": 0.2, "epd_alert": false,
        "rid": 0.995, "rid_warn": false, "rid_alert": false,
        "delta_tpr": 8.3, "delta_tpr_alert": true,
        "group_stats": {"Female": {"invite_rate": 42.9, "tpr": 100.0}, "Male": {...}}
    },
    "fair_model": {
        "epd": 4.9, "epd_alert": false,
        "rid": 0.892, "rid_warn": true, "rid_alert": false,
        "delta_tpr": 16.2, "delta_tpr_alert": true,
        "group_stats": {...}
    },
    "proxy_analysis": [...]
}
```

### `GET /screening-log` (NOUVEAU V2)

Retourne le fichier `screening_log.csv` sous forme JSON.

### Autres endpoints (inchanges)

| Methode | Endpoint | Description |
|---|---|---|
| POST | `/parse` | Extraction des features uniquement (sans prediction) |
| POST | `/process-inbox` | Traitement batch de tous les CVs dans `input_CVs/` |
| GET | `/processed-files` | Liste des fichiers traites (registre SHA-256) |
| DELETE | `/processed-files/<filename>` | Retirer un fichier du registre (permet retraitement) |

---

## 11. Base de donnees Supabase et authentification

### Supabase (PostgreSQL cloud)

La V2 utilise Supabase comme base de donnees cloud persistante, remplacant la SQLite locale ephemere. L'historique des analyses survit aux redeplois Railway sans necessiter de volume persistant.

**Schema Prisma (`frontend/prisma/schema.prisma`) :**

**Table `CvAnalysis`** — une ligne par CV analyse :

| Colonne | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `candidateName` | String | Nom du candidat |
| `targetRole` | String | Poste vise |
| `label` | String | Decision : Invite ou Reject |
| `confidence` | Float | Score de confiance (0-100%) |
| `fairnessAdjusted` | Boolean | True si le ThresholdOptimizer a modifie la decision |
| `shapValues` | String (JSON) | Valeurs SHAP par feature |
| `features` | String (JSON) | 7 features ML extraites |
| `decisionDrivers` | String | Resume textuel SHAP |
| `version` | String | Version du modele (V2) |
| `createdAt` | DateTime | Horodatage UTC |

**Table `FilterConfig`** — configuration du hard filter par job :

| Colonne | Type | Description |
|---|---|---|
| `name` | String (unique) | Nom du job (ex: Senior Dev) |
| `requiredSkills` | String (JSON) | Competences obligatoires |
| `minYearsExperience` | Float? | Experience minimale en annees |
| `minEducationLevel` | Int? | Niveau d'education minimum (1-5) |
| `isActive` | Boolean | Si True, appliquee au hard filter |

### Authentification NextAuth

L'acces au site est protege par un mot de passe. L'authentification utilise NextAuth avec `CredentialsProvider` et session JWT.

| Aspect | Detail |
|---|---|
| Provider | CredentialsProvider — mot de passe unique |
| Session | JWT, duree 24h, cookie httpOnly |
| Variable d'env | `AUTH_PASSWORD` (mot de passe) + `NEXTAUTH_SECRET` (cle de signature) |
| Middleware | `src/middleware.ts` — redirige vers `/login` si session invalide |
| Page connexion | `/login` — formulaire branded LuxTalent |

---

## 12. Deploiement

### En local — Docker Compose

```bash
cd Projet-CV-2/
docker compose up --build
# Frontend : http://localhost:3000  (mot de passe : luxtalent)
# API Flask : http://localhost:8000
```

### En production — Railway

2 services deployes (watcher non deploye — pas de filesystem partage entre services Railway) :

| Service | Dockerfile | Variables d'environnement cles |
|---|---|---|
| `api` (projet-cv) | `Dockerfile` (racine) | `INBOX_DIR`, `PROCESSED_DIR`, `LOG_PATH`, `PORT=8000` |
| `frontend` | `frontend/Dockerfile` | `FLASK_API_URL=http://projet-cv.railway.internal:8000`, `DATABASE_URL=postgresql://...(Supabase)`, `AUTH_PASSWORD`, `NEXTAUTH_SECRET`, `NODE_ENV=production` |

**URL publique** : https://frontend-production-922c6.up.railway.app

**Reseau interne Railway** : `http://projet-cv.railway.internal:8000` — communication frontend/API sans exposition publique de l'API Flask.

**Base de donnees** : Supabase cloud — aucun volume Railway necessaire, donnees persistantes entre redeplois.

### Commandes utiles

```bash
# Demarrer en local
docker compose up --build

# Arreter les services
docker compose down

# Entrainer le modele V2
docker exec luxtalent-api python src/python/main.py train

# Lancer les tests
docker exec luxtalent-api pytest src/python/tests/ -v

# Verifier l'API
curl http://localhost:8000/health

# Voir les metriques de fairness
curl http://localhost:8000/fairness-metrics

# Traiter le dossier inbox
curl -X POST http://localhost:8000/process-inbox

# Migration Prisma (Supabase)
cd frontend && npx prisma db push
```

---

*Documentation redigee dans le cadre du Work Package 2 — LuxTalent Advisory Group AI Project V2.2*
