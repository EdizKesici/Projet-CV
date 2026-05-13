"""
Training Data Preparation Script
=================================
Combines feature extraction and label merging into a single, reproducible step.

What this script does
---------------------
1. Runs the feature extractor over all CV files in the training folder.
2. Loads the historical hiring labels from ``student_labels.csv``.
3. Merges features with labels on the ``filename`` column.
4. Writes the final ``cv_features_labeled.csv`` ready for ``ml/train.py``.

Usage
-----
    python prepare_training_data.py

    # Custom paths:
    python prepare_training_data.py \\
        --cvs     data/training_data/CVs \\
        --labels  data/training_data/student_labels.csv \\
        --output  data/training_data/cv_features_labeled.csv

Expected label file format (student_labels.csv)
------------------------------------------------
    filename,passed_next_stage
    cv_0001.txt,0
    cv_0002.txt,1
    ...

Output CSV columns
------------------
    filename, name, target_role,
    age, years_experience,
    education_level, nb_certifications,
    nb_languages, max_language_level,
    nb_skills
    label   ← 0 (Reject) or 1 (Invite)
"""

import argparse
import os
import sys

import pandas as pd

# Allow running from the project root or the src/python directory
sys.path.insert(0, os.path.dirname(__file__))
from feature_extractor import process_folder

# ---------------------------------------------------------------------------
# Default paths (relative to this script's location)
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

DEFAULT_CVS_DIR = os.path.join(_PROJECT_ROOT, "data", "training_data", "CVs")
DEFAULT_LABELS_CSV = os.path.join(_PROJECT_ROOT, "data", "training_data", "student_labels.csv")
DEFAULT_OUTPUT_CSV = os.path.join(_PROJECT_ROOT, "data", "training_data", "cv_features_labeled.csv")
_INTERIM_CSV = os.path.join(_PROJECT_ROOT, "data", "training_data", "_cv_features_raw.csv")


def prepare(cvs_dir: str, labels_csv: str, output_csv: str) -> None:
    """
    Extract features, merge with labels, and write the final dataset.

    Parameters
    ----------
    cvs_dir : str
        Directory containing raw CV .txt files.
    labels_csv : str
        Path to the CSV file containing historical hiring decisions.
    output_csv : str
        Destination path for the labeled feature dataset.
    """
    # ------------------------------------------------------------------
    # Step 1 — Extract features from all CVs
    # ------------------------------------------------------------------
    print("=" * 60)
    print("STEP 1 — Feature extraction")
    print("=" * 60)
    process_folder(cvs_dir, _INTERIM_CSV)

    # ------------------------------------------------------------------
    # Step 2 — Load features and labels
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("STEP 2 — Loading features and labels")
    print("=" * 60)

    if not os.path.exists(_INTERIM_CSV):
        print(f"[ERROR] Feature file not found: {_INTERIM_CSV}")
        sys.exit(1)

    if not os.path.exists(labels_csv):
        print(f"[ERROR] Labels file not found: {labels_csv}")
        sys.exit(1)

    features_df = pd.read_csv(_INTERIM_CSV)
    labels_df = pd.read_csv(labels_csv)

    print(f"[INFO] Features loaded : {len(features_df)} rows")
    print(f"[INFO] Labels loaded   : {len(labels_df)} rows")

    # Validate expected columns
    if "filename" not in labels_df.columns or "passed_next_stage" not in labels_df.columns:
        print("[ERROR] student_labels.csv must have columns: filename, passed_next_stage")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 3 — Merge
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("STEP 3 — Merging features with labels")
    print("=" * 60)

    merged = features_df.merge(
        labels_df[["filename", "passed_next_stage"]],
        on="filename",
        how="inner",
    )
    merged.rename(columns={"passed_next_stage": "label"}, inplace=True)

    n_total = len(merged)
    n_invite = (merged["label"] == 1).sum()
    n_reject = (merged["label"] == 0).sum()
    n_missing = features_df.shape[0] - n_total

    print(f"[INFO] Merged records  : {n_total}")
    print(f"[INFO] Invited (1)     : {n_invite} ({n_invite / n_total * 100:.1f}%)")
    print(f"[INFO] Rejected (0)    : {n_reject} ({n_reject / n_total * 100:.1f}%)")
    if n_missing > 0:
        print(f"[WARNING] {n_missing} CV(s) had no matching label and were dropped.")

    # ------------------------------------------------------------------
    # Step 4 — Save
    # ------------------------------------------------------------------
    os.makedirs(os.path.dirname(os.path.abspath(output_csv)), exist_ok=True)
    merged.to_csv(output_csv, index=False)
    print(f"\n[DONE] Labeled dataset written → {output_csv}")

    # Clean up interim file
    if os.path.exists(_INTERIM_CSV):
        os.remove(_INTERIM_CSV)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Prepare labeled training data for the CV screening ML model."
    )
    parser.add_argument(
        "--cvs",
        default=DEFAULT_CVS_DIR,
        help="Folder containing raw CV .txt files",
    )
    parser.add_argument(
        "--labels",
        default=DEFAULT_LABELS_CSV,
        help="Path to student_labels.csv",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_CSV,
        help="Output path for the labeled feature CSV",
    )
    args = parser.parse_args()
    prepare(args.cvs, args.labels, args.output)