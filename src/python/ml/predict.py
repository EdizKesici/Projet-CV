"""
ML Prediction Module — CV Pre-Screening V2.2 (Fairness-Aware)
=============================================================
Loads the trained Logistic Regression model, scaler, ThresholdOptimizer,
and SHAP explainer from disk, then returns a prediction for a single candidate.

V2.2 Changes from V2.1
-----------------------
1. ThresholdOptimizer uses gender ONLY (2 stable groups). Age_group is no
   longer passed to the TO — intersectional subgroups had too few samples
   for reliable threshold estimation. Age fairness is still audited.
2. fairness_note updated to reflect that gender is the only attribute
   corrected by the TO, while age_group is monitored for audit only.

V2.1 Changes from V2
---------------------
1. age EXCLUDED from FEATURE_COLUMNS (age is now a protected attribute).
2. Safety margin is explicitly asymmetric (see SAFETY_MARGIN_INVITE_TO_REJECT).
3. When the ThresholdOptimizer changes the final decision, a fairness_note is
   added to the SHAP explanation (AI Act art. 13).

V2 Changes from V1
-------------------
1. gender EXCLUDED from FEATURE_COLUMNS (removed from model input)
2. ThresholdOptimizer applies group-specific thresholds (post-processing fairness)
3. SHAP explanation available for each prediction
4. Fairness-aware prediction flow:
   a) Extract features (without gender or age for model)
   b) Scale features
   c) Model produces probability
   d) Apply base threshold (0.45) to get base prediction
   e) ThresholdOptimizer adjusts decision per group (gender only)
   f) SHAP computes feature contributions

Expected input
--------------
A feature dict produced by ``feature_extractor.extract_features()``.
Only the keys listed in FEATURE_COLUMNS are used for the ML model.
'gender' is used separately by the ThresholdOptimizer.
'age' is used for audit logging only (not by the ThresholdOptimizer).

Return value
------------
    {
        "label"        : "Invite" | "Reject",
        "confidence"   : float,          # percentage
        "probabilities": {
            "Invite": float,             # percentage
            "Reject": float              # percentage
        },
        "model_name"   : str,
        "fairness_adjusted": bool,       # True if ThresholdOptimizer was applied
        "explanation"  : {               # V2: SHAP explanation
            "base_value"    : float,
            "shap_values"   : dict,
            "top_features"  : list,
            "decision_drivers": str,
            "fairness_note" : str | None, # V2.1: set when decision was adjusted
        } | None
    }
"""

import os
import pickle

import numpy as np
import pandas as pd

from ml.audit import get_age_group

# ---------------------------------------------------------------------------
# Configuration — must stay in sync with train.py and feature_extractor
# ---------------------------------------------------------------------------

# V2.2: both gender AND age are excluded from ML features.
# Gender is used by the ThresholdOptimizer and audit.
# Age is used for audit only (not by the ThresholdOptimizer).
FEATURE_COLUMNS = [
    "years_experience",
    "education_level",
    "nb_certifications",
    "nb_extra_languages",
    "nb_extra_skills",
    "has_management_experience",
    "has_international_experience",
]

# Asymmetric safety margin for the ThresholdOptimizer (Invite -> Reject direction only).
# When the ThresholdOptimizer wants to demote a candidate (Invite -> Reject),
# this margin prevents overriding a confident base-model prediction.
# Rationale: on imbalanced data (~80% Reject), the ThresholdOptimizer may produce
# unstable group thresholds; a downward correction on a confident Invite prediction
# is more likely to be a false override than a genuine fairness correction.
# For upward corrections (Reject -> Invite), NO margin is applied: promoting an
# unjustly penalised candidate is preferred (ethically and legally).
# To change this trade-off, update this value and document it in the WP2 report.
SAFETY_MARGIN_INVITE_TO_REJECT = 0.10

_HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_HERE, "model", "model.pkl")
SCALER_PATH = os.path.join(_HERE, "model", "scaler.pkl")
META_PATH = os.path.join(_HERE, "model", "model_meta.pkl")
THRESHOLD_OPT_PATH = os.path.join(_HERE, "model", "threshold_optimizer.pkl")  # V2
SHAP_EXPLAINER_PATH = os.path.join(_HERE, "model", "shap_explainer.pkl")       # V2
FAIRNESS_METRICS_PATH = os.path.join(_HERE, "model", "fairness_metrics.pkl")    # V2

# Module-level cache (lazy loaded on first call)
_model = None
_scaler = None
_model_name = None
_threshold = 0.5
_threshold_optimizer = None  # V2
_shap_explainer = None       # V2
_fairness_metrics = None     # V2


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load() -> None:
    """
    Load model, scaler, ThresholdOptimizer, and SHAP explainer from disk
    into module-level cache.
    """
    global _model, _scaler, _model_name, _threshold
    global _threshold_optimizer, _shap_explainer, _fairness_metrics

    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model artifact not found at '{MODEL_PATH}'. "
                "Run ml/train.py first."
            )
        if not os.path.exists(SCALER_PATH):
            raise FileNotFoundError(
                f"Scaler artifact not found at '{SCALER_PATH}'. "
                "Run ml/train.py first."
            )

        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
        with open(SCALER_PATH, "rb") as f:
            _scaler = pickle.load(f)

        # Read metadata
        if os.path.exists(META_PATH):
            with open(META_PATH, "rb") as f:
                meta = pickle.load(f)
                _model_name = meta.get("model_name", "Unknown")
                _threshold  = meta.get("threshold", 0.5)
        else:
            _model_name = "Unknown"
            _threshold  = 0.5

        # V2: Load ThresholdOptimizer
        if os.path.exists(THRESHOLD_OPT_PATH):
            with open(THRESHOLD_OPT_PATH, "rb") as f:
                _threshold_optimizer = pickle.load(f)
        else:
            _threshold_optimizer = None

        # V2: Load SHAP explainer
        if os.path.exists(SHAP_EXPLAINER_PATH):
            with open(SHAP_EXPLAINER_PATH, "rb") as f:
                _shap_explainer = pickle.load(f)
        else:
            _shap_explainer = None

        # V2: Load fairness metrics
        if os.path.exists(FAIRNESS_METRICS_PATH):
            with open(FAIRNESS_METRICS_PATH, "rb") as f:
                _fairness_metrics = pickle.load(f)
        else:
            _fairness_metrics = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def model_is_ready() -> bool:
    """Return True if both model and scaler artifacts exist on disk."""
    return os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH)


def get_model_name() -> str:
    """Return the name of the currently saved model, or 'Unknown'."""
    if os.path.exists(META_PATH):
        with open(META_PATH, "rb") as f:
            meta = pickle.load(f)
            return meta.get("model_name", "Unknown")
    return "Unknown"


def is_fairness_enabled() -> bool:
    """Return True if the ThresholdOptimizer artifact exists (V2 model)."""
    return os.path.exists(THRESHOLD_OPT_PATH)


def get_fairness_metrics() -> dict | None:
    """Return the saved fairness audit metrics, or None if not available."""
    if not os.path.exists(FAIRNESS_METRICS_PATH):
        return None
    try:
        with open(FAIRNESS_METRICS_PATH, "rb") as f:
            return pickle.load(f)
    except Exception:
        return None


def predict(features: dict, explain: bool = True) -> dict:
    """
    Predict the screening outcome for a single candidate.

    V2 prediction flow:
        1. Build feature vector (WITHOUT gender) in column order
        2. Scale features
        3. Model produces probability
        4. ThresholdOptimizer applies group-specific threshold (uses gender)
        5. Optionally compute SHAP explanation

    Parameters
    ----------
    features : dict
        Feature dict from ``feature_extractor.extract_features()``.
        Must contain 'gender' key for ThresholdOptimizer.
        Missing numeric features default to 0.
    explain : bool
        If True, compute and include SHAP explanation (V2).

    Returns
    -------
    dict
        Keys: ``label``, ``confidence``, ``probabilities``,
              ``model_name``, ``fairness_adjusted``, ``explanation``.
    """
    _load()

    # Build the feature vector WITHOUT gender (in exact column order used during training)
    row = {col: features.get(col, 0) for col in FEATURE_COLUMNS}
    X = pd.DataFrame([row])
    X_scaled = _scaler.transform(X)

    # Get model probabilities (base model, without ThresholdOptimizer)
    probas = _model.predict_proba(X_scaled)[0]

    # V2.2: Apply ThresholdOptimizer if available.
    # Gender ONLY is used as sensitive feature (not gender+age_group).
    fairness_adjusted        = False
    fairness_changed_decision = False
    base_label               = 1 if probas[1] >= _threshold else 0

    gender    = features.get("gender", -1)
    age_raw   = features.get("age", -1)
    age_group = get_age_group(age_raw)

    if _threshold_optimizer is not None and gender in (0, 1):
        try:
            # V2.2: sensitive_features uses gender ONLY (1D array).
            # Age_group is not passed to the ThresholdOptimizer.
            to_label = int(_threshold_optimizer.predict(X_scaled, sensitive_features=np.array([gender]))[0])

            if to_label == base_label:
                # Both agree — use the shared prediction.
                label_int         = base_label
                fairness_adjusted = True

            elif to_label == 1 and base_label == 0:
                # ThresholdOptimizer promotes the candidate (Reject -> Invite).
                # No safety margin: promoting an unjustly penalised candidate is
                # always preferred. Allow the correction unconditionally.
                label_int                  = 1
                fairness_adjusted          = True
                fairness_changed_decision  = True

            else:
                # ThresholdOptimizer demotes the candidate (Invite -> Reject).
                # Asymmetric safety margin: only apply if the base model is not
                # confidently above the threshold.  If the margin is large, the
                # base model is likely correct and the ThresholdOptimizer may be
                # reacting to an imbalanced group — trust the base model instead.
                margin = probas[1] - _threshold
                if margin < SAFETY_MARGIN_INVITE_TO_REJECT:
                    label_int                  = 0
                    fairness_adjusted          = True
                    fairness_changed_decision  = True
                else:
                    # Base model is confident — keep the Invite decision.
                    label_int         = 1
                    fairness_adjusted = False

        except Exception as exc:
            print(f"[WARN] ThresholdOptimizer failed: {exc}. Falling back to base model.")
            label_int = base_label
    else:
        # ThresholdOptimizer unavailable or gender unknown — use base model.
        label_int = base_label

    label = "Invite" if label_int == 1 else "Reject"
    confidence = round(float(max(probas)) * 100, 1)

    # V2: SHAP explanation
    explanation = None
    if explain and _shap_explainer is not None:
        try:
            import shap as shap_lib
            shap_values = _shap_explainer.shap_values(X_scaled)

            # For binary classification, take Invite class
            if isinstance(shap_values, list):
                sv = shap_values[1][0]
                base_value = float(_shap_explainer.expected_value[1])
            else:
                sv = shap_values[0]
                base_value = float(_shap_explainer.expected_value)

            # Build SHAP dict using feature labels
            feature_labels = [
                {"age": "Age", "years_experience": "Years of Experience",
                 "education_level": "Education Level", "nb_certifications": "Certifications",
                 "nb_extra_languages": "Extra Languages", "nb_extra_skills": "Extra Skills",
                 "has_management_experience": "Management Experience",
                 "has_international_experience": "International Experience"}.get(c, c)
                for c in FEATURE_COLUMNS
            ]

            shap_dict = {}
            for i, fl in enumerate(feature_labels):
                shap_dict[fl] = round(float(sv[i]), 4)

            # Top 3 features by absolute SHAP value
            sorted_features = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)
            top_features = [(f, v) for f, v in sorted_features[:3]]

            # Human-readable drivers
            parts = []
            for feat_name, shap_val in top_features:
                if abs(shap_val) < 0.01:
                    impact = "negligible impact"
                elif abs(shap_val) < 0.05:
                    impact = "slightly favoring"
                elif abs(shap_val) < 0.15:
                    impact = "moderately favoring"
                else:
                    impact = "strongly favoring"
                direction = "Invite" if shap_val > 0 else "Reject"
                parts.append(f"{feat_name} ({shap_val:+.2f}, {impact} {direction})")

            drivers_text = ", ".join(parts[:-1])
            if len(parts) > 1:
                drivers_text += f", and {parts[-1]}"
            elif parts:
                drivers_text = parts[0]
            else:
                drivers_text = "No significant decision drivers identified."

            explanation = {
                "base_value": round(base_value, 4),
                "shap_values": shap_dict,
                "top_features": [(f, round(v, 4)) for f, v in top_features],
                "decision_drivers": f"The main factors for this decision are: {drivers_text}.",
                "fairness_note": None,
            }

            # V2.1 — AI Act art. 13: when the ThresholdOptimizer changed the final
            # decision, the SHAP explanation reflects the base model only.
            # Add an explicit note so HR consultants are not misled.
            if fairness_adjusted and fairness_changed_decision:
                base_label_str  = "Invite" if base_label == 1 else "Reject"
                final_label_str = "Invite" if label_int  == 1 else "Reject"
                explanation["fairness_note"] = (
                    f"This decision was adjusted by the ThresholdOptimizer to satisfy "
                    f"the fairness constraint (Demographic Parity / Equalized Odds). "
                    f"The base model predicted '{base_label_str}' "
                    f"(score: {probas[1]:.1%}); the final decision is '{final_label_str}'. "
                    f"The SHAP explanation above reflects the base model's scoring, "
                    f"not the final adjusted outcome. "
                    f"Protected attribute applied by ThresholdOptimizer: gender={gender}. "
                    f"Age group ({age_group}) is monitored for audit purposes but does "
                    f"not influence the fairness adjustment."
                )

        except Exception as exc:
            print(f"[WARN] SHAP explanation failed: {exc}")
            explanation = None

    result = {
        "label": label,
        "confidence": confidence,
        "probabilities": {
            "Invite": round(float(probas[1]) * 100, 1),
            "Reject": round(float(probas[0]) * 100, 1),
        },
        "model_name": _model_name,
        "fairness_adjusted": fairness_adjusted,
    }

    if explanation is not None:
        result["explanation"] = explanation

    return result