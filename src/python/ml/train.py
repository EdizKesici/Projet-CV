"""
ML Training Script — CV Pre-Screening V2 (Fairness-Aware)
==========================================================
Trains a Logistic Regression classifier on labeled CV feature data,
with fairness-aware modifications:

V2 Changes from V1
-------------------
1. gender REMOVED from FEATURE_COLUMNS (eliminates direct discrimination)
2. Fairlearn ThresholdOptimizer applied as post-processing
   (tries demographic_parity first, then equalized_odds; falls back
   to base model if both produce Invite rates below 5%)
3. SHAP explainability integrated (explainer saved for inference)
4. Fairness audit computed on test set (EPD, RID, Delta-TPR)
5. Proxy analysis between gender and remaining features
6. Additional diagnostic plots: SHAP summary, fairness report, proxy analysis

Train / test split
------------------
The dataset is split 80/20 BEFORE any scaling or fitting.
The RobustScaler is fitted on the TRAINING set only, then applied
to the test set — this prevents data leakage.

Cross-validation & model selection
----------------------------------
Hyperparameter selection is performed via GridSearchCV with 5-fold
stratified cross-validation on the training set, using F1-score as
the optimisation metric (appropriate for imbalanced data).
The best model found by CV is then evaluated on the held-out test set.

Generated plots
---------------
    01_class_distribution.png    — label balance (full dataset)
    02_confusion_matrix.png      — test set confusion matrix
    03_coefficients.png          — Logistic Regression coefficients
    04_feature_distributions.png — box plots per feature, split by label
    05_metrics_summary.png       — accuracy, ROC AUC, F1, CV scores
    06_fairness_metrics.png      — EPD, RID, Delta-TPR audit (NEW V2)
    07_proxy_analysis.png        — gender-feature correlation (NEW V2)
    08_shap_summary.png          — SHAP beeswarm plot (NEW V2)

Usage
-----
    python ml/train.py
    python ml/train.py --data data/training_data/cv_features_labeled.csv
"""

import argparse
import os
import pickle
import sys

import matplotlib
matplotlib.use("Agg")  # non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import RobustScaler

# V2: Fairlearn + SHAP
from fairlearn.postprocessing import ThresholdOptimizer
import shap

# V2: Audit module
from ml.audit import run_audit

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# V2: gender is EXCLUDED from ML features (kept as metadata for audit only)
FEATURE_COLUMNS = [
    "age",
    "years_experience",
    "education_level",
    "nb_certifications",
    "nb_extra_languages",
    "nb_extra_skills",
    "has_management_experience",
    "has_international_experience",
]

FEATURE_LABELS = {
    "age": "Age",
    "years_experience": "Years of Experience",
    "education_level": "Education Level",
    "nb_certifications": "Certifications",
    "nb_extra_languages": "Extra Languages",
    "nb_extra_skills": "Extra Skills",
    "has_management_experience": "Management Experience",
    "has_international_experience": "International Experience",
}

_HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_HERE, "model", "model.pkl")
SCALER_PATH = os.path.join(_HERE, "model", "scaler.pkl")
META_PATH  = os.path.join(_HERE, "model", "model_meta.pkl")
THRESHOLD_OPT_PATH = os.path.join(_HERE, "model", "threshold_optimizer.pkl")  # V2
SHAP_EXPLAINER_PATH = os.path.join(_HERE, "model", "shap_explainer.pkl")       # V2
FAIRNESS_METRICS_PATH = os.path.join(_HERE, "model", "fairness_metrics.pkl")    # V2
DEFAULT_PLOTS_DIR = os.path.join(_HERE, "plots")

_PROJECT_ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))
DEFAULT_DATA_PATH = os.path.join(
    _PROJECT_ROOT, "data", "training_data", "cv_features_labeled.csv"
)

# Plot style
PALETTE = {"Reject": "#E05252", "Invite": "#52A0E0"}

plt.rcParams.update({
    "figure.facecolor": "white",
    "axes.facecolor": "#F8F9FA",
    "axes.grid": True,
    "grid.color": "white",
    "grid.linewidth": 1.2,
    "font.family": "sans-serif",
    "axes.spines.top": False,
    "axes.spines.right": False,
})


# ---------------------------------------------------------------------------
# Plot helpers
# ---------------------------------------------------------------------------

def _save(fig: plt.Figure, path: str, name: str) -> None:
    filepath = os.path.join(path, name)
    fig.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[PLOT]    Saved -> {filepath}")


def _source_note(ax, text: str) -> None:
    """Add a small source annotation at the bottom-right of an axes."""
    ax.annotate(
        text, xy=(1, -0.08), xycoords="axes fraction",
        ha="right", va="top", fontsize=8, color="#888",
        fontstyle="italic",
    )


def plot_class_distribution(y: pd.Series, plots_dir: str) -> None:
    """Label balance — full dataset."""
    counts = y.value_counts().sort_index()
    labels = ["Reject (0)", "Invite (1)"]
    colors = [PALETTE["Reject"], PALETTE["Invite"]]

    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(labels, counts.values, color=colors, width=0.5,
                  edgecolor="white", linewidth=1.5)
    for bar, count in zip(bars, counts.values):
        pct = count / len(y) * 100
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1,
                f"{count}\n({pct:.1f}%)", ha="center", va="bottom",
                fontsize=11, fontweight="bold")

    ax.set_title("Class Distribution", fontsize=14, fontweight="bold", pad=12)
    ax.set_ylabel("Number of Candidates")
    ax.set_ylim(0, max(counts.values) * 1.2)
    _source_note(ax, f"source: full dataset (n={len(y)})")
    fig.tight_layout()
    _save(fig, plots_dir, "01_class_distribution.png")


def plot_confusion_matrix(
    y_test: np.ndarray, y_pred: np.ndarray, model_name: str, plots_dir: str
) -> None:
    """Confusion matrix — test set only."""
    cm = confusion_matrix(y_test, y_pred)
    cm_pct = cm.astype(float) / cm.sum(axis=1, keepdims=True) * 100

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, cmap="Blues", vmin=0, vmax=cm.max())
    tick_labels = ["Reject (0)", "Invite (1)"]
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_xticklabels(tick_labels); ax.set_yticklabels(tick_labels)
    for i in range(2):
        for j in range(2):
            color = "white" if cm[i, j] > cm.max() / 2 else "black"
            ax.text(j, i, f"{cm[i, j]}\n({cm_pct[i, j]:.1f}%)",
                    ha="center", va="center", fontsize=13,
                    fontweight="bold", color=color)
    ax.set_title(f"Confusion Matrix — {model_name}", fontsize=14,
                 fontweight="bold", pad=12)
    ax.set_xlabel("Predicted Label", fontsize=11)
    ax.set_ylabel("True Label", fontsize=11)
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    _source_note(ax, f"source: test set (n={len(y_test)}, 20% hold-out)")
    fig.tight_layout()
    _save(fig, plots_dir, "02_confusion_matrix.png")


def plot_coefficients(model, plots_dir: str) -> None:
    """Horizontal bar chart of Logistic Regression coefficients (V2: no gender)."""
    labels = [FEATURE_LABELS.get(c, c) for c in FEATURE_COLUMNS]

    coefs = model.coef_[0]
    sorted_idx = np.argsort(np.abs(coefs))
    sorted_labels = [labels[i] for i in sorted_idx]
    sorted_coefs = coefs[sorted_idx]
    colors = [PALETTE["Invite"] if c > 0 else PALETTE["Reject"] for c in sorted_coefs]

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(sorted_labels, sorted_coefs, color=colors, edgecolor="white", height=0.6)
    ax.axvline(0, color="gray", linewidth=1, linestyle="--")
    ax.set_title("Logistic Regression Coefficients (V2 — no gender)", fontsize=14,
                 fontweight="bold", pad=12)
    ax.set_xlabel("Coefficient  (positive -> Invite,  negative -> Reject)")
    _source_note(ax, f"derived from training set (n={len(coefs)})")
    fig.tight_layout()
    _save(fig, plots_dir, "03_coefficients.png")


def plot_feature_distributions(df: pd.DataFrame, plots_dir: str) -> None:
    """Box plots per feature, Reject vs Invite — full dataset."""
    n = len(FEATURE_COLUMNS)
    ncols = 3
    nrows = (n + ncols - 1) // ncols

    fig, axes = plt.subplots(nrows, ncols, figsize=(14, nrows * 3.5))
    axes_flat = axes.flatten()
    reject_df = df[df["label"] == 0]
    invite_df = df[df["label"] == 1]

    for i, col in enumerate(FEATURE_COLUMNS):
        ax = axes_flat[i]
        data = [reject_df[col].dropna().values, invite_df[col].dropna().values]
        bp = ax.boxplot(data, patch_artist=True, widths=0.5,
                        medianprops={"color": "white", "linewidth": 2.5})
        bp["boxes"][0].set_facecolor(PALETTE["Reject"])
        bp["boxes"][1].set_facecolor(PALETTE["Invite"])
        for w in bp["whiskers"]: w.set(color="gray", linewidth=1)
        for c in bp["caps"]:     c.set(color="gray", linewidth=1)
        ax.set_title(FEATURE_LABELS.get(col, col), fontsize=10, fontweight="bold")
        ax.set_xticks([1, 2])
        ax.set_xticklabels(["Reject", "Invite"], fontsize=9)

    for j in range(i + 1, len(axes_flat)):
        axes_flat[j].set_visible(False)

    fig.suptitle(f"Feature Distributions by Label  (full dataset, n={len(df)})",
                 fontsize=14, fontweight="bold", y=1.01)
    fig.tight_layout()
    _save(fig, plots_dir, "04_feature_distributions.png")


def plot_metrics_summary(
    accuracy: float,
    auc: float,
    f1_invite: float,
    f1_reject: float,
    threshold: float,
    cv_scores: np.ndarray,
    model_name: str,
    plots_dir: str,
) -> None:
    """Summary card with all key metrics from the test set evaluation."""
    rows = [
        ("Accuracy", f"{accuracy:.3f}"),
        ("ROC AUC", f"{auc:.3f}"),
        ("F1 — Invite class", f"{f1_invite:.3f}"),
        ("F1 — Reject class", f"{f1_reject:.3f}"),
        ("Decision threshold", f"{threshold:.2f}"),
        ("CV F1 (5-fold)", f"{cv_scores.mean():.3f}  +/-  {cv_scores.std():.3f}"),
    ]

    fig, ax = plt.subplots(figsize=(7, 3.5))
    ax.axis("off")

    table = ax.table(
        cellText=rows,
        colLabels=["Metric", "Value"],
        loc="center",
        cellLoc="left",
        colWidths=[0.45, 0.45],
    )
    table.auto_set_font_size(False)
    table.set_fontsize(12)
    table.scale(1, 1.8)

    for j in range(2):
        cell = table[0, j]
        cell.set_facecolor("#2C3E50")
        cell.set_text_props(color="white", fontweight="bold", fontsize=12)
        cell.set_edgecolor("white")

    for i in range(len(rows)):
        for j in range(2):
            cell = table[i + 1, j]
            cell.set_facecolor("#F8F9FA" if i % 2 == 0 else "white")
            cell.set_edgecolor("#DEE2E6")
            if j == 1:
                cell.set_text_props(fontweight="bold", color="#2C3E50")

    ax.set_title(
        f"Performance Summary — {model_name}",
        fontsize=14, fontweight="bold", pad=20,
    )
    _source_note(ax, f"test set (n={len(cv_scores)}); CV on training set")
    fig.tight_layout()
    _save(fig, plots_dir, "05_metrics_summary.png")


def plot_shap_summary(explainer, X_test_scaled, plots_dir: str) -> None:
    """SHAP summary beeswarm plot for the test set (V2)."""
    shap_values = explainer.shap_values(X_test_scaled)

    # For binary classification, take the Invite class
    if isinstance(shap_values, list):
        sv = shap_values[1]
    else:
        sv = shap_values

    fig = shap.summary_plot(
        sv, X_test_scaled,
        feature_names=[FEATURE_LABELS.get(c, c) for c in FEATURE_COLUMNS],
        show=False,
    )
    filepath = os.path.join(plots_dir, "08_shap_summary.png")
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close("all")
    print(f"[PLOT]    Saved -> {filepath}")


# ---------------------------------------------------------------------------
# Training function
# ---------------------------------------------------------------------------

def train(data_path: str, plots_dir: str) -> None:
    """
    Full V2 training pipeline with fairness-aware modifications:

        1. Load and validate the labeled CSV.
        2. Split 80/20 BEFORE any fitting (stratified).
        3. Fit RobustScaler on X_train only -> transform both sets.
        4. Select best hyperparameters via GridSearchCV (5-fold, F1 metric).
        5. Train Fairlearn ThresholdOptimizer (Equalized Odds constraint).
        6. Evaluate on held-out test set (V2 model + ThresholdOptimizer).
        7. Run fairness audit (EPD, RID, Delta-TPR, proxy analysis).
        8. Create and save SHAP explainer.
        9. Save all artifacts.
       10. Generate diagnostic plots.
    """
    # --- Load ---
    if not os.path.exists(data_path):
        print(f"[ERROR] Data file not found: {data_path}")
        print("        Run prepare_training_data.py first.")
        sys.exit(1)

    df = pd.read_csv(data_path)
    print(f"[INFO] Loaded {len(df)} records from {data_path}")

    # --- Validate ---
    if "label" not in df.columns:
        print("[ERROR] Column 'label' not found. Run prepare_training_data.py first.")
        sys.exit(1)
    missing_cols = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing_cols:
        print(f"[ERROR] Missing feature columns: {missing_cols}")
        sys.exit(1)
    if "gender" not in df.columns:
        print("[ERROR] Column 'gender' not found. It is required for fairness audit (V2).")
        sys.exit(1)

    X = df[FEATURE_COLUMNS].fillna(0).values
    y = df["label"].astype(int).values
    gender = df["gender"].values  # Kept for audit and ThresholdOptimizer

    print(f"\n[INFO] Class distribution (full dataset):")
    print(f"         Reject (0) : {(y == 0).sum()}")
    print(f"         Invite (1) : {(y == 1).sum()}")
    print(f"         Gender distribution: Male={int((gender == 1).sum())}, Female={int((gender == 0).sum())}")

    # --- Step 1: Train/test split (BEFORE any scaling) ---
    X_train, X_test, y_train, y_test, gender_train, gender_test = train_test_split(
        X, y, gender, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\n[INFO] Training set : {len(X_train)} samples")
    print(f"[INFO] Test set     : {len(X_test)} samples  (held out, never touched during training)")

    # --- Step 2: Fit scaler on TRAINING data only ---
    scaler = RobustScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    # --- Step 3: Hyperparameter selection via GridSearchCV ---
    THRESHOLD = 0.45

    print("\n" + "=" * 60)
    print("GRID SEARCH — Logistic Regression (5-fold CV, F1 metric)")
    print("  [V2] gender excluded from features")
    print("=" * 60)

    param_grid = {
        "C": [0.01, 0.1, 0.5, 1.0, 5.0, 10.0],
        "penalty": ["l1", "l2"],
        "solver": ["liblinear"],
        "class_weight": ["balanced"],
        "max_iter": [1000],
    }

    cv_grid = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    grid_search = GridSearchCV(
        LogisticRegression(random_state=42),
        param_grid,
        cv=cv_grid,
        scoring="f1",
        n_jobs=-1,
        refit=True,
    )
    grid_search.fit(X_train_scaled, y_train)

    model = grid_search.best_estimator_
    model_name = f"Logistic Regression (C={grid_search.best_params_['C']}, {grid_search.best_params_['penalty']})"

    print(f"\n  Best parameters : {grid_search.best_params_}")
    print(f"  Best CV F1      : {grid_search.best_score_:.3f}")
    print(f"  Selected model  : {model_name}")

    # --- Step 4: Evaluate base model on test set (before ThresholdOptimizer) ---
    y_proba_base = model.predict_proba(X_test_scaled)[:, 1]
    y_pred_base  = (y_proba_base >= THRESHOLD).astype(int)

    print("\n" + "=" * 60)
    print(f"BASE MODEL RESULTS (no ThresholdOptimizer) — {model_name}")
    print("=" * 60)
    print(classification_report(y_test, y_pred_base, target_names=["Reject", "Invite"]))

    acc_base = (y_pred_base == y_test).mean()
    auc_base = roc_auc_score(y_test, y_proba_base)
    f1i_base = f1_score(y_test, y_pred_base, pos_label=1, zero_division=0)
    f1r_base = f1_score(y_test, y_pred_base, pos_label=0, zero_division=0)
    print(f"  Accuracy  : {acc_base:.3f}")
    print(f"  ROC AUC   : {auc_base:.3f}")
    print(f"  F1 Invite : {f1i_base:.3f}")
    print(f"  F1 Reject : {f1r_base:.3f}")

    # --- Step 5: Fairlearn ThresholdOptimizer (V2) ---
    # Try demographic_parity first (less aggressive than equalized_odds on
    # imbalanced data). If the resulting Invite rate drops below a sensible
    # floor, fall back to equalized_odds, and ultimately to the base model.
    FAIRNESS_CONSTRAINTS = ["demographic_parity", "equalized_odds"]
    INVITE_RATE_FLOOR = 0.05  # minimum acceptable Invite rate (5%)

    best_to = None
    best_constraint = None
    best_y_pred_fair = None
    best_acc_fair = None
    best_f1i_fair = None
    best_f1r_fair = None

    for constraint_name in FAIRNESS_CONSTRAINTS:
        print("\n" + "=" * 60)
        print(f"FAIRLEARN ThresholdOptimizer (V2) — constraint: {constraint_name}")
        print("=" * 60)

        try:
            to = ThresholdOptimizer(
                estimator=model,
                constraints=constraint_name,
                prefit=True,
                predict_method="predict_proba",
            )
            to.fit(
                X_train_scaled, y_train,
                sensitive_features=gender_train,
            )

            y_pred_to = to.predict(X_test_scaled, sensitive_features=gender_test)
            invite_rate = y_pred_to.mean()
            acc_to = (y_pred_to == y_test).mean()
            f1i_to = f1_score(y_test, y_pred_to, pos_label=1, zero_division=0)
            f1r_to = f1_score(y_test, y_pred_to, pos_label=0, zero_division=0)

            print(f"  Invite rate     : {invite_rate:.1%}")
            print(f"  Accuracy        : {acc_to:.3f}  (base: {acc_base:.3f}, delta: {acc_to - acc_base:+.3f})")
            print(f"  F1 Invite       : {f1i_to:.3f}  (base: {f1i_base:.3f}, delta: {f1i_to - f1i_base:+.3f})")
            print(f"  F1 Reject       : {f1r_to:.3f}  (base: {f1r_base:.3f}, delta: {f1r_to - f1r_base:+.3f})")

            if invite_rate < INVITE_RATE_FLOOR:
                print(f"  [WARN] Invite rate ({invite_rate:.1%}) below floor ({INVITE_RATE_FLOOR:.0%}) — skipping this constraint.")
                continue

            # Keep the first constraint that passes the Invite-rate floor
            if best_to is None:
                best_to = to
                best_constraint = constraint_name
                best_y_pred_fair = y_pred_to
                best_acc_fair = acc_to
                best_f1i_fair = f1i_to
                best_f1r_fair = f1r_to

        except Exception as exc:
            print(f"  [WARN] ThresholdOptimizer with {constraint_name} failed: {exc}")

    # If no ThresholdOptimizer produced acceptable results, fall back to base
    if best_to is None:
        print("\n[WARN] No ThresholdOptimizer constraint produced acceptable results.")
        print("       Falling back to base model (no fairness post-processing).")
        threshold_optimizer = None
        y_pred_fair = y_pred_base
        acc_fair = acc_base
        f1i_fair = f1i_base
        f1r_fair = f1r_base
        best_constraint = "none (fallback to base)"
    else:
        threshold_optimizer = best_to
        y_pred_fair = best_y_pred_fair
        acc_fair = best_acc_fair
        f1i_fair = best_f1i_fair
        f1r_fair = best_f1r_fair

    print(f"\n  V2 Final (constraint: {best_constraint}):")
    print(f"  Accuracy  : {acc_fair:.3f}  (base: {acc_base:.3f}, delta: {acc_fair - acc_base:+.3f})")
    print(f"  F1 Invite : {f1i_fair:.3f}  (base: {f1i_base:.3f}, delta: {f1i_fair - f1i_base:+.3f})")
    print(f"  F1 Reject : {f1r_fair:.3f}  (base: {f1r_base:.3f}, delta: {f1r_fair - f1r_base:+.3f})")
    print(classification_report(y_test, y_pred_fair, target_names=["Reject", "Invite"]))

    # --- Step 6: 5-fold CV with F1 metric ---
    print("\n" + "=" * 60)
    print(f"CROSS-VALIDATION F1  (training set only, n={len(X_train)}, stratified 5-fold)")
    print("=" * 60)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=cv, scoring="f1")
    print(f"  {model_name}: {cv_scores.mean():.3f} +/- {cv_scores.std():.3f}  "
          f"({' / '.join(f'{s:.3f}' for s in cv_scores)})")

    # --- Step 7: Fairness Audit (V2) ---
    print("\n" + "=" * 60)
    print("FAIRNESS AUDIT (V2)")
    print("=" * 60)

    # Audit on base model (without ThresholdOptimizer)
    audit_base = run_audit(
        y_true=y_test,
        y_pred=y_pred_base,
        sensitive_features=gender_test,
        X_df=pd.DataFrame(X_test, columns=FEATURE_COLUMNS),
        plots_dir=None,
        version_label="V2 Base (no ThresholdOptimizer)",
    )
    print("\n  Base Model Fairness Metrics:")
    print(f"    EPD        : {audit_base['metrics']['epd']:.1f} pts {'[ALERT]' if audit_base['metrics']['epd_alert'] else '[OK]'}")
    print(f"    RID        : {audit_base['metrics']['rid']:.3f} {'[ALERT]' if audit_base['metrics']['rid_alert'] else '[OK]'}")
    print(f"    Delta TPR  : {audit_base['metrics']['delta_tpr']:.1f} pts {'[ALERT]' if audit_base['metrics']['delta_tpr_alert'] else '[OK]'}")
    if audit_base["proxies"] is not None:
        print(f"\n  Proxy Analysis:")
        for _, row in audit_base["proxies"].iterrows():
            proxy_flag = " [PROXY]" if row["is_proxy"] else ""
            print(f"    {row['feature']:30s}  r={row['pearson_r']:+.4f}  MI={row['mutual_info']:.4f}{proxy_flag}")

    # Audit on fair model (with ThresholdOptimizer)
    audit_fair = run_audit(
        y_true=y_test,
        y_pred=y_pred_fair,
        sensitive_features=gender_test,
        X_df=pd.DataFrame(X_test, columns=FEATURE_COLUMNS),
        plots_dir=None,
        version_label="V2 (with ThresholdOptimizer)",
    )
    print("\n  Fair Model Fairness Metrics (with ThresholdOptimizer):")
    print(f"    EPD        : {audit_fair['metrics']['epd']:.1f} pts {'[ALERT]' if audit_fair['metrics']['epd_alert'] else '[OK]'}")
    print(f"    RID        : {audit_fair['metrics']['rid']:.3f} {'[ALERT]' if audit_fair['metrics']['rid_alert'] else '[OK]'}")
    print(f"    Delta TPR  : {audit_fair['metrics']['delta_tpr']:.1f} pts {'[ALERT]' if audit_fair['metrics']['delta_tpr_alert'] else '[OK]'}")

    # --- Step 8: Create SHAP Explainer (V2) ---
    print("\n" + "=" * 60)
    print("SHAP EXPLAINER (V2)")
    print("=" * 60)

    shap_explainer = shap.LinearExplainer(
        model, X_train_scaled,
        feature_names=[FEATURE_LABELS.get(c, c) for c in FEATURE_COLUMNS]
    )
    print(f"  SHAP LinearExplainer created for {model_name}")

    # --- Step 9: Save all artifacts ---
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)
    with open(META_PATH, "wb") as f:
        pickle.dump({
            "model_name": model_name,
            "threshold": THRESHOLD,
            "version": "V2",
            "feature_columns": FEATURE_COLUMNS,
            "fairness_constraint": best_constraint,
            "threshold_optimizer_available": threshold_optimizer is not None,
        }, f)

    # V2: Save ThresholdOptimizer (only if available)
    if threshold_optimizer is not None:
        with open(THRESHOLD_OPT_PATH, "wb") as f:
            pickle.dump(threshold_optimizer, f)
        print(f"[OK]     ThresholdOpt saved  -> {THRESHOLD_OPT_PATH}  (constraint: {best_constraint})")
    else:
        # Remove any stale ThresholdOptimizer from a previous V1/V2 training
        if os.path.exists(THRESHOLD_OPT_PATH):
            os.remove(THRESHOLD_OPT_PATH)
        print(f"[WARN]   No ThresholdOptimizer saved (fell back to base model).")

    # V2: Save SHAP explainer
    with open(SHAP_EXPLAINER_PATH, "wb") as f:
        pickle.dump(shap_explainer, f)

    # V2: Save fairness metrics for the API
    fairness_data = {
        "base_model": audit_base["metrics"],
        "fair_model": audit_fair["metrics"],
        "performance_comparison": {
            "base": {"accuracy": acc_base, "f1_invite": f1i_base, "f1_reject": f1r_base, "auc": auc_base},
            "fair": {"accuracy": acc_fair, "f1_invite": f1i_fair, "f1_reject": f1r_fair},
        },
        "proxies": audit_base["proxies"].to_dict("records") if audit_base["proxies"] is not None else None,
    }
    with open(FAIRNESS_METRICS_PATH, "wb") as f:
        pickle.dump(fairness_data, f)

    print(f"\n[OK]     Model saved         -> {MODEL_PATH}")
    print(f"[OK]     Scaler saved        -> {SCALER_PATH}  (RobustScaler)")
    print(f"[OK]     Meta saved          -> {META_PATH}")
    print(f"[OK]     SHAP explainer saved-> {SHAP_EXPLAINER_PATH}")
    print(f"[OK]     Fairness metrics    -> {FAIRNESS_METRICS_PATH}")

    # --- Step 10: Generate plots ---
    os.makedirs(plots_dir, exist_ok=True)
    print(f"\n[PLOTS]  Generating diagnostic plots -> {plots_dir}/")

    plot_class_distribution(pd.Series(y), plots_dir)
    plot_confusion_matrix(y_test, y_pred_fair, f"{model_name} + ThresholdOpt", plots_dir)
    plot_coefficients(model, plots_dir)
    plot_feature_distributions(df, plots_dir)
    plot_metrics_summary(acc_fair, auc_base, f1i_fair, f1r_fair, THRESHOLD, cv_scores, model_name, plots_dir)

    # V2: Fairness audit plots
    run_audit(
        y_true=y_test,
        y_pred=y_pred_fair,
        sensitive_features=gender_test,
        X_df=pd.DataFrame(X_test, columns=FEATURE_COLUMNS),
        plots_dir=plots_dir,
        version_label="V2 (with ThresholdOptimizer)",
    )

    # V2: SHAP summary plot
    try:
        plot_shap_summary(shap_explainer, X_test_scaled, plots_dir)
    except Exception as exc:
        print(f"[WARN]   SHAP summary plot failed: {exc}")

    print(f"\n[DONE]   V2 Training complete. Plots saved to {plots_dir}/")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train V2 Fairness-Aware Logistic Regression model for CV screening."
    )
    parser.add_argument("--data",  default=DEFAULT_DATA_PATH,
                        help="Path to cv_features_labeled.csv")
    parser.add_argument("--plots", default=DEFAULT_PLOTS_DIR,
                        help="Output directory for diagnostic plots")
    args = parser.parse_args()
    train(args.data, args.plots)
