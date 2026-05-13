"""
SHAP Explainability Module — CV Pre-Screening V2
==================================================
Provides interpretable explanations for individual screening decisions
using SHAP (SHapley Additive exPlanations).

This satisfies:
- AI4People principle of Explicability
- AI Act art. 13 (Transparency) and art. 52
- The requirement for a "transparent and documented" AI system

Usage
-----
    from ml.explain import SHAPExplainer

    explainer = SHAPExplainer(model, X_train_scaled, feature_names)
    explanation = explainer.explain(features_dict, X_scaled_row)
    # explanation = {
    #     "base_value": float,
    #     "shap_values": {"feature_name": float, ...},
    #     "top_3_features": [("feature", value), ...],
    #     "decision_drivers": str  # human-readable summary
    # }
"""

import numpy as np
import pandas as pd
import shap


# ---------------------------------------------------------------------------
# Feature label mapping (human-readable names)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# SHAP Explainer class
# ---------------------------------------------------------------------------

class SHAPExplainer:
    """
    Wraps a trained model with SHAP explainability.

    For Logistic Regression, uses LinearExplainer which computes exact
    Shapley values efficiently.

    Parameters
    ----------
    model : sklearn estimator
        Trained Logistic Regression model.
    X_background : np.ndarray or pd.DataFrame
        Background dataset (training data) used by SHAP to compute
        baseline expectations.
    feature_names : list[str]
        Names of the features in the same order as X_background columns.
    """

    def __init__(
        self,
        model,
        X_background: np.ndarray | pd.DataFrame,
        feature_names: list[str],
    ):
        self.model = model
        self.feature_names = list(feature_names)
        self.feature_labels = [FEATURE_LABELS.get(f, f) for f in self.feature_names]

        # Use LinearExplainer for logistic regression (exact, fast)
        if isinstance(X_background, pd.DataFrame):
            X_bg = X_background.values
        else:
            X_bg = X_background

        self.explainer = shap.LinearExplainer(
            model, X_bg, feature_names=self.feature_labels
        )

    def explain(
        self,
        X_row: np.ndarray | pd.DataFrame,
        features_dict: dict | None = None,
    ) -> dict:
        """
        Compute SHAP explanation for a single candidate.

        Parameters
        ----------
        X_row : array-like, shape (1, n_features)
            Scaled feature vector for the candidate.
        features_dict : dict, optional
            Original (unscaled) feature dict, used to enrich the explanation
            with actual values.

        Returns
        -------
        dict
            {
                "base_value": float,
                    # Expected model output (average prediction)
                "shap_values": dict,
                    # {feature_label: shap_value, ...}
                "top_features": list of (feature_label, shap_value),
                    # Top 3 features by absolute SHAP value
                "decision_drivers": str,
                    # Human-readable summary of why the decision was made
            }
        """
        if isinstance(X_row, pd.DataFrame):
            X = X_row.values
        else:
            X = np.atleast_2d(X_row)

        # Compute SHAP values
        shap_values = self.explainer.shap_values(X)

        # For binary classification, shap_values may be a list [class0, class1]
        # We want the SHAP values for the "Invite" class (class 1)
        if isinstance(shap_values, list):
            sv = shap_values[1][0]  # Invite class, first sample
            base_value = self.explainer.expected_value[1]
        else:
            sv = shap_values[0]
            base_value = float(self.explainer.expected_value)

        # Build per-feature SHAP dict
        shap_dict = {}
        for i, label in enumerate(self.feature_labels):
            shap_dict[label] = round(float(sv[i]), 4)

        # Top 3 features by absolute SHAP value
        sorted_features = sorted(
            shap_dict.items(), key=lambda x: abs(x[1]), reverse=True
        )
        top_features = sorted_features[:3]

        # Human-readable decision drivers
        drivers = self._format_drivers(top_features, base_value, features_dict)

        return {
            "base_value": round(float(base_value), 4),
            "shap_values": shap_dict,
            "top_features": [(f, round(v, 4)) for f, v in top_features],
            "decision_drivers": drivers,
        }

    def _format_drivers(
        self,
        top_features: list[tuple],
        base_value: float,
        features_dict: dict | None,
    ) -> str:
        """
        Generate a human-readable summary of the decision drivers.

        Example output:
            "The main factors for this decision are: Years of Experience
             (+0.23, strongly favoring Invite), Education Level (-0.15,
             moderately favoring Reject), and International Experience
             (+0.08, slightly favoring Invite)."
        """
        parts = []
        for feature_name, shap_val in top_features:
            if abs(shap_val) < 0.01:
                impact = "negligible impact"
            elif abs(shap_val) < 0.05:
                impact = "slightly favoring"
            elif abs(shap_val) < 0.15:
                impact = "moderately favoring"
            else:
                impact = "strongly favoring"

            direction = "Invite" if shap_val > 0 else "Reject"
            parts.append(
                f"{feature_name} ({shap_val:+.2f}, {impact} {direction})"
            )

        if not parts:
            return "No significant decision drivers identified."

        drivers_text = ", ".join(parts[:-1])
        if len(parts) > 1:
            drivers_text += f", and {parts[-1]}"
        else:
            drivers_text = parts[0]

        return f"The main factors for this decision are: {drivers_text}."

    def explain_batch(
        self,
        X: np.ndarray | pd.DataFrame,
    ) -> list[dict]:
        """
        Compute SHAP explanations for multiple candidates.

        Parameters
        ----------
        X : array-like, shape (n_samples, n_features)
            Scaled feature matrix.

        Returns
        -------
        list[dict]
            List of explanation dicts, one per candidate.
        """
        if isinstance(X, pd.DataFrame):
            X_arr = X.values
        else:
            X_arr = np.atleast_2d(X)

        shap_values = self.explainer.shap_values(X_arr)

        if isinstance(shap_values, list):
            sv_all = shap_values[1]  # Invite class
            base_value = self.explainer.expected_value[1]
        else:
            sv_all = shap_values
            base_value = float(self.explainer.expected_value)

        results = []
        for i in range(sv_all.shape[0]):
            sv = sv_all[i]
            shap_dict = {}
            for j, label in enumerate(self.feature_labels):
                shap_dict[label] = round(float(sv[j]), 4)

            sorted_features = sorted(
                shap_dict.items(), key=lambda x: abs(x[1]), reverse=True
            )
            top_features = sorted_features[:3]
            drivers = self._format_drivers(top_features, base_value, None)

            results.append({
                "base_value": round(float(base_value), 4),
                "shap_values": shap_dict,
                "top_features": [(f, round(v, 4)) for f, v in top_features],
                "decision_drivers": drivers,
            })

        return results


# ---------------------------------------------------------------------------
# Convenience: create and save explainer
# ---------------------------------------------------------------------------

def create_explainer(model, X_train_scaled, feature_names):
    """
    Factory function to create a SHAPExplainer.

    Parameters
    ----------
    model : trained sklearn model
    X_train_scaled : np.ndarray or pd.DataFrame
        Scaled training data.
    feature_names : list[str]

    Returns
    -------
    SHAPExplainer
    """
    return SHAPExplainer(model, X_train_scaled, feature_names)
