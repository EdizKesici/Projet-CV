"""
Comprehensive unit tests for the CV pre-screening project V2.

V2 Changes:
  - gender is excluded from ML features
  - Fairlearn ThresholdOptimizer integration
  - SHAP explainability
  - Fairness audit metrics (EPD, RID, Delta-TPR)

Usage:
    pytest src/python/tests/test_all.py -v
"""

import csv
import json
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path configuration
# ---------------------------------------------------------------------------
_PROJECT_SRC = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_SRC))
sys.path.insert(0, str(_PROJECT_SRC / "ml"))

os.environ.setdefault("MPLBACKEND", "Agg")

import pytest
from unittest.mock import patch, MagicMock

# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------
from feature_extractor import (
    extract_name,
    extract_target_role,
    extract_age,
    extract_years_experience,
    extract_education_level,
    extract_nb_certifications,
    extract_language_features,
    extract_nb_extra_languages,
    extract_nb_skills,
    extract_skills_list,
    extract_nb_extra_skills,
    extract_has_management_experience,
    extract_gender,
    extract_features,
    EDUCATION_LEVELS,
)

import hard_filter
from hard_filter import apply as hard_filter_apply

from logger import log_result, LOG_COLUMNS

from predict import predict as ml_predict, model_is_ready


# V2: Import audit module
from ml.audit import compute_fairness_metrics, detect_proxies


# ===========================================================================
# Fixtures
# ===========================================================================

SAMPLE_CV_TEXT = """\
Name: Jane Doe
Gender: Female
Date of Birth: 1992-06-15
Target Role: Senior Software Engineer

Education:
Master of Science — Computer Science — MIT — 2016

Experience:
Software Engineer — TechCorp — Boston — 2016-09 to 2019-12

Senior Software Engineer — DataFlow Inc — Boston — 2020-01 to Present

Skills:
Technical: Python, Java, Kubernetes, Docker, AWS, Terraform
Methods: Agile, CI/CD, TDD

Languages:
English — C2
French — B1
German — A2

Certifications:
AWS Solutions Architect — 2020
Kubernetes Administrator — 2021
"""


@pytest.fixture
def sample_cv():
    """Return the standard SAMPLE_CV_TEXT used across multiple tests."""
    return SAMPLE_CV_TEXT


@pytest.fixture
def sample_features():
    """Return a feature dict compatible with the V2 predict module's FEATURE_COLUMNS."""
    return {
        "filename": "test_cv.txt",
        "name": "Test Candidate",
        "target_role": "Software Engineer",
        "languages_list": ["english"],
        "skills_list": ["python", "sql"],
        "age": 30,
        "years_experience": 5.0,
        "education_level": 4,
        "nb_certifications": 2,
        "nb_extra_languages": 1,
        "nb_extra_skills": 3,
        "has_management_experience": 0,
        "has_international_experience": 1,
        "gender": 1,  # V2: metadata, not ML feature
    }


@pytest.fixture
def hard_filter_on():
    """Temporarily enable the hard filter and restore after the test."""
    original = hard_filter.HARD_FILTER_ENABLED
    hard_filter.HARD_FILTER_ENABLED = True
    yield
    hard_filter.HARD_FILTER_ENABLED = original


# ===========================================================================
# Tests: feature_extractor
# ===========================================================================


class TestExtractName:
    """Tests for extract_name function."""

    def test_extract_name_standard(self, sample_cv):
        assert extract_name(sample_cv) == "Jane Doe"

    def test_extract_name_variations(self):
        assert extract_name("Name: John Smith\nMore text") == "John Smith"
        assert extract_name("Name:  Maria Garcia-Lopez ") == "Maria Garcia-Lopez"

    def test_extract_name_missing(self):
        assert extract_name("Some text without a name line") == "Unknown"


class TestExtractTargetRole:
    def test_extract_target_role(self, sample_cv):
        assert extract_target_role(sample_cv) == "Senior Software Engineer"

    def test_extract_target_role_missing(self):
        assert extract_target_role("Name: John\nNo role here") == "Unknown"


class TestExtractAge:
    def test_extract_age(self, sample_cv):
        age = extract_age(sample_cv)
        assert isinstance(age, int)
        assert age > 0
        assert 30 <= age <= 35

    def test_extract_age_missing(self):
        assert extract_age("Name: John\nNo DOB here") == -1

    def test_extract_age_invalid_format(self):
        assert extract_age("Date of Birth: not-a-date") == -1


class TestExtractYearsExperience:
    def test_extract_years_experience(self, sample_cv):
        exp = extract_years_experience(sample_cv)
        assert isinstance(exp, float)
        assert exp > 7.0

    def test_extract_years_experience_single_entry(self):
        text = "Experience:\nDeveloper — Co — 2018-01 to 2020-06\n"
        exp = extract_years_experience(text)
        assert exp == 2.42

    def test_extract_years_experience_no_experience(self):
        assert extract_years_experience("Name: John\nNo dates here") == 0.0


class TestExtractEducationLevel:
    @pytest.mark.parametrize(
        "text_snippet, expected",
        [
            ("Education:\nPhD in Computer Science — MIT — 2020", 5),
            ("Education:\nMaster of Science — Stanford — 2016", 4),
            ("Education:\nBachelor of Arts — Oxford — 2014", 3),
            ("Education:\nHigh School Diploma — Lincoln High — 2010", 1),
            ("Name: No Education Section Listed", 0),
        ],
    )
    def test_extract_education_level(self, text_snippet, expected):
        assert extract_education_level(text_snippet) == expected


class TestExtractNbCertifications:
    def test_extract_nb_certifications(self, sample_cv):
        assert extract_nb_certifications(sample_cv) == 2

    def test_extract_nb_certifications_none(self):
        assert extract_nb_certifications("Name: John") == 0


class TestExtractGender:
    """V2: Test gender extraction (metadata only, not ML feature)."""

    def test_extract_gender_female(self, sample_cv):
        assert extract_gender(sample_cv) == 0

    def test_extract_gender_male(self):
        text = "Name: John\nGender: Male"
        assert extract_gender(text) == 1

    def test_extract_gender_missing(self):
        assert extract_gender("Name: John") == -1


class TestExtractFeaturesFull:
    """Integration test: extract all features (V2)."""

    def test_extract_features_full(self, sample_cv):
        features = extract_features(sample_cv, filename="cv_sample.txt")

        # Metadata fields
        assert features["filename"] == "cv_sample.txt"
        assert features["name"] == "Jane Doe"
        assert features["target_role"] == "Senior Software Engineer"
        assert isinstance(features["languages_list"], list)
        assert isinstance(features["skills_list"], list)

        # ML features — types and reasonable ranges
        assert isinstance(features["age"], int)
        assert features["age"] > 0
        assert isinstance(features["years_experience"], float)
        assert features["years_experience"] > 0
        assert features["education_level"] == 4  # Master
        assert features["nb_certifications"] == 2
        assert features["nb_extra_languages"] == 2
        assert features["nb_extra_skills"] == 9
        assert features["has_management_experience"] in (0, 1)
        assert features["has_international_experience"] in (0, 1)

        # V2: gender is present as metadata
        assert features["gender"] == 0  # Female

    def test_extract_features_empty_text(self):
        features = extract_features("", filename="empty.txt")
        assert features["filename"] == "empty.txt"
        assert features["name"] == "Unknown"
        assert features["age"] == -1
        assert features["years_experience"] == 0.0


# ===========================================================================
# Tests: hard_filter
# ===========================================================================


class TestHardFilter:
    def test_apply_disabled(self):
        original = hard_filter.HARD_FILTER_ENABLED
        try:
            hard_filter.HARD_FILTER_ENABLED = False
            result = hard_filter_apply({"education_level": 0}, {"min_education_level": 5})
            assert result["passed"] is True
        finally:
            hard_filter.HARD_FILTER_ENABLED = original

    def test_apply_no_config(self):
        # When job_config is None, DEFAULT_JOB_CONFIG is used (min_education_level=2)
        result = hard_filter_apply({"education_level": 3, "years_experience": 1.0}, None)
        assert result["passed"] is True

    def test_apply_no_config_fails_defaults(self):
        # Candidate with education_level below DEFAULT min should fail
        result = hard_filter_apply({"education_level": 0}, None)
        assert result["passed"] is False

    def test_apply_empty_config(self):
        # When job_config is {}, it means "no criteria" -> candidate passes
        result = hard_filter_apply({"education_level": 0}, {})
        assert result["passed"] is True

    def test_apply_missing_language(self, hard_filter_on):
        features = {"languages_list": ["english"], "skills_list": []}
        job_config = {"required_languages": ["english", "french"]}
        result = hard_filter_apply(features, job_config)
        assert result["passed"] is False

    def test_apply_min_education(self, hard_filter_on):
        features = {"education_level": 2, "years_experience": 5.0}
        job_config = {"min_education_level": 3}
        result = hard_filter_apply(features, job_config)
        assert result["passed"] is False

    def test_apply_all_criteria_pass(self, hard_filter_on):
        features = {
            "education_level": 5,
            "years_experience": 10.0,
            "languages_list": ["english", "french"],
            "skills_list": ["python", "sql"],
            "nb_positions": 3,
        }
        job_config = {
            "required_languages": ["english", "french"],
            "required_skills": ["python"],
            "min_education_level": 3,
            "min_years_experience": 5.0,
            "min_nb_positions": 2,
        }
        result = hard_filter_apply(features, job_config)
        assert result["passed"] is True


# ===========================================================================
# Tests: logger (V2)
# ===========================================================================


class TestLogger:
    def test_log_result_creates_file(self, tmp_path):
        log_path = str(tmp_path / "logs" / "screening.csv")
        log_result({"filename": "cv1.txt", "name": "John", "label": "Reject"}, log_path)
        assert os.path.exists(log_path)

    def test_log_result_appends(self, tmp_path):
        log_path = str(tmp_path / "appends.csv")
        log_result({"filename": "cv1.txt", "label": "Reject"}, log_path)
        log_result({"filename": "cv2.txt", "label": "Invite"}, log_path)
        with open(log_path, "r", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 3  # header + 2 data rows

    def test_log_result_v2_columns(self, tmp_path):
        """V2: Check that fairness_adjusted and top_driver columns exist."""
        log_path = str(tmp_path / "v2_columns.csv")
        log_result({"filename": "test.txt", "fairness_adjusted": True}, log_path)
        with open(log_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
        for col in LOG_COLUMNS:
            assert col in headers, f"Missing column: {col}"

    def test_log_result_with_explanation(self, tmp_path):
        """V2: Test logging with SHAP explanation."""
        log_path = str(tmp_path / "explanation.csv")
        result = {
            "filename": "cv1.txt",
            "label": "Invite",
            "fairness_adjusted": True,
            "explanation": {
                "top_features": [("Years of Experience", 0.25), ("Education Level", 0.12)],
                "decision_drivers": "Test driver",
            },
        }
        log_result(result, log_path)
        with open(log_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            row = next(reader)
        assert "Years of Experience" in row.get("top_driver", "")


# ===========================================================================
# Tests: predict (error-handling)
# ===========================================================================


class TestPredict:
    def test_model_is_ready_no_model(self):
        assert model_is_ready() is False

    def test_predict_no_model_raises(self, sample_features):
        import predict as pred_module
        pred_module._model = None
        pred_module._scaler = None
        pred_module._model_name = None
        pred_module._threshold_optimizer = None
        pred_module._shap_explainer = None

        with pytest.raises(FileNotFoundError, match="model"):
            ml_predict(sample_features)


# ===========================================================================
# Tests: fairness audit (V2)
# ===========================================================================


class TestFairnessAudit:
    """Tests for the ml.audit module (V2)."""

    def test_compute_fairness_metrics_equal(self):
        """When both groups have equal outcomes, EPD should be 0."""
        y_true = np.array([1, 1, 0, 0, 1, 1, 0, 0])
        y_pred = np.array([1, 1, 0, 0, 1, 1, 0, 0])
        sensitive = np.array([1, 1, 1, 1, 0, 0, 0, 0])  # 4 male, 4 female

        metrics = compute_fairness_metrics(y_true, y_pred, sensitive)
        assert metrics["epd"] == 0.0
        assert metrics["rid"] == 1.0
        assert metrics["delta_tpr"] == 0.0

    def test_compute_fairness_metrics_biased(self):
        """When males are invited more, EPD > 0 and RID < 1."""
        y_true = np.array([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
        y_pred = np.array([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1])
        # Males (1): 3/6 invited, Females (0): 1/6 invited
        sensitive = np.array([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0])

        metrics = compute_fairness_metrics(y_true, y_pred, sensitive)
        assert metrics["epd"] > 0
        assert metrics["rid"] < 1.0

    def test_compute_fairness_metrics_alerts(self):
        """Test that alerts trigger correctly."""
        import numpy as np

        # Create a heavily biased scenario
        y_true = np.array([1]*10 + [1]*10)
        y_pred = np.array([1]*9 + [0]*1 + [1]*3 + [0]*7)  # Males 90%, Females 30%
        sensitive = np.array([1]*10 + [0]*10)

        metrics = compute_fairness_metrics(y_true, y_pred, sensitive)
        assert metrics["epd_alert"] is True  # 60 points difference

    def test_detect_proxies(self):
        """Test proxy detection between features and gender."""
        import pandas as pd
        from sklearn.datasets import make_classification

        np.random.seed(42)
        n = 200
        X, _ = make_classification(n_samples=n, n_features=5, random_state=42)
        gender = np.random.randint(0, 2, n)

        # Make one feature correlated with gender
        X[:, 0] = X[:, 0] * 0.3 + gender * 0.7

        df = pd.DataFrame(X, columns=[f"feature_{i}" for i in range(5)])
        sensitive = pd.Series(gender, name="gender")

        proxies = detect_proxies(df, sensitive)
        assert len(proxies) == 5
        assert "pearson_r" in proxies.columns
        assert "is_proxy" in proxies.columns
        # feature_0 should have higher correlation due to our manipulation
        assert abs(proxies.iloc[0]["pearson_r"]) > abs(proxies.iloc[-1]["pearson_r"])


# ===========================================================================
# Tests: registry
# ===========================================================================


class TestRegistry:
    def test_compute_file_hash(self, tmp_path):
        from registry import compute_file_hash

        file_a = tmp_path / "a.txt"
        file_b = tmp_path / "b.txt"
        file_c = tmp_path / "c.txt"

        file_a.write_text("same content here")
        file_b.write_text("same content here")
        file_c.write_text("different content")

        hash_a = compute_file_hash(str(file_a))
        hash_b = compute_file_hash(str(file_b))
        hash_c = compute_file_hash(str(file_c))

        assert hash_a == hash_b
        assert hash_a != hash_c
        assert len(hash_a) == 64

    def test_registry_save_and_load(self, tmp_path):
        from registry import load_registry, save_registry

        registry_path = str(tmp_path / "registry.json")
        reg = load_registry(registry_path)
        assert reg == {}

        save_registry(registry_path, {"abc123": "cv1.txt", "def456": "cv2.txt"})
        reg = load_registry(registry_path)
        assert len(reg) == 2


# ===========================================================================
# Tests: train (error-handling)
# ===========================================================================


class TestTrain:
    def test_train_no_data_file(self, tmp_path):
        from train import train as train_model

        nonexistent = str(tmp_path / "nonexistent_file.csv")
        with pytest.raises(SystemExit) as exc_info:
            train_model(nonexistent, str(tmp_path / "plots"))
        assert exc_info.value.code == 1

    def test_train_missing_label_column(self, tmp_path):
        from train import train as train_model

        csv_path = tmp_path / "no_label.csv"
        csv_path.write_text("age,years_experience,education_level\n30,5.0,4\n25,2.0,3\n")

        with pytest.raises(SystemExit) as exc_info:
            train_model(str(csv_path), str(tmp_path / "plots"))
        assert exc_info.value.code == 1


# ===========================================================================
# V2: Verify feature_columns consistency
# ===========================================================================


class TestV2FeatureConsistency:
    """Ensure gender is excluded from ML features across all modules."""

    def test_feature_columns_no_gender_in_train(self):
        from train import FEATURE_COLUMNS as train_cols
        assert "gender" not in train_cols

    def test_feature_columns_no_gender_in_predict(self):
        from predict import FEATURE_COLUMNS as predict_cols
        assert "gender" not in predict_cols

    def test_feature_columns_train_predict_match(self):
        from train import FEATURE_COLUMNS as train_cols
        from predict import FEATURE_COLUMNS as predict_cols
        assert train_cols == predict_cols

    def test_gender_in_csv_columns(self):
        """gender should still be in CSV output (for audit)."""
        from feature_extractor import CSV_COLUMNS
        assert "gender" in CSV_COLUMNS

    def test_gender_in_extract_features_output(self, sample_cv):
        """gender should be present in extract_features output (metadata)."""
        features = extract_features(sample_cv)
        assert "gender" in features
        assert features["gender"] == 0  # Female


# ===========================================================================
# Import numpy for audit tests
# ===========================================================================
import numpy as np
