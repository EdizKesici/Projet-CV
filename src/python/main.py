"""
CV Pre-Screening Application V2 — Unified Entry Point
======================================================
Fairness-aware version with ThresholdOptimizer and SHAP explainability.

Single command-line entry point for the LuxTalent Advisory Group CV
pre-screening system.  Provides access to data preparation, model
training, the Flask API server, and the file-watcher daemon — all
from one script.

Usage
-----
    python main.py prepare          # Prepare training data
    python main.py train            # Train the V2 ML model (fairness-aware)
    python main.py serve            # Start Flask API server
    python main.py watch            # Start the watcher daemon
    python main.py all              # Prepare + Train + Serve + Watch

V2 Changes
----------
    - gender excluded from ML features (kept as metadata for audit)
    - Fairlearn ThresholdOptimizer for fairness adjustment
    - SHAP explainability for individual predictions
    - Fairness audit metrics (EPD, RID, Delta-TPR)
"""

import argparse
import os
import sys
import threading
from pathlib import Path

# ---------------------------------------------------------------------------
# Robust path configuration
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
_PROJECT_ROOT = _HERE.resolve().parent.parent

sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE / "ml"))

# ---------------------------------------------------------------------------
# Default paths
# ---------------------------------------------------------------------------
_DATA_DIR = _PROJECT_ROOT / "data" / "training_data"

DEFAULT_DATA_DIR = str(_DATA_DIR)
DEFAULT_CVS_DIR = str(_DATA_DIR / "CVs")
DEFAULT_LABELS_CSV = str(_DATA_DIR / "student_labels.csv")
DEFAULT_OUTPUT_CSV = str(_DATA_DIR / "cv_features_labeled.csv")
DEFAULT_PLOTS_DIR = str(_HERE / "ml" / "plots")
DEFAULT_INBOX_DIR = "/app/data/input_CVs"
DEFAULT_PROCESSED_DIR = "/app/data/processed_CVs"
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000
DEFAULT_POLL_INTERVAL = 10

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BANNER_WIDTH = 64


def _banner(title: str) -> None:
    print()
    print("=" * _BANNER_WIDTH)
    print(f"  {title}")
    print("=" * _BANNER_WIDTH)
    print()


def _success(message: str) -> None:
    print(f"\n  [OK] {message}\n")


def _error(message: str) -> None:
    print(f"\n  [ERROR] {message}\n", file=sys.stderr)


def _resolve_data_dir(args_data: str | None) -> str:
    return args_data if args_data else DEFAULT_DATA_DIR


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def cmd_prepare(args: argparse.Namespace) -> int:
    """Extract features from CVs and merge with hiring labels."""
    data_dir = _resolve_data_dir(args.data)

    _banner("PREPARE — Building Labeled Training Dataset")

    cvs_dir = os.path.join(data_dir, "CVs")
    labels_csv = os.path.join(data_dir, "student_labels.csv")
    output_csv = os.path.join(data_dir, "cv_features_labeled.csv")

    print(f"  CVs directory  : {cvs_dir}")
    print(f"  Labels file    : {labels_csv}")
    print(f"  Output file    : {output_csv}")
    print()

    try:
        from prepare_training_data import prepare

        prepare(cvs_dir, labels_csv, output_csv)
        _success("Training data prepared successfully.")
        return 0
    except SystemExit as exc:
        _error("Data preparation failed.")
        return exc.code if exc.code else 1
    except Exception as exc:
        _error(f"Unexpected error during preparation: {exc}")
        import traceback
        traceback.print_exc()
        return 1


def cmd_train(args: argparse.Namespace) -> int:
    """Train and evaluate the V2 fairness-aware ML screening model."""
    data_dir = _resolve_data_dir(args.data)

    _banner("TRAIN — Training V2 Fairness-Aware ML Screening Model")

    labeled_csv = os.path.join(data_dir, "cv_features_labeled.csv")
    plots_dir = args.plots_dir if args.plots_dir else DEFAULT_PLOTS_DIR

    print(f"  Labeled data   : {labeled_csv}")
    print(f"  Plots directory: {plots_dir}")
    print(f"  Version        : V2 (gender excluded, ThresholdOptimizer, SHAP)")
    print()

    try:
        from ml.train import train

        train(labeled_csv, plots_dir)
        _success("V2 Model training completed successfully.")
        return 0
    except SystemExit as exc:
        _error("Training failed.")
        return exc.code if exc.code else 1
    except Exception as exc:
        _error(f"Unexpected error during training: {exc}")
        import traceback
        traceback.print_exc()
        return 1


def cmd_serve(args: argparse.Namespace) -> int:
    """Start the Flask REST API server (V2)."""
    if args.inbox_dir:
        os.environ["INBOX_DIR"] = args.inbox_dir
    if args.processed_dir:
        os.environ["PROCESSED_DIR"] = args.processed_dir

    host = args.host if args.host else DEFAULT_HOST
    port = args.port if args.port else DEFAULT_PORT

    _banner("SERVE — Starting Flask API Server (V2)")

    print(f"  Host : {host}")
    print(f"  Port : {port}")
    print()

    try:
        from app import app

        app.run(host=host, port=port, debug=False)
        return 0
    except Exception as exc:
        _error(f"Flask server crashed: {exc}")
        import traceback
        traceback.print_exc()
        return 1


def cmd_watch(args: argparse.Namespace) -> int:
    """Start the inbox watcher daemon (V2)."""
    if args.inbox_dir:
        os.environ["INBOX_DIR"] = args.inbox_dir
    if args.processed_dir:
        os.environ["PROCESSED_DIR"] = args.processed_dir
    if args.poll_interval:
        os.environ["POLL_INTERVAL"] = str(args.poll_interval)

    poll_interval = args.poll_interval if args.poll_interval else DEFAULT_POLL_INTERVAL

    _banner("WATCH — Starting Inbox Watcher Daemon (V2)")

    inbox_dir = os.environ.get("INBOX_DIR", DEFAULT_INBOX_DIR)
    processed_dir = os.environ.get("PROCESSED_DIR", DEFAULT_PROCESSED_DIR)

    print(f"  Inbox dir      : {inbox_dir}")
    print(f"  Processed dir  : {processed_dir}")
    print(f"  Poll interval  : {poll_interval}s")
    print()

    try:
        from watcher import run_watcher

        run_watcher()
        return 0
    except KeyboardInterrupt:
        _success("Watcher stopped by user (Ctrl+C).")
        return 0
    except Exception as exc:
        _error(f"Watcher crashed: {exc}")
        import traceback
        traceback.print_exc()
        return 1


def cmd_all(args: argparse.Namespace) -> int:
    """Run the full V2 pipeline: prepare -> train -> serve + watch."""
    _banner("ALL — Full V2 Pipeline")

    rc = cmd_prepare(args)
    if rc != 0:
        _error("Pipeline aborted at 'prepare' stage.")
        return rc

    rc = cmd_train(args)
    if rc != 0:
        _error("Pipeline aborted at 'train' stage.")
        return rc

    _banner("ALL — Starting Serve + Watch concurrently")

    serve_thread = threading.Thread(
        target=cmd_serve,
        args=(args,),
        name="flask-serve",
        daemon=True,
    )

    watch_thread = threading.Thread(
        target=cmd_watch,
        args=(args,),
        name="inbox-watcher",
        daemon=True,
    )

    print("  Launching Flask API server  (thread) ...")
    serve_thread.start()

    print("  Launching inbox watcher      (thread) ...")
    watch_thread.start()

    print("\n  Both services are running.  Press Ctrl+C to stop all.\n")

    try:
        serve_thread.join()
    except KeyboardInterrupt:
        _success("Shutting down all services (Ctrl+C received).")

    return 0


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="main.py",
        description=(
            "LuxTalent Advisory Group — CV Pre-Screening Application V2\n"
            "Fairness-aware version with ThresholdOptimizer and SHAP explainability."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python main.py prepare\n"
            "  python main.py train --data /custom/data/training_data\n"
            "  python main.py serve --host 127.0.0.1 --port 5000\n"
            "  python main.py watch --poll-interval 5\n"
            "  python main.py all --plots-dir /tmp/plots\n"
        ),
    )

    parser.add_argument("--data", default=None, metavar="DIR",
                        help=f"Base training-data directory (default: {DEFAULT_DATA_DIR})")
    parser.add_argument("--host", default=None, metavar="ADDR",
                        help=f"Flask server bind address (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=None, metavar="NUM",
                        help=f"Flask server port (default: {DEFAULT_PORT})")
    parser.add_argument("--poll-interval", type=int, default=None, metavar="SEC",
                        help=f"Watcher polling interval in seconds (default: {DEFAULT_POLL_INTERVAL})")
    parser.add_argument("--inbox-dir", default=None, metavar="DIR",
                        help=f"Directory for incoming CV files (default: {DEFAULT_INBOX_DIR})")
    parser.add_argument("--processed-dir", default=None, metavar="DIR",
                        help=f"Directory for processed CV files (default: {DEFAULT_PROCESSED_DIR})")
    parser.add_argument("--plots-dir", default=None, metavar="DIR",
                        help=f"Output directory for diagnostic plots (default: {DEFAULT_PLOTS_DIR})")

    subparsers = parser.add_subparsers(dest="command", title="available commands", metavar="COMMAND")

    subparsers.add_parser("prepare",
                          help="Extract features from CVs and build the labeled training dataset")
    subparsers.add_parser("train",
                          help="Train the V2 fairness-aware ML screening model")
    subparsers.add_parser("serve",
                          help="Start the Flask REST API server (V2)")
    subparsers.add_parser("watch",
                          help="Start the inbox watcher daemon (V2)")
    subparsers.add_parser("all",
                          help="Run the full V2 pipeline: prepare -> train -> serve + watch")

    return parser


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    dispatch = {
        "prepare": cmd_prepare,
        "train": cmd_train,
        "serve": cmd_serve,
        "watch": cmd_watch,
        "all": cmd_all,
    }

    handler = dispatch.get(args.command)
    if handler is None:
        parser.print_help()
        sys.exit(1)

    exit_code = handler(args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
