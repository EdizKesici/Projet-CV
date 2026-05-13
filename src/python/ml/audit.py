"""
Fairness Audit Module — CV Pre-Screening V2
=============================================
Computes fairness metrics on model predictions to detect and quantify
discrimination patterns across sensitive groups.

Metrics implemented
------------------
- EPD (Ecart de Parite Demographique) : |P(Invite|H) - P(Invite|F)|
  Seuil d'alerte : Delta > 5 points
  Ref: AI Act, considérant 27

- RID (Ratio d'Impact Differentiel) : P(Invite|F) / P(Invite|H)
  Un ratio < 1.0 indique que les femmes sont moins favorisees.
  Ref: Directive 2006/54/CE (art. 2), AI Act art. 10

- Delta TPR (Egalite des Chances) : |TPR_H - TPR_F|
  Seuil d'alerte : Delta > 5 points
  Detecte si le modele manque plus souvent des candidates qualifiees.

- Proxy analysis : Pearson correlation and mutual information between
  gender and each feature, to detect indirect proxies.

Usage
-----
    from ml.audit import compute_fairness_metrics, detect_proxies, plot_fairness_report

    metrics = compute_fairness_metrics(y_true, y_pred, sensitive_features)
    proxies = detect_proxies(X_df, sensitive_series)
    plot_fairness_report(metrics, proxies, plots_dir)
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.metrics import confusion_matrix

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EPD_ALERT_THRESHOLD = 5.0      # percentage points
TPR_ALERT_THRESHOLD = 5.0      # percentage points

PALETTE = {"Reject": "#E05252", "Invite": "#52A0E0", "Alert": "#FF6B35"}

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
# Core metrics
# ---------------------------------------------------------------------------

def compute_fairness_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    sensitive_features: np.ndarray,
    group_names: dict | None = None,
) -> dict:
    """
    Compute EPD, RID, and Delta-TPR fairness metrics.

    Parameters
    ----------
    y_true : array-like
        True binary labels (0=Reject, 1=Invite).
    y_pred : array-like
        Predicted binary labels (0=Reject, 1=Invite).
    sensitive_features : array-like
        Sensitive attribute values (0=Female, 1=Male).
    group_names : dict, optional
        Mapping from sensitive value to display name,
        e.g. {0: "Women", 1: "Men"}. Defaults to {0: "Female", 1: "Male"}.

    Returns
    -------
    dict
        {
            "epd": float,           # Ecart de Parite Demographique (pct points)
            "epd_alert": bool,      # True if EPD > threshold
            "rid": float,           # Ratio d'Impact Differentiel
            "rid_alert": bool,      # True if RID significantly < 1.0
            "delta_tpr": float,     # |TPR_M - TPR_F| (pct points)
            "delta_tpr_alert": bool,# True if delta_tpr > threshold
            "group_stats": {
                "Male":   {"n": int, "invite_rate": float, "tpr": float, "fpr": float},
                "Female": {"n": int, "invite_rate": float, "tpr": float, "fpr": float},
            }
        }
    """
    if group_names is None:
        group_names = {0: "Female", 1: "Male"}

    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    sensitive = np.asarray(sensitive_features)

    group_stats = {}
    for val, name in group_names.items():
        mask = sensitive == val
        n = mask.sum()
        if n == 0:
            group_stats[name] = {
                "n": 0, "invite_rate": 0.0, "tpr": 0.0, "fpr": 0.0
            }
            continue

        y_t = y_true[mask]
        y_p = y_pred[mask]
        invite_rate = y_p.mean() * 100  # percentage

        # TPR = TP / (TP + FN)  — true positive rate among actual positives
        positives = y_t == 1
        tpr = (y_p[positives] == 1).mean() * 100 if positives.sum() > 0 else 0.0

        # FPR = FP / (FP + TN)  — false positive rate among actual negatives
        negatives = y_t == 0
        fpr = (y_p[negatives] == 1).mean() * 100 if negatives.sum() > 0 else 0.0

        group_stats[name] = {
            "n": int(n),
            "invite_rate": round(invite_rate, 1),
            "tpr": round(tpr, 1),
            "fpr": round(fpr, 1),
        }

    male_stats = group_stats.get("Male", group_stats.get("male", {}))
    female_stats = group_stats.get("Female", group_stats.get("female", {}))

    # EPD: |P(Invite|H) - P(Invite|F)|
    male_invite_rate = male_stats.get("invite_rate", 0.0)
    female_invite_rate = female_stats.get("invite_rate", 0.0)
    epd = abs(male_invite_rate - female_invite_rate)

    # RID: P(Invite|F) / P(Invite|H)
    rid = female_invite_rate / male_invite_rate if male_invite_rate > 0 else float("inf")

    # Delta TPR: |TPR_M - TPR_F|
    male_tpr = male_stats.get("tpr", 0.0)
    female_tpr = female_stats.get("tpr", 0.0)
    delta_tpr = abs(male_tpr - female_tpr)

    return {
        "epd": round(epd, 1),
        "epd_alert": epd > EPD_ALERT_THRESHOLD,
        "rid": round(rid, 3),
        "rid_alert": rid < 0.8,  # significant disparity
        "delta_tpr": round(delta_tpr, 1),
        "delta_tpr_alert": delta_tpr > TPR_ALERT_THRESHOLD,
        "group_stats": group_stats,
    }


# ---------------------------------------------------------------------------
# Proxy detection
# ---------------------------------------------------------------------------

def detect_proxies(
    X_df: pd.DataFrame,
    sensitive_series: pd.Series,
) -> pd.DataFrame:
    """
    Test correlations between the sensitive attribute (gender) and each feature
    using Pearson correlation and mutual information.

    Parameters
    ----------
    X_df : pd.DataFrame
        Feature dataframe (numeric columns only).
    sensitive_series : pd.Series
        Binary sensitive attribute (0=Female, 1=Male).

    Returns
    -------
    pd.DataFrame
        Columns: feature, pearson_r, pearson_pval, mutual_info
        Sorted by absolute Pearson correlation (descending).
    """
    from sklearn.feature_selection import mutual_info_classif
    from scipy import stats

    results = []
    sensitive = sensitive_series.values

    mi_values = mutual_info_classif(
        X_df.values, sensitive, random_state=42
    )

    for i, col in enumerate(X_df.columns):
        r, pval = stats.pearsonr(X_df[col].values, sensitive)
        results.append({
            "feature": col,
            "pearson_r": round(r, 4),
            "pearson_pval": round(pval, 4),
            "mutual_info": round(mi_values[i], 4),
            "is_proxy": abs(r) > 0.3,  # threshold for proxy detection
        })

    return pd.DataFrame(results).sort_values(
        by="pearson_r", key=lambda x: abs(x), ascending=False
    )


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------

def plot_fairness_report(
    metrics: dict,
    proxies: pd.DataFrame | None,
    plots_dir: str,
    version_label: str = "V2",
) -> None:
    """
    Generate a comprehensive fairness audit visualization.

    Creates two plots:
    - 06_fairness_metrics.png : EPD, RID, Delta-TPR bar chart with alert zones
    - 07_proxy_analysis.png   : Feature-gender correlation chart
    """
    os.makedirs(plots_dir, exist_ok=True)

    # --- Plot 1: Fairness Metrics Summary ---
    fig, axes = plt.subplots(1, 3, figsize=(14, 5))

    group_stats = metrics["group_stats"]

    # EPD
    ax = axes[0]
    male_rate = group_stats.get("Male", {}).get("invite_rate", 0)
    female_rate = group_stats.get("Female", {}).get("invite_rate", 0)
    bars = ax.bar(
        ["Male", "Female"], [male_rate, female_rate],
        color=["#4A90D9", "#D94A7A"], width=0.5, edgecolor="white", linewidth=1.5
    )
    for bar, rate in zip(bars, [male_rate, female_rate]):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f"{rate:.1f}%", ha="center", va="bottom", fontsize=11, fontweight="bold")
    epd_text = f"EPD = {metrics['epd']:.1f} pts"
    alert_text = " [ALERT]" if metrics["epd_alert"] else " [OK]"
    ax.set_title(f"Invite Rate by Gender\n{epd_text}{alert_text}",
                 fontsize=12, fontweight="bold",
                 color="#FF6B35" if metrics["epd_alert"] else "#2C3E50")
    ax.set_ylabel("Invite Rate (%)")
    ax.axhline(y=0, color="gray", linewidth=0.5)

    # RID
    ax = axes[1]
    rid = metrics["rid"]
    bar_color = "#FF6B35" if metrics["rid_alert"] else "#2ECC71"
    ax.bar(["RID"], [rid], color=bar_color, width=0.4, edgecolor="white", linewidth=1.5)
    ax.axhline(y=1.0, color="gray", linewidth=1, linestyle="--", label="Parity (1.0)")
    ax.axhline(y=0.8, color="#FF6B35", linewidth=1, linestyle=":", label="Alert threshold (0.8)")
    ax.text(0, rid + 0.02, f"{rid:.3f}", ha="center", va="bottom", fontsize=12, fontweight="bold")
    ax.set_title("Ratio d'Impact Differentiel\n(Female / Male)",
                 fontsize=12, fontweight="bold",
                 color="#FF6B35" if metrics["rid_alert"] else "#2C3E50")
    ax.set_ylabel("Ratio")
    ax.set_ylim(0, max(1.3, rid + 0.2))
    ax.legend(loc="best", fontsize=9)

    # Delta TPR
    ax = axes[2]
    male_tpr = group_stats.get("Male", {}).get("tpr", 0)
    female_tpr = group_stats.get("Female", {}).get("tpr", 0)
    bars = ax.bar(
        ["Male", "Female"], [male_tpr, female_tpr],
        color=["#4A90D9", "#D94A7A"], width=0.5, edgecolor="white", linewidth=1.5
    )
    for bar, rate in zip(bars, [male_tpr, female_tpr]):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f"{rate:.1f}%", ha="center", va="bottom", fontsize=11, fontweight="bold")
    dtpr_text = f"Delta TPR = {metrics['delta_tpr']:.1f} pts"
    alert_text = " [ALERT]" if metrics["delta_tpr_alert"] else " [OK]"
    ax.set_title(f"True Positive Rate by Gender\n{dtpr_text}{alert_text}",
                 fontsize=12, fontweight="bold",
                 color="#FF6B35" if metrics["delta_tpr_alert"] else "#2C3E50")
    ax.set_ylabel("TPR (%)")

    fig.suptitle(f"Fairness Audit Report — {version_label}",
                 fontsize=14, fontweight="bold", y=1.02)
    fig.tight_layout()
    filepath = os.path.join(plots_dir, "06_fairness_metrics.png")
    fig.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[PLOT]    Saved -> {filepath}")

    # --- Plot 2: Proxy Analysis ---
    if proxies is not None and len(proxies) > 0:
        fig, ax = plt.subplots(figsize=(10, 5))

        colors = ["#FF6B35" if proxy else "#2ECC71" for proxy in proxies["is_proxy"]]
        bars = ax.barh(
            proxies["feature"], proxies["pearson_r"].abs(),
            color=colors, edgecolor="white", height=0.6
        )
        ax.axvline(x=0.3, color="#FF6B35", linewidth=1, linestyle="--", label="Proxy threshold (|r|=0.3)")
        ax.set_title("Feature-Gender Correlation (Proxy Analysis)",
                     fontsize=14, fontweight="bold", pad=12)
        ax.set_xlabel("|Pearson r| with Gender")
        ax.legend(loc="best", fontsize=9)

        # Annotate bars
        for bar, r_val in zip(bars, proxies["pearson_r"]):
            ax.text(bar.get_width() + 0.01, bar.get_y() + bar.get_height() / 2,
                    f"r={r_val:.3f}", va="center", fontsize=9)

        fig.tight_layout()
        filepath = os.path.join(plots_dir, "07_proxy_analysis.png")
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"[PLOT]    Saved -> {filepath}")


# ---------------------------------------------------------------------------
# Convenience: full audit pipeline
# ---------------------------------------------------------------------------

def run_audit(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    sensitive_features: np.ndarray,
    X_df: pd.DataFrame | None = None,
    plots_dir: str | None = None,
    version_label: str = "V2",
) -> dict:
    """
    Run the complete fairness audit pipeline.

    Parameters
    ----------
    y_true, y_pred, sensitive_features : arrays
        As in compute_fairness_metrics().
    X_df : pd.DataFrame, optional
        Feature matrix for proxy detection. If None, proxy analysis is skipped.
    plots_dir : str, optional
        Directory to save plots. If None, no plots are generated.
    version_label : str
        Label for plot titles.

    Returns
    -------
    dict
        { "metrics": dict, "proxies": pd.DataFrame or None }
    """
    metrics = compute_fairness_metrics(y_true, y_pred, sensitive_features)

    proxies = None
    if X_df is not None:
        proxies = detect_proxies(X_df, pd.Series(sensitive_features, name="gender"))

    if plots_dir is not None:
        plot_fairness_report(metrics, proxies, plots_dir, version_label)

    return {"metrics": metrics, "proxies": proxies}


# ---------------------------------------------------------------------------
# Imports needed for plotting
# ---------------------------------------------------------------------------
import os
