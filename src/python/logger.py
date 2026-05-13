# src/python/logger.py
"""
Screening Logger — V2
=====================
Appends screening results to a persistent CSV log file.
Used by both the Flask API and the Watcher daemon.

V2: Added 'fairness_adjusted' and 'top_driver' columns.
"""

import csv
import os
from datetime import datetime

LOG_COLUMNS = [
    "timestamp",
    "filename",
    "name",
    "target_role",
    "stage",
    "label",
    "confidence",
    "model_name",
    "fairness_adjusted",
    "top_driver",
    "reasons",
]


def log_result(result_dict: dict, log_path: str) -> None:
    """
    Append a screening result to the CSV log.

    Parameters
    ----------
    result_dict : dict
        Dictionary containing screening result data.
    log_path : str
        Path to the CSV log file.
    """
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)

    # Format reasons list as a single string if present
    reasons = result_dict.get("reasons")
    if isinstance(reasons, list):
        reasons = "; ".join(reasons)

    # V2: Extract top SHAP driver if explanation is present
    top_driver = ""
    explanation = result_dict.get("explanation")
    if explanation and isinstance(explanation, dict):
        top_features = explanation.get("top_features", [])
        if top_features:
            top_driver = f"{top_features[0][0]} ({top_features[0][1]:+.2f})"

    # Ensure all columns exist in the dict, default to empty string
    row = {col: result_dict.get(col, "") for col in LOG_COLUMNS}
    row["timestamp"] = datetime.now().isoformat()

    # Write back the formatted values
    if isinstance(reasons, str):
        row["reasons"] = reasons
    row["fairness_adjusted"] = result_dict.get("fairness_adjusted", "")
    row["top_driver"] = top_driver

    write_header = not os.path.exists(log_path)

    with open(log_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_COLUMNS, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerow(row)
