"""
CV Inbox Watcher — V2 (Fairness-Aware)
=======================================
Simple automation daemon that continuously polls the INBOX_DIR for new CVs.
Uses SHA-256 content hashing for deduplication via the shared registry module.

V2: Uses the updated predict module with ThresholdOptimizer fairness adjustment.
"""

import glob
import os
import shutil
import sys
import time
import traceback

from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE / "ml"))

import hard_filter
from feature_extractor import extract_features
from predict import predict, model_is_ready
from logger import log_result
from registry import compute_file_hash, is_processed, register_file

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INBOX_DIR = os.getenv("INBOX_DIR", "/app/data/input_CVs")
PROCESSED_DIR = os.getenv("PROCESSED_DIR", "/app/data/processed_CVs")
REGISTRY_PATH = os.getenv("REGISTRY_PATH", "/app/data/processed_registry.json")
LOG_PATH = os.getenv("LOG_PATH", "/app/data/screening_log.csv")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "10"))

JOB_CONFIG = {}


def process_single_file(filepath: str, job_config: dict) -> dict:
    """Process a single CV file through the V2 screening pipeline."""
    filename = os.path.basename(filepath)

    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    features = extract_features(text, filename=filename)
    filter_result = hard_filter.apply(features, job_config)

    result = {
        "filename": filename,
        "name": features.get("name"),
        "target_role": features.get("target_role"),
    }

    if not filter_result["passed"]:
        result.update({
            "stage": "hard_filter",
            "label": "Reject",
            "reasons": filter_result["reasons"],
            "fairness_adjusted": False,
        })
    elif model_is_ready():
        # V2: predict with ThresholdOptimizer (explain=False for batch)
        ml_result = predict(features, explain=False)
        result.update({
            "stage": "ml_model",
            "label": ml_result["label"],
            "confidence": ml_result["confidence"],
            "model_name": ml_result["model_name"],
            "fairness_adjusted": ml_result.get("fairness_adjusted", False),
        })
    else:
        result.update({
            "stage": "hard_filter",
            "label": "No_Model",
            "reasons": "Passed hard filter but ML model not trained",
            "fairness_adjusted": False,
        })

    return result


def run_watcher():
    """Main watcher loop — polls inbox and processes new CVs."""
    print(f"[WATCHER] Starting inbox watcher (V2). Polling '{INBOX_DIR}' every {POLL_INTERVAL}s...")
    os.makedirs(PROCESSED_DIR, exist_ok=True)

    while True:
        try:
            files = glob.glob(os.path.join(INBOX_DIR, "*.txt"))

            for filepath in files:
                filename = os.path.basename(filepath)
                file_hash = compute_file_hash(filepath)

                if is_processed(REGISTRY_PATH, file_hash):
                    continue

                print(f"[WATCHER] New file detected: {filename}")
                try:
                    result = process_single_file(filepath, JOB_CONFIG)
                    log_result(result, LOG_PATH)

                    dest = os.path.join(PROCESSED_DIR, filename)
                    shutil.move(filepath, dest)

                    register_file(REGISTRY_PATH, filename, file_hash)

                    fa_flag = " [FAIR]" if result.get("fairness_adjusted") else ""
                    print(f"[WATCHER] Processed & moved: {filename} -> {result['label']}{fa_flag}")

                except Exception as exc:
                    print(f"[WATCHER] ERROR processing {filename}: {exc}")
                    traceback.print_exc()

        except Exception as exc:
            print(f"[WATCHER] Fatal loop error: {exc}")
            traceback.print_exc()

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run_watcher()
