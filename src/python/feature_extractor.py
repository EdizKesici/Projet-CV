"""
CV Feature Extractor — V2 (Fairness-Aware)
===========================================
Parses raw CV text files and extracts structured numeric features
ready for machine learning training and inference.

V2 Change: gender is extracted as METADATA ONLY (not used by the ML model).
It is kept for audit, fairness metrics, and the ThresholdOptimizer
post-processing step.

Feature schema
--------------
Metadata (not used by the ML model):
  - filename        : source file name
  - name            : candidate full name
  - target_role     : job role the candidate is applying for
  - languages_list  : list of language names (used by the hard filter only)
  - skills_list     : list of skill names (used by the hard filter only)
  - gender          : candidate gender (0=Female, 1=Male, -1=unknown)
                       ** V2: used ONLY for fairness audit and ThresholdOptimizer **

ML features (numeric — V2: gender excluded):
  - age                 : candidate age in years (-1 if unparseable)
  - years_experience    : total work experience in decimal years
  - education_level     : highest degree, mapped to 1-5 scale
  - nb_certifications   : number of professional certifications
  - nb_extra_languages  : number of languages beyond the required ones
  - nb_extra_skills     : total number of skills listed
  - has_management_experience : 1 if team management detected, 0 otherwise
  - has_international_experience : 1 if candidate speaks a language not native to their work country

Usage
-----
Single CV (API / inference):
    features = extract_features(cv_text, filename="cv_0001.txt")

Batch (training data preparation):
    from feature_extractor import process_folder
    process_folder("data/training_data/CVs", "data/training_data/cv_features.csv")
"""

import csv
import os
import re
from datetime import datetime
from pathlib import Path


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

EDUCATION_LEVELS: dict[str, int] = {
    "phd": 5, "doctorate": 5,
    "master": 4, "msc": 4, "m.sc": 4, "mba": 4,
    "bachelor": 3, "bsc": 3, "b.sc": 3, "licence": 3,
    "associate": 2, "bts": 2, "hnd": 2, "dut": 2,
    "high school": 1, "baccalaureate": 1, "bac": 1,
}


# Columns written to the output CSV (order matters for the ML pipeline)
CSV_COLUMNS = [
    "filename", "name", "target_role",
    "age", "years_experience",
    "education_level", "nb_certifications",
    "nb_extra_languages", "nb_extra_skills",
    "has_management_experience",
    "has_international_experience",
    "gender",  # V2: kept for audit/ThresholdOptimizer, NOT in ML features
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Return lowercase stripped version of text."""
    return text.lower().strip()


def _extract_section(text: str, section_name: str) -> str:
    """
    Extract the content of a named section from the CV text.

    Sections are expected to follow the pattern:
        SectionName:\\n
        content lines...
        \\n
        NextSectionName:\\n   <- stop here

    Returns an empty string if the section is not found.
    """
    pattern = rf"(?i){re.escape(section_name)}:\s*\n(.*?)(?=\n[A-Z][a-zA-Z ]+:\s*\n|\Z)"
    match = re.search(pattern, text, re.DOTALL)
    return match.group(1).strip() if match else ""


def _parse_date(date_str: str) -> datetime | None:
    """
    Parse a date string from an experience entry.
    Accepts: YYYY, YYYY-MM, YYYY-MM-DD, 'present', 'current'.
    Returns None if parsing fails.
    """
    normalized = date_str.strip().lower()
    if normalized in ("present", "current"):
        return datetime.now()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Individual feature extractors
# ---------------------------------------------------------------------------

def extract_name(text: str) -> str:
    """Extract candidate name from 'Name: ...' line."""
    match = re.search(r"Name:\s*(.+)", text)
    return match.group(1).strip() if match else "Unknown"


def extract_target_role(text: str) -> str:
    """Extract target job role from 'Target Role: ...' line."""
    match = re.search(r"Target Role:\s*(.+)", text)
    return match.group(1).strip() if match else "Unknown"


def extract_age(text: str) -> int:
    """
    Compute age in years from 'Date of Birth: YYYY-MM-DD'.
    Returns -1 if the field is missing or unparseable.
    """
    match = re.search(r"Date of Birth:\s*(\d{4}-\d{2}-\d{2})", text)
    if not match:
        return -1
    try:
        dob = datetime.strptime(match.group(1), "%Y-%m-%d")
        today = datetime.now()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except ValueError:
        return -1


def extract_years_experience(text: str) -> float:
    """
    Compute total work experience in decimal years by summing all
    date ranges found in the Experience section.
    """
    pattern = r"(\d{4}(?:-\d{2})?)\s+to\s+(\d{4}(?:-\d{2})?|[Pp]resent|[Cc]urrent)"
    matches = re.findall(pattern, text)
    total_months = 0

    for start_str, end_str in matches:
        start = _parse_date(start_str)
        end = _parse_date(end_str)
        if start and end:
            start_month = getattr(start, "month", 1)
            end_month = getattr(end, "month", 1)
            delta = (end.year - start.year) * 12 + (end_month - start_month)
            if delta > 0:
                total_months += delta

    return float(round(total_months / 12, 2))


def extract_education_level(text: str) -> int:
    """
    Detect the highest education level in the Education section.
    Returns a value from 0 (not found) to 5 (PhD).
    """
    edu_section = _extract_section(text, "Education")
    normalized = _normalize(edu_section or text)
    level = 0
    for keyword, value in EDUCATION_LEVELS.items():
        if keyword in normalized:
            level = max(level, value)
    return level


def extract_nb_certifications(text: str) -> int:
    """Count non-empty lines in the Certifications section."""
    cert_section = _extract_section(text, "Certifications")
    if not cert_section:
        return 0
    return len([line for line in cert_section.splitlines() if line.strip()])


def extract_nb_positions(text: str) -> int:
    """
    Count the number of distinct job positions in the Experience section.
    """
    exp_section = _extract_section(text, "Experience")
    if not exp_section:
        return 0

    date_pattern = re.compile(
        r"\d{4}(?:-\d{2})?\s+to\s+(?:\d{4}(?:-\d{2})?|[Pp]resent|[Cc]urrent)"
    )
    return sum(1 for line in exp_section.splitlines() if date_pattern.search(line))


def extract_language_features(text: str) -> dict:
    """
    Parse the Languages section.
    Returns:
        - nb_languages   : total count
        - languages_list : lowercase language names (for hard filter)
    """
    lang_section = _extract_section(text, "Languages")
    if not lang_section:
        return {"nb_languages": 0, "languages_list": []}

    lines = [line.strip() for line in lang_section.splitlines() if line.strip()]
    languages_list: list[str] = []

    for line in lines:
        parts = re.split(r"\s*[—\-–]\s*", line, maxsplit=1)
        if parts:
            lang_name = parts[0].strip().lower()
            if lang_name:
                languages_list.append(lang_name)

    return {
        "nb_languages": len(lines),
        "languages_list": languages_list,
    }


def extract_nb_extra_languages(text: str, required_languages: list[str] | None = None) -> int:
    """
    Count languages the candidate speaks beyond the required ones.
    Defaults to ["english"] as the required baseline.
    """
    if required_languages is None:
        required_languages = ["english"]

    required_set = {lang.lower().strip() for lang in required_languages}

    lang_section = _extract_section(text, "Languages")
    if not lang_section:
        return 0

    detected: set[str] = set()
    for line in lang_section.splitlines():
        line = line.strip().lower()
        if not line:
            continue
        parts = re.split(r"\s*[—\-–]\s*", line, maxsplit=1)
        lang_name = parts[0].strip()
        if lang_name:
            detected.add(lang_name)

    extra = detected - required_set
    return len(extra)


def extract_nb_skills(text: str) -> int:
    """
    Count the total number of individual skills across all categories.
    """
    skills_section = _extract_section(text, "Skills")
    if not skills_section:
        return 0

    total = 0
    for line in skills_section.splitlines():
        line = line.strip()
        if not line:
            continue
        _, _, skills_str = line.partition(":") if ":" in line else ("", "", line)
        skills = [s.strip() for s in skills_str.split(",") if s.strip()]
        total += len(skills)

    return total


def extract_skills_list(text: str) -> list[str]:
    """
    Return a flat, lowercase list of all individual skills found.
    Used by the hard filter to check required skills.
    """
    skills_section = _extract_section(text, "Skills")
    if not skills_section:
        return []

    skills: list[str] = []
    for line in skills_section.splitlines():
        line = line.strip()
        if not line:
            continue
        _, _, skills_str = line.partition(":") if ":" in line else ("", "", line)
        skills.extend(s.strip().lower() for s in skills_str.split(",") if s.strip())
    return skills


def extract_nb_extra_skills(text: str) -> int:
    """
    Count the total number of skills listed in the Skills section.
    """
    return len(extract_skills_list(text))


def extract_gender(text: str) -> int:
    """
    Extract the candidate's gender from the 'Gender: ...' field.

    V2 NOTE: This feature is used ONLY for fairness audit and
    ThresholdOptimizer post-processing. It is NOT included in the
    ML model's feature set.

    Returns:
        1  if Male
        0  if Female
        -1 if the field is missing or unrecognised
    """
    match = re.search(r"Gender:\s*(\S+)", text, re.IGNORECASE)
    if not match:
        return -1
    value = match.group(1).strip().lower()
    if value in ("male", "man", "m"):
        return 1
    if value in ("female", "woman", "f"):
        return 0
    return -1


def extract_has_management_experience(text: str) -> int:
    """
    Returns 1 if the candidate has managed or led a team, 0 otherwise.
    """
    exp_section = _normalize(_extract_section(text, "Experience"))
    keywords = [
        "manag", "led ", "lead", "supervis", "oversaw", "oversee",
        "team of", "mentor", "coordinat", "delegat", "directed",
        "responsible for a team", "in charge of",
    ]
    return int(any(kw in exp_section for kw in keywords))


COUNTRY_LANGUAGES: dict[str, list[str]] = {
    # ── Europe de l'Ouest ──
    "france": ["french", "english"],
    "germany": ["german", "english"],
    "italy": ["italian", "english"],
    "spain": ["spanish", "english"],
    "portugal": ["portuguese", "english"],
    "netherlands": ["dutch", "english"],
    "belgium": ["french", "dutch", "german", "english"],
    "luxembourg": ["french", "german", "luxembourgish", "english"],
    "switzerland": ["german", "french", "italian", "english"],
    "austria": ["german", "english"],
    "ireland": ["english", "irish"],
    "uk": ["english"],
    "united kingdom": ["english"],
    # ── Europe du Nord ──
    "sweden": ["swedish", "english"],
    "norway": ["norwegian", "english"],
    "denmark": ["danish", "english"],
    "finland": ["finnish", "swedish", "english"],
    "iceland": ["icelandic", "english"],
    # ── Europe de l'Est ──
    "poland": ["polish", "english"],
    "czech republic": ["czech", "english"],
    "czechia": ["czech", "english"],
    "romania": ["romanian", "english"],
    "hungary": ["hungarian", "english"],
    "ukraine": ["ukrainian", "english"],
    "russia": ["russian", "english"],
    # ── Europe du Sud ──
    "greece": ["greek", "english"],
    "croatia": ["croatian", "english"],
    "serbia": ["serbian", "english"],
    # ── Amérique du Nord ──
    "usa": ["english"],
    "united states": ["english"],
    "canada": ["english", "french"],
    "mexico": ["spanish", "english"],
    # ── Amérique du Sud ──
    "brazil": ["portuguese", "english"],
    "colombia": ["spanish", "english"],
    "argentina": ["spanish", "english"],
    "chile": ["spanish", "english"],
    "peru": ["spanish", "english"],
    # ── Asie de l'Est ──
    "china": ["chinese", "mandarin", "english"],
    "japan": ["japanese", "english"],
    "south korea": ["korean", "english"],
    "taiwan": ["mandarin", "chinese", "english"],
    # ── Asie du Sud-Est ──
    "singapore": ["english", "mandarin", "chinese"],
    "malaysia": ["malay", "english"],
    "thailand": ["thai", "english"],
    "vietnam": ["vietnamese", "english"],
    "indonesia": ["indonesian", "english"],
    "philippines": ["filipino", "english"],
    # ── Asie du Sud ──
    "india": ["english", "hindi"],
    "pakistan": ["urdu", "english"],
    # ── Moyen-Orient ──
    "uae": ["arabic", "english"],
    "united arab emirates": ["arabic", "english"],
    "saudi arabia": ["arabic", "english"],
    "israel": ["hebrew", "english"],
    "turkey": ["turkish", "english"],
    # ── Afrique ──
    "nigeria": ["english"],
    "south africa": ["english", "afrikaans"],
    "morocco": ["arabic", "french", "english"],
    "egypt": ["arabic", "english"],
    "kenya": ["english", "swahili"],
    # ── Océanie ──
    "australia": ["english"],
    "new zealand": ["english"],
}

def _detect_work_country(text: str) -> str | None:
    """
    Detect the country of the candidate's work experience.
    Returns the country name (lowercase) or None.
    """
    exp_section = _extract_section(text, "Experience")
    if not exp_section:
        return None

    entries = re.findall(r"—\s*([^—]+?)\s*—\s*\d{4}", exp_section)
    if not entries:
        return None

    loc = entries[0].strip()

    if re.search(r",\s*[A-Z]{2}$", loc):
        return "usa"

    if "," in loc:
        return loc.split(",")[-1].strip().lower()

    return None


def extract_has_international_experience(text: str) -> int:
    """
    Returns 1 if the candidate speaks a language that is not native
    to their work country, suggesting international exposure.
    """
    work_country = _detect_work_country(text)

    languages: set[str] = set()
    lang_section = _extract_section(text, "Languages")
    if lang_section:
        for line in lang_section.splitlines():
            parts = re.split(r"\s*[—\-–]\s*", line.strip(), maxsplit=1)
            if parts and parts[0].strip():
                languages.add(parts[0].strip().lower())

    if not work_country or not languages:
        return 0

    country_langs = set(COUNTRY_LANGUAGES.get(work_country, ["english"]))
    extra_foreign = languages - country_langs
    return int(len(extra_foreign) > 0)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_features(cv_text: str, filename: str = "") -> dict:
    """
    Extract all features from raw CV text.

    V2 NOTE: gender is classified as METADATA and is NOT used by the
    ML model. It is kept for fairness audit and ThresholdOptimizer.

    Returns
    -------
    dict
        Metadata fields (excluded from ML):
            filename, name, target_role, languages_list, skills_list, gender
        ML-ready numeric features (V2 — no gender):
            age, years_experience, education_level,
            nb_certifications, nb_extra_languages, nb_extra_skills,
            has_management_experience, has_international_experience
    """
    lang_features = extract_language_features(cv_text)

    return {
        # --- Metadata (not used by ML model) ---
        "filename": filename,
        "name": extract_name(cv_text),
        "target_role": extract_target_role(cv_text),
        "languages_list": lang_features["languages_list"],  # hard_filter only
        "skills_list": extract_skills_list(cv_text),  # hard_filter only
        "nb_positions": extract_nb_positions(cv_text),  # hard_filter only

        # --- ML features (V2: gender excluded) ---
        "age": extract_age(cv_text),
        "years_experience": extract_years_experience(cv_text),
        "education_level": extract_education_level(cv_text),
        "nb_certifications": extract_nb_certifications(cv_text),
        "nb_extra_languages": extract_nb_extra_languages(cv_text),
        "nb_extra_skills": extract_nb_extra_skills(cv_text),
        "has_management_experience": extract_has_management_experience(cv_text),
        "has_international_experience": extract_has_international_experience(cv_text),

        # --- Metadata for fairness audit (V2: NOT in ML features) ---
        "gender": extract_gender(cv_text),
    }


def process_folder(folder_path: str, output_csv: str) -> list[dict]:
    """
    Extract features from all .txt CV files in a folder and write them
    to a CSV file. Already-processed files are skipped (incremental mode).
    """
    folder = Path(folder_path)
    cv_files = sorted(folder.glob("*.txt"))

    if not cv_files:
        print(f"[WARNING] No .txt files found in {folder_path}")
        return []

    existing_files: set[str] = set()
    if os.path.exists(output_csv):
        with open(output_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            existing_files = {row["filename"] for row in reader}

    rows: list[dict] = []
    for cv_file in cv_files:
        if cv_file.name in existing_files:
            print(f"[SKIP]    {cv_file.name} — already in CSV")
            continue
        try:
            text = cv_file.read_text(encoding="utf-8")
            features = extract_features(text, filename=cv_file.name)
            rows.append(features)
            print(f"[OK]      {cv_file.name} -> {features['name']}")
        except Exception as exc:
            print(f"[ERROR]   {cv_file.name} — {exc}")

    if not rows:
        print("[INFO] No new files to process.")
        return []

    os.makedirs(os.path.dirname(os.path.abspath(output_csv)), exist_ok=True)
    write_header = not os.path.exists(output_csv) or not existing_files
    with open(output_csv, "a" if existing_files else "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerows(rows)

    print(f"\n[DONE] {len(rows)} records written -> {output_csv}")
    return rows


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Extract features from a folder of CV text files.")
    parser.add_argument("--input", required=True, help="Folder containing .txt CV files")
    parser.add_argument("--output", required=True, help="Output CSV file path")
    args = parser.parse_args()

    process_folder(args.input, args.output)
