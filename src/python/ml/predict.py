"""
ML Prediction Module — CV Pre-Screening (Fairness-Aware)
=========================================================
Loads the trained Logistic Regression model, scaler, ThresholdOptimizer,
and SHAP explainer from disk, then returns a prediction for a single candidate.

Fairness flow
-------------
- Gender is used by the ThresholdOptimizer (group-specific thresholds).
- Age is used for audit logging only (not by the ThresholdOptimizer).
- An asymmetric safety margin prevents the ThresholdOptimizer from overriding
  a confident Invite decision (see SAFETY_MARGIN_INVITE_TO_REJECT).
- When the ThresholdOptimizer changes the final decision, a fairness_note is
  added to the SHAP explanation (AI Act art. 13).

Expected input
--------------
A feature dict produced by ``feature_extractor.extract_features()``.
Only the keys listed in FEATURE_COLUMNS are used for the ML model.
'gender' is used separately by the ThresholdOptimizer.

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
        "fairness_adjusted": bool,
        "explanation"  : {
            "base_value"    : float,
            "shap_values"   : dict,
            "top_features"  : list,
            "decision_drivers": str,
            "fairness_note" : str | None,
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

# Gender and age are excluded from ML features.
# Gender is used by the ThresholdOptimizer and audit.
# Age is used for audit only.
FEATURE_COLUMNS = [
    "years_experience",
    "education_level",
    "nb_certifications",
    "nb_extra_languages",
    "nb_extra_skills",
    "has_management_experience",
    "has_international_experience",
]

# Asymmetric safety margin for the ThresholdOptimizer (Invite -> Reject only).
# When the ThresholdOptimizer wants to demote a candidate, this margin prevents
# overriding a confident base-model prediction. Promoting an unjustly penalised
# candidate (Reject -> Invite) has no margin: it is always preferred.
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
_threshold_optimizer = None
_shap_explainer = None
_fairness_metrics = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load() -> None:
    """
    Load model, scaler, ThresholdOptimizer, and SHAP explainer from disk
    into module-level cache.
    """
    global _model, _scaler, _model_name, _threshold
    global _threshold_optimizer, _shap_explainer, _fairness_metrics    if _model is None:
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

        # Load ThresholdOptimizer
        if os.path.exists(THRESHOLD_OPT_PATH):
            with open(THRESHOLD_OPT_PATH, "rb") as f:
                _threshold_optimizer = pickle.load(f)
        else:
            _threshold_optimizer = None

        # Load SHAP explainer
        if os.path.exists(SHAP_EXPLAINER_PATH):
            with open(SHAP_EXPLAINER_PATH, "rb") as f:
                _shap_explainer = pickle.load(f)
        else:
            _shap_explainer = None

        # Load fairness metrics
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


def get_fairness_constraint() -> str | None:
    """
    Return the fairness constraint actually applied by the ThresholdOptimizer
    during training, as stored in model_meta.pkl.

    Reading from the persisted artifact guarantees the returned value matches
    what the trained model uses — unlike a hardcoded string which becomes stale
    whenever the training fallback selects a different constraint.

    Returns None if no model has been trained yet.
    """
    if not os.path.exists(META_PATH):
        return None
    try:
        with open(META_PATH, "rb") as f:
            meta = pickle.load(f)
        return meta.get("fairness_constraint")
    except Exception:
        return None


def predict(features: dict, explain: bool = True) -> dict:
    """
    Predict the screening outcome for a single candidate.

    Prediction flow:
        1. Build feature vector (without gender/age) in column order
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
        If True, compute and include SHAP explanation.

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

    # Apply ThresholdOptimizer if available (gender only, not age_group).
    fairness_adjusted        = False
    fairness_changed_decision = False
    base_label               = 1 if probas[1] >= _threshold else 0

    gender    = features.get("gender", -1)
    age_raw   = features.get("age", -1)
    age_group = get_age_group(age_raw)

    if _threshold_optimizer is not None and gender in (0, 1):
        try:
            # Gender ONLY is used as sensitive feature.
            to_label = int(_threshold_optimizer.predict(X_scaled, sensitive_features=np.array([gender]))[0])

            if to_label == base_label:
                label_int         = base_label
                fairness_adjusted = True

            elif to_label == 1 and base_label == 0:
                # Reject -> Invite: always accept the promotion.
                label_int                  = 1
                fairness_adjusted          = True
                fairness_changed_decision  = True

            else:
                # Invite -> Reject: only apply if base model is not confidently above threshold.
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

    # SHAP explanation
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

            # When the ThresholdOptimizer changed the final decision, the SHAP
            # explanation reflects the base model only. Add an explicit note so
            # HR consultants are not misled (AI Act art. 13).
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