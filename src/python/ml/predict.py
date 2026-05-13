"""
ML Prediction Module — CV Pre-Screening V2 (Fairness-Aware)
============================================================
Loads the trained Logistic Regression model, scaler, ThresholdOptimizer,
and SHAP explainer from disk, then returns a prediction for a single candidate.

V2 Changes from V1
-------------------
1. gender EXCLUDED from FEATURE_COLUMNS (removed from model input)
2. ThresholdOptimizer applies group-specific thresholds using gender
   as a sensitive feature (post-processing fairness constraint).
   A hybrid approach is used: the ThresholdOptimizer can only override
   the base model when the candidate's probability is close to the
   decision threshold (margin < 10%). This prevents the ThresholdOptimizer
   from being overly aggressive on imbalanced datasets.
3. SHAP explanation available for each prediction
4. Fairness-aware prediction flow:
   a) Extract features (without gender for model)
   b) Scale features
   c) Model produces probability
   d) Apply base threshold (0.45) to get base prediction
   e) ThresholdOptimizer adjusts decision per gender group (with safety check)
   f) SHAP computes feature contributions

Expected input
--------------
A feature dict produced by ``feature_extractor.extract_features()``.
Only the keys listed in FEATURE_COLUMNS are used; gender is used
separately by the ThresholdOptimizer.

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
        } | None
    }
"""

import os
import pickle

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration — must stay in sync with train.py and feature_extractor
# ---------------------------------------------------------------------------

# V2: gender is EXCLUDED from model features
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

    # V2: Apply ThresholdOptimizer if available
    fairness_adjusted = False
    gender = features.get("gender", -1)

    if _threshold_optimizer is not None and gender in (0, 1):
        try:
            # ThresholdOptimizer expects a DataFrame with features + sensitive_features separately
            gender_array = np.array([gender])
            to_label = int(_threshold_optimizer.predict(X_scaled, sensitive_features=gender_array)[0])

            # Safety check: if the ThresholdOptimizer predicts Reject but the base model
            # is confident enough (probability significantly above threshold), trust the
            # base model instead.  This prevents the ThresholdOptimizer from being
            # overly aggressive on imbalanced datasets.
            base_label = 1 if probas[1] >= _threshold else 0

            if to_label == base_label:
                # Both agree — use the shared prediction
                label_int = base_label
                fairness_adjusted = True
            elif to_label == 1 and base_label == 0:
                # ThresholdOptimizer wants to Invite but base model says Reject —
                # the fairness adjustment is promoting the candidate; allow it.
                label_int = 1
                fairness_adjusted = True
            else:
                # ThresholdOptimizer says Reject, base model says Invite.
                # Only override if the base model's confidence is marginal
                # (probability close to threshold). If the base model is
                # confident, the ThresholdOptimizer is likely being too
                # aggressive, so we trust the base model.
                margin = probas[1] - _threshold
                if margin < 0.10:
                    # Base model is only marginally above threshold —
                    # let the fairness adjustment push to Reject
                    label_int = 0
                    fairness_adjusted = True
                else:
                    # Base model is confident — keep the Invite
                    label_int = 1
                    fairness_adjusted = False

        except Exception as exc:
            # Fallback to base model if ThresholdOptimizer fails
            print(f"[WARN] ThresholdOptimizer failed: {exc}. Falling back to base model.")
            label_int = 1 if probas[1] >= _threshold else 0
    else:
        # No ThresholdOptimizer: use base model with custom threshold
        label_int = 1 if probas[1] >= _threshold else 0

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
            }

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
