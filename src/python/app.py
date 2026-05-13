"""
LuxTalent Advisory Group — CV Pre-Screening API V2 (Fairness-Aware)
===================================================================
Flask REST API exposing the two-stage CV screening pipeline with
fairness and explainability features.

V2 New Endpoints
----------------
- GET  /fairness-metrics  : View fairness audit results (EPD, RID, Delta-TPR)
- POST /explain           : SHAP explanation for a single candidate

V2 Modified Endpoints
---------------------
- POST /predict           : Now includes SHAP explanation and fairness_adjusted flag
"""

import glob
import os
import shutil
import sys
import traceback

from flask import Flask, jsonify, request

# ---------------------------------------------------------------------------
# Robust sys.path configuration
# ---------------------------------------------------------------------------
from pathlib import Path
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE / "ml"))

import hard_filter
from feature_extractor import extract_features
from predict import (
    get_model_name,
    model_is_ready,
    predict,
    is_fairness_enabled,
    get_fairness_metrics,
)
from logger import log_result
from registry import (
    compute_file_hash,
    is_processed,
    register_file,
    load_registry,
    save_registry,
)

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------

app = Flask(__name__)

INBOX_DIR = os.getenv("INBOX_DIR", "/app/data/input_CVs")
PROCESSED_DIR = os.getenv("PROCESSED_DIR", "/app/data/processed_CVs")
REGISTRY_PATH = os.getenv("REGISTRY_PATH", "/app/data/processed_registry.json")
LOG_PATH = os.getenv("LOG_PATH", "/app/data/screening_log.csv")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_ready": model_is_ready(),
        "model_name": get_model_name() if model_is_ready() else None,
        "fairness_enabled": is_fairness_enabled(),
        "version": "V2",
    })


@app.route("/parse", methods=["POST"])
def parse_cv():
    """Extract features from a CV text without prediction."""
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "Missing required field: 'text'"}), 400

    try:
        features = extract_features(data["text"], filename=data.get("filename", ""))
        return jsonify(features)
    except Exception as exc:
        return jsonify({"error": str(exc), "trace": traceback.format_exc()}), 500


@app.route("/predict", methods=["POST"])
def predict_cv():
    """
    Full screening pipeline: hard filter -> ML model -> SHAP explanation.

    V2: Returns fairness_adjusted flag and SHAP explanation.
    """
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "Missing required field: 'text'"}), 400

    try:
        features = extract_features(data["text"], filename=data.get("filename", ""))
        job_config = data.get("job_config")  # None if not provided -> uses DEFAULT_JOB_CONFIG
        explain = data.get("explain", True)  # V2: SHAP explanation by default

        # --- Stage 1: Hard filter ---
        filter_result = hard_filter.apply(features, job_config)

        base_response = {
            "name": features.get("name"),
            "target_role": features.get("target_role"),
            "features": {k: v for k, v in features.items() if k != "languages_list"},
            "version": "V2",
        }

        if not filter_result["passed"]:
            response = {
                **base_response,
                "stage": "hard_filter",
                "passed": False,
                "label": "Reject",
                "reasons": filter_result["reasons"],
                "fairness_adjusted": False,
            }
            log_result({**response, "filename": data.get("filename", "")}, LOG_PATH)
            return jsonify(response)

        # --- Stage 2: ML model (V2: with ThresholdOptimizer + SHAP) ---
        if not model_is_ready():
            response = {
                **base_response,
                "stage": "hard_filter",
                "passed": True,
                "label": None,
                "message": "Model not yet trained — run ml/train.py first",
                "fairness_adjusted": False,
            }
            log_result({**response, "filename": data.get("filename", ""), "reasons": "Model not trained"}, LOG_PATH)
            return jsonify(response)

        ml_result = predict(features, explain=explain)
        response = {
            **base_response,
            "stage": "ml_model",
            "passed": True,
            "label": ml_result["label"],
            "confidence": ml_result["confidence"],
            "probabilities": ml_result["probabilities"],
            "model_name": ml_result["model_name"],
            "fairness_adjusted": ml_result.get("fairness_adjusted", False),
        }

        # V2: Include SHAP explanation if available
        if "explanation" in ml_result and ml_result["explanation"] is not None:
            response["explanation"] = ml_result["explanation"]

        log_result({
            **response,
            "filename": data.get("filename", ""),
            "reasons": "",
        }, LOG_PATH)
        return jsonify(response)

    except Exception as exc:
        return jsonify({"error": str(exc), "trace": traceback.format_exc()}), 500


@app.route("/explain", methods=["POST"])
def explain_cv():
    """
    V2 endpoint: Get a SHAP explanation for a single candidate.
    Returns the same as /predict but with emphasis on explainability.
    """
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "Missing required field: 'text'"}), 400

    try:
        features = extract_features(data["text"], filename=data.get("filename", ""))
        job_config = data.get("job_config")  # None if not provided -> uses DEFAULT_JOB_CONFIG

        # Hard filter check first
        filter_result = hard_filter.apply(features, job_config)

        if not filter_result["passed"]:
            return jsonify({
                "name": features.get("name"),
                "target_role": features.get("target_role"),
                "label": "Reject",
                "stage": "hard_filter",
                "reasons": filter_result["reasons"],
                "explanation": None,
                "message": "Candidate rejected by hard filter — no ML explanation available.",
            })

        if not model_is_ready():
            return jsonify({
                "error": "Model not yet trained",
                "message": "Run ml/train.py first.",
            }), 503

        # Get prediction with full SHAP explanation
        ml_result = predict(features, explain=True)

        return jsonify({
            "name": features.get("name"),
            "target_role": features.get("target_role"),
            "label": ml_result["label"],
            "confidence": ml_result["confidence"],
            "probabilities": ml_result["probabilities"],
            "fairness_adjusted": ml_result.get("fairness_adjusted", False),
            "explanation": ml_result.get("explanation"),
        })

    except Exception as exc:
        return jsonify({"error": str(exc), "trace": traceback.format_exc()}), 500


@app.route("/fairness-metrics", methods=["GET"])
def fairness_metrics():
    """
    V2 endpoint: View fairness audit results computed during training.
    Returns EPD, RID, Delta-TPR for both base and fair models.
    """
    metrics = get_fairness_metrics()
    if metrics is None:
        return jsonify({
            "message": "No fairness metrics available. Train the V2 model first.",
            "version": "V2",
        }), 404

    # Convert any non-serializable types
    result = {
        "version": "V2",
        "fairness_constraint": "equalized_odds",
        "base_model": metrics.get("base_model"),
        "fair_model": metrics.get("fair_model"),
        "performance_comparison": metrics.get("performance_comparison"),
    }

    # Include proxy analysis if available
    proxies = metrics.get("proxies")
    if proxies is not None:
        result["proxy_analysis"] = proxies

    return jsonify(result)


@app.route("/process-inbox", methods=["POST"])
def process_inbox():
    """Process all CVs in the inbox directory."""
    data = request.get_json(silent=True) or {}
    job_config = data.get("job_config")  # None if not provided -> uses DEFAULT_JOB_CONFIG

    files = glob.glob(os.path.join(INBOX_DIR, "*.txt"))
    if not files:
        return jsonify({"message": "No .txt files found in inbox", "results": []})

    os.makedirs(PROCESSED_DIR, exist_ok=True)
    results = []

    for filepath in files:
        filename = os.path.basename(filepath)
        file_hash = compute_file_hash(filepath)

        if is_processed(REGISTRY_PATH, file_hash):
            results.append({
                "filename": filename,
                "status": "skipped",
                "reason": "Already processed (found in registry)",
            })
            continue

        try:
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
                    "status": "processed",
                    "fairness_adjusted": False,
                })
            elif model_is_ready():
                ml_result = predict(features, explain=False)  # Skip SHAP for batch
                result.update({
                    "stage": "ml_model",
                    "label": ml_result["label"],
                    "confidence": ml_result["confidence"],
                    "probabilities": ml_result["probabilities"],
                    "model_name": ml_result["model_name"],
                    "fairness_adjusted": ml_result.get("fairness_adjusted", False),
                    "status": "processed",
                })
            else:
                result.update({
                    "stage": "hard_filter",
                    "label": None,
                    "message": "Model not yet trained",
                    "status": "processed",
                    "fairness_adjusted": False,
                })

            dest = os.path.join(PROCESSED_DIR, filename)
            shutil.move(filepath, dest)
            register_file(REGISTRY_PATH, filename, file_hash)

            log_result(result, LOG_PATH)

        except Exception as exc:
            result = {
                "filename": filename,
                "status": "error",
                "error": str(exc),
            }

        results.append(result)

    return jsonify({
        "processed": len([r for r in results if r.get("status") == "processed"]),
        "skipped":   len([r for r in results if r.get("status") == "skipped"]),
        "errors":    len([r for r in results if r.get("status") == "error"]),
        "results": results,
        "version": "V2",
    })


@app.route("/processed-files", methods=["GET"])
def list_processed_files():
    registry = load_registry(REGISTRY_PATH)
    filenames = sorted(registry.values())
    return jsonify({
        "count": len(filenames),
        "files": filenames,
    })


@app.route("/processed-files/<filename>", methods=["DELETE"])
def remove_processed_file(filename: str):
    registry = load_registry(REGISTRY_PATH)
    hash_to_remove = None
    for h, name in registry.items():
        if name == filename:
            hash_to_remove = h
            break

    if hash_to_remove is None:
        return jsonify({"error": f"'{filename}' not found in registry"}), 404

    del registry[hash_to_remove]
    save_registry(REGISTRY_PATH, registry)
    return jsonify({"message": f"'{filename}' removed from registry. It can now be reprocessed."})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
