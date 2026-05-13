"""
Processed File Registry
=======================
Shared utility for deduplicating CV files across watcher.py and app.py.

Uses SHA-256 content hashing so that duplicate files with different names
are still detected. The registry file is stored as JSON with the format:

    {
        "processed_files": [
            {"filename": "cv_0001.txt", "hash": "a1b2c3..."},
            ...
        ]
    }

Backward compatibility
----------------------
If an old registry format is found (list of plain filename strings), it is
automatically converted to the new hash-based format on first load.

Public API
----------
    compute_file_hash(filepath)  → str
    load_registry(registry_path) → dict  {hash: filename}
    save_registry(registry_path, registry)
    is_processed(registry_path, file_hash) → bool
    register_file(registry_path, filename, file_hash)
"""

import hashlib
import json
import os


# ---------------------------------------------------------------------------
# Hash computation
# ---------------------------------------------------------------------------

def compute_file_hash(filepath: str) -> str:
    """
    Compute the SHA-256 hex digest of a file's contents.

    Parameters
    ----------
    filepath : str
        Path to the file to hash.

    Returns
    -------
    str
        64-character hexadecimal SHA-256 digest.
    """
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


# ---------------------------------------------------------------------------
# Registry I/O
# ---------------------------------------------------------------------------

def load_registry(registry_path: str) -> dict:
    """
    Load the processed-file registry from disk.

    Returns a dict keyed by SHA-256 hash with the filename as value:
        {hash: filename, ...}

    Handles backward compatibility: if the stored format is a plain list of
    filename strings, it is returned as an empty dict (hashes unknown).

    Parameters
    ----------
    registry_path : str
        Path to the JSON registry file.

    Returns
    -------
    dict
        Mapping of {hash_string: filename}.
    """
    if not os.path.exists(registry_path):
        return {}

    try:
        with open(registry_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        entries = data.get("processed_files", [])

        # --- Backward compatibility ---
        # Old format: list of plain strings, e.g. ["cv1.txt", "cv2.txt"]
        if entries and isinstance(entries[0], str):
            # Convert old format to new format (hashes unknown, so drop them)
            new_entries = [{"filename": name, "hash": ""} for name in entries]
            data["processed_files"] = new_entries
            # Auto-save the converted format
            os.makedirs(os.path.dirname(registry_path) or ".", exist_ok=True)
            with open(registry_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return {e["hash"]: e["filename"] for e in new_entries}

        # New format: list of dicts with "filename" and "hash"
        return {e["hash"]: e["filename"] for e in entries if e.get("hash")}

    except (json.JSONDecodeError, KeyError):
        return {}


def save_registry(registry_path: str, registry: dict) -> None:
    """
    Save the processed-file registry to disk.

    Parameters
    ----------
    registry_path : str
        Path to the JSON registry file.
    registry : dict
        Mapping of {hash_string: filename}.
    """
    os.makedirs(os.path.dirname(registry_path) or ".", exist_ok=True)
    entries = [{"filename": name, "hash": h} for h, name in registry.items()]
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump({"processed_files": sorted(entries, key=lambda e: e["filename"])},
                  f, indent=2)


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

def is_processed(registry_path: str, file_hash: str) -> bool:
    """
    Check whether a file with the given hash has already been processed.

    Parameters
    ----------
    registry_path : str
        Path to the JSON registry file.
    file_hash : str
        SHA-256 hex digest of the file.

    Returns
    -------
    bool
    """
    registry = load_registry(registry_path)
    return file_hash in registry


def register_file(registry_path: str, filename: str, file_hash: str) -> None:
    """
    Add a file to the processed registry.

    Parameters
    ----------
    registry_path : str
        Path to the JSON registry file.
    filename : str
        Original filename (stored for reference).
    file_hash : str
        SHA-256 hex digest of the file content.
    """
    registry = load_registry(registry_path)
    registry[file_hash] = filename
    save_registry(registry_path, registry)
