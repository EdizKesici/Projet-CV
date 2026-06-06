"""
Hard Filter — Eliminatory Rules
================================
Stage 1 of the two-stage screening pipeline.

Applies binary, configurable rules to a candidate's extracted features
BEFORE the ML model runs. Any unmet mandatory criterion immediately
rejects the candidate — the ML model is never called.

Set HARD_FILTER_ENABLED = False to bypass this stage entirely.

Job configuration format
------------------------
The frontend passes a `job_config` dict in the request body:

    {
        "required_languages" : ["english", "french"],
        "required_skills"    : ["python", "sql"],
        "min_education_level": 3,
        "min_years_experience": 2.0,
        "min_nb_positions"   : 1
    }

All keys are optional. Omitted criteria are not evaluated.
If job_config is None, DEFAULT_JOB_CONFIG is used as a fallback.
An empty dict {} means "no criteria" — all candidates pass.

Education level scale
---------------------
    1 = High school / Baccalaureate
    2 = Associate / BTS / HND
    3 = Bachelor's degree
    4 = Master's degree
    5 = PhD / Doctorate

Return value
------------
    {
        "passed" : True | False,
        "reasons": []        # empty if passed, list of strings if rejected
    }
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Global switch — set to False to bypass the hard filter entirely
# ---------------------------------------------------------------------------
HARD_FILTER_ENABLED: bool = True

# ---------------------------------------------------------------------------
# Default job configuration — used when no job_config is passed in the request
# (development mode / no frontend). Remove once the frontend is integrated.
# ---------------------------------------------------------------------------
DEFAULT_JOB_CONFIG: dict = {
    "required_languages":  [],
    "required_skills":     [],
    "min_education_level": 2,
    "min_years_experience": 0.0,
    "min_nb_positions": 0,
}

# ---------------------------------------------------------------------------
# Education level labels (used in rejection messages)
# ---------------------------------------------------------------------------
EDUCATION_LEVEL_LABELS: dict[int, str] = {
    1: "High school / Baccalaureate",
    2: "Associate degree / BTS / HND",
    3: "Bachelor's degree",
    4: "Master's degree",
    5: "PhD / Doctorate",
}

# ---------------------------------------------------------------------------
# Criterion checkers
# Each function receives (features, job_config) and returns a list of
# rejection reasons (empty list = criterion passed).
# Adding a new criterion = adding a new function + registering it below.
# ---------------------------------------------------------------------------

def _check_required_languages(features: dict, job_config: dict) -> list[str]:
    required: list[str] = [
        lang.lower().strip()
        for lang in job_config.get("required_languages", [])
    ]
    if not required:
        return []

    candidate: list[str] = [
        lang.lower() for lang in features.get("languages_list", [])
    ]
    return [
        f"Missing required language: '{lang.capitalize()}'"
        for lang in required
        if lang not in candidate
    ]


def _check_required_skills(features: dict, job_config: dict) -> list[str]:
    required: list[str] = [
        skill.lower().strip()
        for skill in job_config.get("required_skills", [])
    ]
    if not required:
        return []

    candidate: list[str] = [
        skill.lower() for skill in features.get("skills_list", [])
    ]
    return [
        f"Missing required skill: '{skill}'"
        for skill in required
        if skill not in candidate
    ]


def _check_min_education(features: dict, job_config: dict) -> list[str]:
    min_edu: int | None = job_config.get("min_education_level")
    if min_edu is None:
        return []

    candidate_edu: int = features.get("education_level", 0)
    if candidate_edu >= min_edu:
        return []

    return [
        f"Education level too low: has '{EDUCATION_LEVEL_LABELS.get(candidate_edu, f'level {candidate_edu}')}', "
        f"requires '{EDUCATION_LEVEL_LABELS.get(min_edu, f'level {min_edu}')}'"
    ]


def _check_min_experience(features: dict, job_config: dict) -> list[str]:
    min_exp: float | None = job_config.get("min_years_experience")
    if min_exp is None:
        return []

    candidate_exp: float = features.get("years_experience", 0.0)
    if candidate_exp >= min_exp:
        return []

    return [
        f"Insufficient experience: has {candidate_exp:.1f} year(s), "
        f"requires {min_exp:.1f} year(s)"
    ]


def _check_min_positions(features: dict, job_config: dict) -> list[str]:
    min_pos: int | None = job_config.get("min_nb_positions")
    if min_pos is None:
        return []

    candidate_pos: int = features.get("nb_positions", 0)
    if candidate_pos >= min_pos:
        return []

    return [
        f"Too few positions: has {candidate_pos}, "
        f"requires at least {min_pos}"
    ]


# ---------------------------------------------------------------------------
# Criterion registry — add new checker functions here to extend the filter
# ---------------------------------------------------------------------------
_CRITERIA = [
    _check_required_languages,
    _check_required_skills,
    _check_min_education,
    _check_min_experience,
    _check_min_positions,
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply(features: dict, job_config: dict | None) -> dict:
    """
    Evaluate all mandatory criteria against a candidate's features.

    Parameters
    ----------
    features : dict
        Output of feature_extractor.extract_features().
    job_config : dict or None
        Employer-defined criteria from the API request body.
        Falls back to DEFAULT_JOB_CONFIG if not provided.

    Returns
    -------
    dict
        { "passed": bool, "reasons": list[str] }
        If HARD_FILTER_ENABLED is False, always returns passed=True.
    """
    if not HARD_FILTER_ENABLED:
        return {"passed": True, "reasons": []}

    # Use DEFAULT_JOB_CONFIG as fallback ONLY when job_config is None (not provided).
    # An empty dict {} means "no criteria" (all candidates pass), which is different
    # from None which means "use the default config".
    effective_config = job_config if job_config is not None else DEFAULT_JOB_CONFIG

    reasons: list[str] = []
    for check in _CRITERIA:
        reasons.extend(check(features, effective_config))

    return {
        "passed": len(reasons) == 0,
        "reasons": reasons,
    }