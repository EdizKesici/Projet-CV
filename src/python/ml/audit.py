"""
Fairness Audit Module — CV Pre-Screening V2.1 (Multi-Attribute Fairness)
=========================================================================
Computes fairness metrics on model predictions to detect and quantify
discrimination patterns across sensitive groups.

Protected attributes audited
-----------------------------
- gender  (0=Female, 1=Male)     — Loi 10/05/2007, Directive 2000/78/CE
- age     (grouped into tranches) — Loi 10/05/2007, Directive 2000/78/CE

Metrics implemented
-------------------
- EPD (Ecart de Parite Demographique) : |P(Invite|G1) - P(Invite|G2)|
  Alert threshold: Delta > 5 points
  Ref: AI Act, considérant 27

- RID (Ratio d'Impact Differentiel) : P(Invite|minority) / P(Invite|majority)
  Two-level alert (see RID_WARN_THRESHOLD and RID_ALERT_THRESHOLD below).
  Ref: Directive 2006/54/CE (art. 2), AI Act art. 10

- Delta TPR (Egalite des Chances) : |TPR_G1 - TPR_G2|
  Alert threshold: Delta > 5 points
  Detects if the model misses more qualified candidates in one group.

- Proxy analysis : Pearson correlation and mutual information between
  the sensitive attribute and each feature, to detect indirect proxies.

Intersectional analysis — known limitation
-------------------------------------------
Full intersectional analysis (e.g., "Women Over 45") is intentionally not
implemented in V2. With the synthetic training dataset (~500 CVs), each
intersectional subgroup (gender × age_group) contains fewer than 30 samples,
making statistical metrics unreliable and potentially misleading.

This limitation must be addressed when real-world data becomes available.
Reference: UNIA intersectionality framework; AI Act art. 10.

Usage
-----
    from ml.audit import (
        compute_fairness_metrics, compute_age_fairness_metrics,
        detect_proxies, run_audit, get_age_group, AGE_GROUP_LABELS
    )
"""

import os

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.metrics import confusion_matrix

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EPD_ALERT_THRESHOLD = 5.0      # percentage points — triggers for both gender and age audits

TPR_ALERT_THRESHOLD = 5.0      # percentage points

# RID thresholds — two levels to distinguish ethical target from legal minimum.
# RID_WARN_THRESHOLD : target defined in WP2 audit report (section 6.3).
# RID_ALERT_THRESHOLD: based on the EEOC 4/5 rule — absolute legal minimum;
#                      this level alone is insufficient as an ethical standard.
RID_WARN_THRESHOLD  = 0.95     # WARN  — below target; review required
RID_ALERT_THRESHOLD = 0.80     # ALERT — significant disparity; immediate action

# Age group bins (years) — aligned with common legal and HR segmentation.
# Used to convert a raw age value to a group index for fairness auditing.
AGE_GROUP_LABELS = {0: "Under 30", 1: "30 to 45", 2: "Over 45"}

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
# Age group utility
# ---------------------------------------------------------------------------

def get_age_group(age: float) -> int:
    """
    Convert a raw age value to an age group index.

    Groups align with AGE_GROUP_LABELS:
        0 — Under 30
        1 — 30 to 45
        2 — Over 45

    Returns -1 for invalid or unknown age (age <= 0).
    """
    if age is None or age <= 0:
        return -1
    if age < 30:
        return 0
    elif age <= 45:
        return 1
    else:
        return 2


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
        # Two-level RID alert: warn first (below target), alert if severe.
        "rid_warn":  rid < RID_WARN_THRESHOLD,
        "rid_alert": rid < RID_ALERT_THRESHOLD,
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
# Age-group fairness metrics  (Point 1 — age as protected attribute)
# ---------------------------------------------------------------------------

def compute_age_fairness_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    age_groups: np.ndarray,
) -> dict:
    """
    Compute EPD, RID, and Delta-TPR fairness metrics across age groups.

    Age is a protected attribute under the Luxembourg Law of 10/05/2007
    and EU Directive 2000/78/CE. Candidates with negative age group values
    (-1 = unknown) are excluded from this analysis.

    Parameters
    ----------
    y_true : array-like
        True binary labels (0=Reject, 1=Invite).
    y_pred : array-like
        Predicted binary labels (0=Reject, 1=Invite).
    age_groups : array-like
        Age group indices (0=Under 30, 1=30-45, 2=Over 45, -1=unknown).

    Returns
    -------
    dict
        {
            "group_stats": {
                "Under 30": {"n", "invite_rate", "tpr", "fpr"},
                "30 to 45": ...,
                "Over 45":  ...,
            },
            "pairwise": [
                {
                    "groups": ("Under 30", "Over 45"),
                    "epd": float,
                    "epd_alert": bool,
                    "rid": float,
                    "rid_warn": bool,
                    "rid_alert": bool,
                    "delta_tpr": float,
                    "delta_tpr_alert": bool,
                },
                ...
            ],
            "max_epd": float,
            "min_rid": float,
            "max_delta_tpr": float,
        }
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    age_groups = np.asarray(age_groups)

    # Exclude candidates with unknown age
    valid_mask = age_groups >= 0
    if valid_mask.sum() == 0:
        return {"group_stats": {}, "pairwise": [], "max_epd": 0.0, "min_rid": 1.0, "max_delta_tpr": 0.0}

    y_true_v  = y_true[valid_mask]
    y_pred_v  = y_pred[valid_mask]
    groups_v  = age_groups[valid_mask]

    # Per-group statistics
    group_stats = {}
    for group_idx, group_name in AGE_GROUP_LABELS.items():
        mask = groups_v == group_idx
        n = int(mask.sum())
        if n == 0:
            group_stats[group_name] = {"n": 0, "invite_rate": 0.0, "tpr": 0.0, "fpr": 0.0}
            continue

        y_t = y_true_v[mask]
        y_p = y_pred_v[mask]
        invite_rate = float(y_p.mean() * 100)

        positives = y_t == 1
        tpr = float((y_p[positives] == 1).mean() * 100) if positives.sum() > 0 else 0.0
        negatives = y_t == 0
        fpr = float((y_p[negatives] == 1).mean() * 100) if negatives.sum() > 0 else 0.0

        group_stats[group_name] = {
            "n": n,
            "invite_rate": round(invite_rate, 1),
            "tpr": round(tpr, 1),
            "fpr": round(fpr, 1),
        }

    # Pairwise comparisons between all groups
    # Convention: compare "advantaged" (highest invite rate) vs each other group.
    group_names = list(AGE_GROUP_LABELS.values())
    pairwise = []
    for i in range(len(group_names)):
        for j in range(i + 1, len(group_names)):
            g1, g2 = group_names[i], group_names[j]
            s1 = group_stats.get(g1, {})
            s2 = group_stats.get(g2, {})
            if s1.get("n", 0) == 0 or s2.get("n", 0) == 0:
                continue

            ir1 = s1["invite_rate"]
            ir2 = s2["invite_rate"]
            epd = abs(ir1 - ir2)

            # RID: lower invite rate / higher invite rate
            higher = max(ir1, ir2)
            lower  = min(ir1, ir2)
            rid = lower / higher if higher > 0 else 1.0

            tpr1 = s1["tpr"]
            tpr2 = s2["tpr"]
            delta_tpr = abs(tpr1 - tpr2)

            pairwise.append({
                "groups": (g1, g2),
                "epd": round(epd, 1),
                "epd_alert": epd > EPD_ALERT_THRESHOLD,
                "rid": round(rid, 3),
                "rid_warn":  rid < RID_WARN_THRESHOLD,
                "rid_alert": rid < RID_ALERT_THRESHOLD,
                "delta_tpr": round(delta_tpr, 1),
                "delta_tpr_alert": delta_tpr > TPR_ALERT_THRESHOLD,
            })

    max_epd       = max((p["epd"]       for p in pairwise), default=0.0)
    min_rid       = min((p["rid"]       for p in pairwise), default=1.0)
    max_delta_tpr = max((p["delta_tpr"] for p in pairwise), default=0.0)

    return {
        "group_stats":    group_stats,
        "pairwise":       pairwise,
        "max_epd":        round(max_epd, 1),
        "min_rid":        round(min_rid, 3),
        "max_delta_tpr":  round(max_delta_tpr, 1),
    }


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
    ax.axhline(y=RID_WARN_THRESHOLD,  color="#EF9F27", linewidth=1, linestyle=":",
               label=f"Target threshold ({RID_WARN_THRESHOLD})")
    ax.axhline(y=RID_ALERT_THRESHOLD, color="#FF6B35", linewidth=1, linestyle=":",
               label=f"Alert threshold ({RID_ALERT_THRESHOLD})")
    ax.text(0, rid + 0.02, f"{rid:.3f}", ha="center", va="bottom", fontsize=12, fontweight="bold")
    rid_color = "#FF6B35" if metrics["rid_alert"] else ("#EF9F27" if metrics["rid_warn"] else "#2ECC71")
    ax.set_title("Ratio d'Impact Differentiel\n(Female / Male)",
                 fontsize=12, fontweight="bold", color=rid_color)
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


def plot_age_fairness_report(
    age_metrics: dict,
    plots_dir: str,
    version_label: str = "V2",
) -> None:
    """
    Generate an age-group fairness visualization.

    Creates one plot:
    - 09_age_fairness_metrics.png : invite rate and TPR by age group,
      with pairwise EPD/RID annotations.
    """
    group_stats = age_metrics.get("group_stats", {})
    if not group_stats:
        print("[WARN] No age group data available for plot 09.")
        return

    os.makedirs(plots_dir, exist_ok=True)

    group_names  = [AGE_GROUP_LABELS[k] for k in sorted(AGE_GROUP_LABELS)]
    invite_rates = [group_stats.get(g, {}).get("invite_rate", 0) for g in group_names]
    tpr_values   = [group_stats.get(g, {}).get("tpr", 0)         for g in group_names]
    n_values     = [group_stats.get(g, {}).get("n", 0)            for g in group_names]

    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    colors = ["#4A90D9", "#52A0E0", "#88C1F0"]

    # --- Invite Rate by Age Group ---
    ax = axes[0]
    bars = ax.bar(group_names, invite_rates, color=colors, width=0.5,
                  edgecolor="white", linewidth=1.5)
    for bar, rate, n in zip(bars, invite_rates, n_values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f"{rate:.1f}%\n(n={n})", ha="center", va="bottom", fontsize=10, fontweight="bold")
    ax.set_title(f"Invite Rate by Age Group\nMax EPD = {age_metrics['max_epd']:.1f} pts",
                 fontsize=12, fontweight="bold",
                 color="#FF6B35" if age_metrics["max_epd"] > EPD_ALERT_THRESHOLD else "#2C3E50")
    ax.set_ylabel("Invite Rate (%)")
    ax.set_ylim(0, max(invite_rates + [10]) * 1.35)

    # --- TPR by Age Group ---
    ax = axes[1]
    bars = ax.bar(group_names, tpr_values, color=colors, width=0.5,
                  edgecolor="white", linewidth=1.5)
    for bar, tpr, n in zip(bars, tpr_values, n_values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f"{tpr:.1f}%\n(n={n})", ha="center", va="bottom", fontsize=10, fontweight="bold")
    ax.set_title(
        f"True Positive Rate (Recall) by Age Group\nMax ΔRecall = {age_metrics['max_delta_tpr']:.1f} pts",
        fontsize=12, fontweight="bold",
        color="#FF6B35" if age_metrics["max_delta_tpr"] > TPR_ALERT_THRESHOLD else "#2C3E50",
    )
    ax.set_ylabel("TPR (%)")
    ax.set_ylim(0, max(tpr_values + [10]) * 1.35)

    fig.suptitle(
        f"Age Group Fairness Audit — {version_label}\n"
        f"(Protected attribute: age — Loi 10/05/2007, Directive 2000/78/CE)",
        fontsize=13, fontweight="bold", y=1.03,
    )
    fig.tight_layout()
    filepath = os.path.join(plots_dir, "09_age_fairness_metrics.png")
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
    age_features: np.ndarray | None = None,
    X_df: pd.DataFrame | None = None,
    plots_dir: str | None = None,
    version_label: str = "V2",
) -> dict:
    """
    Run the complete fairness audit pipeline.

    Audits two protected attributes independently:
    - gender (via sensitive_features): EPD, RID, Delta-TPR
    - age group (via age_features):    EPD, RID, Delta-TPR by tranche

    Intersectional Analysis — documented limitation
    ------------------------------------------------
    Full intersectional analysis (e.g., "Women Over 45") is not performed
    because the synthetic training dataset (~500 CVs) produces subgroups
    with fewer than 30 samples each, making metrics statistically unreliable.
    Implement intersectional audit when real-world data is available.
    Reference: UNIA framework; AI Act art. 10.

    Parameters
    ----------
    y_true, y_pred, sensitive_features : arrays
        As in compute_fairness_metrics().
    age_features : array-like, optional
        Age group indices (0/1/2 from get_age_group()). If None, age audit is skipped.
    X_df : pd.DataFrame, optional
        Feature matrix for proxy detection. If None, proxy analysis is skipped.
    plots_dir : str, optional
        Directory to save plots. If None, no plots are generated.
    version_label : str
        Label for plot titles.

    Returns
    -------
    dict
        {
            "metrics":      dict,              # gender fairness metrics
            "age_metrics":  dict | None,       # age group fairness metrics
            "proxies":      pd.DataFrame | None,
        }
    """
    metrics = compute_fairness_metrics(y_true, y_pred, sensitive_features)

    age_metrics = None
    if age_features is not None:
        age_metrics = compute_age_fairness_metrics(y_true, y_pred, np.asarray(age_features))

    proxies = None
    if X_df is not None:
        proxies = detect_proxies(X_df, pd.Series(sensitive_features, name="gender"))

    if plots_dir is not None:
        plot_fairness_report(metrics, proxies, plots_dir, version_label)
        if age_metrics is not None:
            plot_age_fairness_report(age_metrics, plots_dir, version_label)

    return {"metrics": metrics, "age_metrics": age_metrics, "proxies": proxies}