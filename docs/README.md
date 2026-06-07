# LuxTalent - Système de pré-sélection automatique de CV

**LuxTalent Advisory Group S.A.**

Système IA de pré-sélection de CV avec audit de fairness, explicabilité SHAP et dashboard Next.js.

> 📄 **Documentation complète** : [`docs/LuxTalent_Documentation.docx`](./LuxTalent_Documentation.docx)
> 📄 **Analyse ThresholdOptimizer** : [`docs/THRESHOLD_OPTIMIZER_ANALYSE.md`](./threshold_optimizer_analyse.md)

---

## Démarrage rapide

```bash
# Cloner le repo
git clone -b V2 https://github.com/Q220003/Projet-CV.git
cd Projet-CV

# Lancer avec Docker Compose
docker compose up --build

# Frontend : http://localhost:3000  (mot de passe : luxtalent)
# API Flask : http://localhost:8000
```

---

## Architecture

```
Browser ──HTTPS──> Next.js (8080) ──HTTP──> Flask API (8000)
                       │                        │
                   NextAuth JWT            ML Pipeline
                   Supabase PgSQL          CSV Logger
```

- **Frontend** : Next.js 16 + shadcn/ui + Prisma (Supabase) + NextAuth
- **Backend** : Flask + Logistic Regression + Fairlearn + SHAP
- **Base de données** : Supabase PostgreSQL (cloud)

---

## Pipeline ML

1. **Extraction** — 7 features NLP (sans `gender`, sans `age`)
2. **Hard filter** — élimination sur compétences et expérience
3. **Prédiction** — Logistic Regression (C=0.5, class_weight=balanced)
4. **Explicabilité** — SHAP LinearExplainer (contribution par feature)
5. **Audit** — Métriques EPD, RID, Delta-TPR + analyse proxy


---

## Structure du projet

```
Projet-CV/
├── src/python/          # Backend Flask + ML
│   ├── app.py           # API REST — 9 endpoints
│   ├── feature_extractor.py
│   ├── hard_filter.py
│   ├── ml/              # train.py, predict.py, audit.py, model/
│   └── tests/           # pytest
├── frontend/            # Next.js 16
│   ├── src/app/         # Pages + API routes
│   ├── src/components/  # CV drop, SHAP waterfall, fairness gauges
│   └── prisma/          # Schema Supabase
├── data/                # CVs, training data, logs
├── docs/                # Documentation, diagrammes
├── Dockerfile           # Build API Flask
└── docker-compose.yml   # Orchestration locale
```

---

## API Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/health` | État du modèle et de l'API |
| POST | `/predict` | Pipeline complet : extraction → hard filter → ML → SHAP |
| POST | `/explain` | Explicabilité dédiée |
| POST | `/parse` | Extraction des features uniquement |
| POST | `/process-inbox` | Traitement batch du dossier `input_CVs/` |
| GET | `/fairness-metrics` | Métriques EPD, RID, Delta-TPR + proxy |
| GET | `/screening-log` | Historique CSV des décisions |
| GET | `/processed-files` | Registre SHA-256 des fichiers traités |
| DELETE | `/processed-files/<name>` | Retirer du registre |

---

## Déploiement

### Local — Docker Compose

```bash
docker compose up --build
```

### Production — Railway

| Service | Port | Variables clés |
|---|---|---|
| `api` | 8000 | `INBOX_DIR`, `PROCESSED_DIR`, `LOG_PATH` |
| `frontend` | 8080 | `FLASK_API_URL`, `DATABASE_URL`, `AUTH_PASSWORD`, `NEXTAUTH_SECRET` |

URL publique : `https://frontend-production-922c6.up.railway.app`
Réseau interne : `http://projet-cv.railway.internal:8000`

---

## Commandes utiles

```bash
# Entraîner le modèle
docker exec luxtalent-api python src/python/main.py train

# Lancer les tests
docker exec luxtalent-api pytest src/python/tests/ -v

# Vérifier l'API
curl http://localhost:8000/health

# Métriques de fairness
curl http://localhost:8000/fairness-metrics

# Migration Prisma
cd frontend && npx prisma db push
```
