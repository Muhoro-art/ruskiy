"""
TEST SUITE: error_classification_unit
Framework: pytest

Tests for the Russkiy error classification pipeline that analyzes learner
responses and categorizes errors to drive the adaptive FSRS engine.
"""

import sys
import os

# Ensure src is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from error_classifier.classifier import classify_error, ErrorType


# ============================================================
# TC-ERR-001: Transfer Error — Nominative Instead of Accusative
# ============================================================


def test_transfer_error_nominative_for_accusative():
    """
    English has no case marking; learner used nominative form 'книга'
    where accusative 'книгу' is needed.
    """
    result = classify_error(
        response="книга",
        correct="книгу",
        skill_id="accusative.fem_singular",
    )

    assert result.error_type == ErrorType.TRANSFER, (
        f"Expected TRANSFER, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-002: Transfer Error — English Word Order in Russian Sentence
# ============================================================


def test_transfer_error_word_order():
    """
    SVO word order imposed from English onto free-order Russian.
    Same words, different order → transfer error.
    """
    result = classify_error(
        response="Я всегда читаю книги",
        correct="Книги я всегда читаю",
        skill_id="grammar.word_order",
    )

    assert result.error_type == ErrorType.TRANSFER, (
        f"Expected TRANSFER, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-003: Overgeneralization — Wrong Plural Ending
# ============================================================


def test_overgeneralization_wrong_plural_ending():
    """
    -ов is a valid genitive plural ending applied incorrectly
    to a nominative plural context.
    """
    result = classify_error(
        response="домов",
        correct="дома",
        skill_id="nominative.plural",
    )

    assert result.error_type == ErrorType.OVERGENERALIZATION, (
        f"Expected OVERGENERALIZE, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-004: Overgeneralization — Regular Conjugation on Irregular Verb
# ============================================================


def test_overgeneralization_regular_on_irregular_verb():
    """
    Applied regular -ею ending instead of the irregular form хочу.
    """
    result = classify_error(
        response="хотею",
        correct="хочу",
        skill_id="present.tense.irregular",
    )

    assert result.error_type == ErrorType.OVERGENERALIZATION, (
        f"Expected OVERGENERALIZE, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-005: Avoidance Detection — Simplified Structure
# ============================================================


def test_avoidance_detection_simplified_structure():
    """
    Response is grammatically correct but far below expected B1 level.
    Prompt asked for complex sentence with subordinate clause.
    """
    result = classify_error(
        response="Я иду дом.",
        correct="Я иду домой, потому что хочу отдохнуть после работы.",
        skill_id="grammar.complex_sentences",
        expected_complexity="B1",
    )

    assert result.error_type == ErrorType.AVOIDANCE, (
        f"Expected AVOIDANCE, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-006: Fossilization Detection — Repeated Identical Error
# ============================================================


def test_fossilization_detection_repeated_error():
    """
    Error history contains 5 instances of 'книга' for accusative.
    This is the 6th occurrence in 30 days → fossilization.
    """
    # Build error history with 5 identical errors
    error_history = [
        {"response": "книга", "correct": "книгу", "timestamp": "2026-02-20"},
        {"response": "книга", "correct": "книгу", "timestamp": "2026-02-25"},
        {"response": "книга", "correct": "книгу", "timestamp": "2026-03-01"},
        {"response": "книга", "correct": "книгу", "timestamp": "2026-03-05"},
        {"response": "книга", "correct": "книгу", "timestamp": "2026-03-10"},
    ]

    result = classify_error(
        response="книга",
        correct="книгу",
        skill_id="accusative.fem_singular",
        error_history=error_history,
    )

    assert result.error_type == ErrorType.FOSSILIZATION, (
        f"Expected FOSSILIZATION, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-007: Correct Answer Returns ErrorType.NONE
# ============================================================


def test_correct_answer_returns_none():
    """Exact match should return NONE error type."""
    result = classify_error(
        response="книгу",
        correct="книгу",
        skill_id="accusative.fem_singular",
    )

    assert result.error_type == ErrorType.NONE, (
        f"Expected NONE, got {result.error_type}: {result.explanation}"
    )


# ============================================================
# TC-ERR-008: Spelling Error vs. Grammar Error Distinction
# ============================================================


def test_spelling_error_vs_grammar_error():
    """
    The case ending -у is correct; only a character was added (typo).
    Should be classified as SPELLING, not TRANSFER.
    """
    result = classify_error(
        response="книгку",
        correct="книгу",
        skill_id="accusative.fem_singular",
    )

    assert result.error_type == ErrorType.SPELLING, (
        f"Expected SPELLING, got {result.error_type}: {result.explanation}"
    )
    # Verify it's NOT classified as transfer
    assert result.error_type != ErrorType.TRANSFER, (
        "Typo must not be classified as a TRANSFER error"
    )


# ============================================================
# TC-ERR-009: Cyrillic-Latin Confusion Detection
# ============================================================


def test_cyrillic_latin_confusion_detection():
    """
    Response contains Latin 'y' instead of Cyrillic 'у'.
    These look identical but are different Unicode characters.
    """
    # "книгy" — last char is Latin 'y' (U+0079) not Cyrillic 'у' (U+0443)
    response_with_latin_y = "книг" + "y"  # Latin y

    result = classify_error(
        response=response_with_latin_y,
        correct="книгу",
        skill_id="accusative.fem_singular",
    )

    assert result.error_type == ErrorType.SCRIPT_CONFUSION, (
        f"Expected SCRIPT_CONFUSION, got {result.error_type}: {result.explanation}"
    )

    # Assert: Feedback includes "Check for mixed Cyrillic/Latin characters"
    assert any(
        "Check for mixed Cyrillic/Latin characters" in fb
        for fb in result.feedback
    ), (
        f"Feedback must include 'Check for mixed Cyrillic/Latin characters', "
        f"got: {result.feedback}"
    )
