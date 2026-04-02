"""
Error Classification Pipeline for Russkiy

Classifies learner errors into types that drive the adaptive engine:
- TRANSFER: English pattern imposed on Russian
- OVERGENERALIZATION: Applying a Russian rule too broadly
- AVOIDANCE: Consistently dodging a structure
- FOSSILIZATION: Persistent error resistant to correction
- SPELLING: Typo/orthographic error (correct morphology)
- SCRIPT_CONFUSION: Mixed Cyrillic/Latin characters
- NONE: Correct answer
- GENERAL: Other errors
"""

from enum import Enum
from dataclasses import dataclass, field


class ErrorType(str, Enum):
    NONE = "none"
    TRANSFER = "transfer"
    OVERGENERALIZATION = "overgeneralization"
    AVOIDANCE = "avoidance"
    FOSSILIZATION = "fossilization"
    SPELLING = "spelling"
    SCRIPT_CONFUSION = "script_confusion"
    GENERAL = "general"


@dataclass
class ClassificationResult:
    error_type: ErrorType
    confidence: float
    explanation: str
    feedback: list[str] = field(default_factory=list)


# Cyrillic characters that look like Latin
LATIN_LOOKALIKES = {
    "a": "а",
    "e": "е",
    "o": "о",
    "p": "р",
    "c": "с",
    "x": "х",
    "y": "у",
    "A": "А",
    "B": "В",
    "E": "Е",
    "K": "К",
    "M": "М",
    "H": "Н",
    "O": "О",
    "P": "Р",
    "C": "С",
    "T": "Т",
    "X": "Х",
}

# Set of all Cyrillic characters
CYRILLIC_CHARS = set(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
)

# Set of Latin characters
LATIN_CHARS = set(
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
)

# Known English→Russian transfer patterns
TRANSFER_PATTERNS = {
    "nominative_for_accusative": {
        "description": "Using nominative form where accusative is needed",
        "example": "Я вижу книга (should be книгу)",
    },
    "word_order_rigidity": {
        "description": "Forcing English SVO order where Russian allows flexibility",
        "example": "Avoiding OSV or other natural Russian orders",
    },
}

# Known irregular verb forms (response -> correct form)
IRREGULAR_VERB_PATTERNS = {
    "хотею": {"correct": "хочу", "explanation": "хотеть has irregular 1st person singular"},
    "хотеешь": {"correct": "хочешь", "explanation": "хотеть mixes conjugation patterns"},
    "можею": {"correct": "могу", "explanation": "мочь has irregular stem change"},
    "бежу": {"correct": "бегу", "explanation": "бежать has consonant alternation"},
    "ездию": {"correct": "езжу", "explanation": "ездить has consonant mutation"},
}


def classify_error(
    response: str,
    correct: str,
    skill_id: str = "",
    learner_l1: str = "en",
    error_history: list[dict] | None = None,
    expected_complexity: str | None = None,
) -> ClassificationResult:
    """
    Classify a learner's error by analyzing the response against the correct answer.

    Args:
        response: The learner's answer
        correct: The correct answer
        skill_id: The skill being tested (e.g., "accusative.fem_singular")
        learner_l1: Learner's native language code
        error_history: Previous errors for fossilization detection
        expected_complexity: Expected CEFR level complexity (e.g., "B1")

    Returns:
        ClassificationResult with error type, confidence, explanation, and feedback
    """
    if error_history is None:
        error_history = []

    # Stage 0: Check if answer is correct
    if response.strip() == correct.strip():
        return ClassificationResult(
            error_type=ErrorType.NONE,
            confidence=1.0,
            explanation="Answer is correct.",
        )

    # Stage 1: Check for script confusion (Cyrillic/Latin mix)
    script_result = _check_script_confusion(response, correct)
    if script_result:
        return script_result

    # Stage 2: Check for spelling errors (correct morphology, wrong characters)
    spelling_result = _check_spelling(response, correct)
    if spelling_result:
        return spelling_result

    # Stage 3: Check for fossilization (repeated identical errors)
    if _check_fossilization(response, error_history):
        count = _count_same_error(response, error_history)
        return ClassificationResult(
            error_type=ErrorType.FOSSILIZATION,
            confidence=0.85,
            explanation=(
                f"This same error has been repeated {count} times "
                f"in the last 30 days."
            ),
        )

    # Stage 4: Check for avoidance (simplified response)
    avoidance_result = _check_avoidance(
        response, correct, skill_id, expected_complexity
    )
    if avoidance_result:
        return avoidance_result

    # Stage 5: Check for L1 transfer patterns
    transfer_result = _check_transfer_patterns(
        response, correct, skill_id, learner_l1
    )
    if transfer_result:
        return transfer_result

    # Stage 6: Check for overgeneralization
    overgen_result = _check_overgeneralization(response, correct, skill_id)
    if overgen_result:
        return overgen_result

    # Default
    return ClassificationResult(
        error_type=ErrorType.GENERAL,
        confidence=0.5,
        explanation="Error does not match known patterns.",
    )


def _check_script_confusion(
    response: str, correct: str
) -> ClassificationResult | None:
    """Check if the response mixes Cyrillic and Latin characters."""
    resp_chars = set(response) - set(" .,!?-—")

    has_cyrillic = bool(resp_chars & CYRILLIC_CHARS)
    has_latin = bool(resp_chars & LATIN_CHARS)

    if has_cyrillic and has_latin:
        latin_in_resp = resp_chars & LATIN_CHARS
        confusions = []
        for ch in sorted(latin_in_resp):
            if ch in LATIN_LOOKALIKES:
                confusions.append(
                    f"'{ch}' (Latin) should be '{LATIN_LOOKALIKES[ch]}' (Cyrillic)"
                )

        feedback = ["Check for mixed Cyrillic/Latin characters"]
        if confusions:
            feedback.append(f"Found: {'; '.join(confusions)}")

        return ClassificationResult(
            error_type=ErrorType.SCRIPT_CONFUSION,
            confidence=0.95,
            explanation=(
                "Response contains mixed Cyrillic and Latin characters. "
                "Some Latin letters look identical to Cyrillic but are "
                "different Unicode characters."
            ),
            feedback=feedback,
        )

    return None


def _check_spelling(response: str, correct: str) -> ClassificationResult | None:
    """
    Check if the error is a pure spelling/typo error.

    A spelling error is when:
    - The edit distance is small (1-2 characters)
    - The morphological ending is correct (case, conjugation, etc.)
    """
    if response == correct:
        return None

    distance = _levenshtein_distance(response, correct)
    max_typo_distance = 1 if len(correct) <= 4 else 2

    if distance <= max_typo_distance:
        # Check if the ending (last 2 chars) is preserved — morphology correct
        resp_ending = response[-2:] if len(response) >= 2 else response
        corr_ending = correct[-2:] if len(correct) >= 2 else correct

        if resp_ending == corr_ending:
            return ClassificationResult(
                error_type=ErrorType.SPELLING,
                confidence=0.85,
                explanation=(
                    f"The case/conjugation ending is correct ('{resp_ending}'), "
                    f"but there is a spelling error in the stem. "
                    f"Edit distance: {distance}."
                ),
                feedback=[
                    f"Check spelling: expected '{correct}', got '{response}'"
                ],
            )

        # Extra character inserted in the middle
        if distance == 1 and len(response) == len(correct) + 1:
            for i in range(len(response)):
                candidate = response[:i] + response[i + 1:]
                if candidate == correct:
                    return ClassificationResult(
                        error_type=ErrorType.SPELLING,
                        confidence=0.80,
                        explanation=(
                            f"Extra character '{response[i]}' inserted at "
                            f"position {i}. This appears to be a typo."
                        ),
                        feedback=[
                            f"Check spelling: extra '{response[i]}' in '{response}'"
                        ],
                    )

    return None


def _check_transfer_patterns(
    response: str, correct: str, skill_id: str, learner_l1: str
) -> ClassificationResult | None:
    """Check if the error matches known L1 transfer patterns."""
    if learner_l1 != "en":
        return None

    # Word order transfer: same words but different order
    resp_words = response.strip().rstrip(".!?").split()
    corr_words = correct.strip().rstrip(".!?").split()

    if len(resp_words) > 2 and len(corr_words) > 2:
        resp_sorted = sorted(w.lower() for w in resp_words)
        corr_sorted = sorted(w.lower() for w in corr_words)
        if resp_sorted == corr_sorted and resp_words != corr_words:
            return ClassificationResult(
                error_type=ErrorType.TRANSFER,
                confidence=0.80,
                explanation=(
                    "Word order differs from expected. English speakers tend to "
                    "impose rigid SVO order onto Russian, which allows flexible "
                    "word order for emphasis and topic/focus distinctions."
                ),
            )

    # Case-related transfer
    if "case" in skill_id or "accusative" in skill_id or "genitive" in skill_id:
        if response != correct and len(response) > 2 and len(correct) > 2:
            if correct.endswith(("у", "ю")) and response.endswith(("а", "я")):
                return ClassificationResult(
                    error_type=ErrorType.TRANSFER,
                    confidence=0.8,
                    explanation=(
                        "Nominative ending used where accusative is needed. "
                        "English doesn't mark object case, so this is a common "
                        "transfer error."
                    ),
                )
            if correct.endswith(("ы", "и", "ов", "ей")) and not response.endswith(
                ("ы", "и", "ов", "ей")
            ):
                return ClassificationResult(
                    error_type=ErrorType.TRANSFER,
                    confidence=0.75,
                    explanation=(
                        "Missing case marking. English uses prepositions "
                        "instead of case endings."
                    ),
                )

    # Aspect-related transfer
    if "aspect" in skill_id:
        return ClassificationResult(
            error_type=ErrorType.TRANSFER,
            confidence=0.7,
            explanation=(
                "English speakers tend to think in tenses rather than aspects, "
                "leading to wrong aspect choice."
            ),
        )

    return None


def _check_overgeneralization(
    response: str, correct: str, skill_id: str
) -> ClassificationResult | None:
    """Check if learner applied a Russian rule too broadly."""
    resp_lower = response.strip().lower()

    # Check irregular verb conjugation patterns
    if resp_lower in IRREGULAR_VERB_PATTERNS:
        info = IRREGULAR_VERB_PATTERNS[resp_lower]
        return ClassificationResult(
            error_type=ErrorType.OVERGENERALIZATION,
            confidence=0.85,
            explanation=(
                f"Applied regular conjugation pattern to an irregular verb. "
                f"{info['explanation']}. "
                f"Correct form: '{info['correct']}'."
            ),
        )

    # Genitive plural -ов overgeneralization
    if "genitive" in skill_id and "plural" in skill_id:
        if response.endswith("ов") and not correct.endswith("ов"):
            return ClassificationResult(
                error_type=ErrorType.OVERGENERALIZATION,
                confidence=0.75,
                explanation=(
                    "Applied masculine -ов genitive plural ending to a "
                    "non-masculine noun."
                ),
            )

    # Nominative plural: genitive ending used instead
    if "nominative" in skill_id and "plural" in skill_id:
        if response.endswith("ов") and not correct.endswith("ов"):
            return ClassificationResult(
                error_type=ErrorType.OVERGENERALIZATION,
                confidence=0.75,
                explanation=(
                    "Applied genitive plural -ов ending where nominative plural "
                    "is needed. This is a valid Russian ending used in the "
                    "wrong case."
                ),
            )

    # Present tense: regular pattern on irregular verb
    if "present" in skill_id or "irregular" in skill_id or "tense" in skill_id:
        if resp_lower.endswith(("ею", "ую")) and correct.lower().endswith(
            ("у", "чу", "жу", "гу")
        ):
            return ClassificationResult(
                error_type=ErrorType.OVERGENERALIZATION,
                confidence=0.80,
                explanation=(
                    f"Applied regular 1st conjugation ending to an irregular "
                    f"verb. Expected '{correct}', got '{response}'."
                ),
            )

    return None


def _check_avoidance(
    response: str,
    correct: str,
    skill_id: str,
    expected_complexity: str | None = None,
) -> ClassificationResult | None:
    """Check if the response avoids the target structure."""
    resp_words = response.strip().split()

    # Check if response is dramatically shorter (< 50% expected length)
    if len(response.strip()) < len(correct.strip()) * 0.5:
        return ClassificationResult(
            error_type=ErrorType.AVOIDANCE,
            confidence=0.6,
            explanation=(
                "Response appears to avoid the target structure by using "
                "a simpler alternative."
            ),
        )

    # Complexity-based avoidance
    if expected_complexity and expected_complexity in ("B1", "B2", "C1", "C2"):
        complexity_markers = [
            "который", "которая", "которое", "которые",
            "чтобы", "потому что", "так как", "если",
            "несмотря на", "хотя", "тем не менее",
        ]

        has_complexity = any(
            marker in response.lower() for marker in complexity_markers
        )

        if not has_complexity and len(resp_words) < 6:
            return ClassificationResult(
                error_type=ErrorType.AVOIDANCE,
                confidence=0.65,
                explanation=(
                    f"Response is at a lower complexity level than expected "
                    f"({expected_complexity}). The learner may be avoiding "
                    f"complex structures they find difficult."
                ),
            )

    return None


def _check_fossilization(response: str, error_history: list[dict]) -> bool:
    """Check if this exact error has been repeated 5+ times in 30 days."""
    return _count_same_error(response, error_history) >= 5


def _count_same_error(response: str, error_history: list[dict]) -> int:
    """Count how many times this exact response appeared in history."""
    return sum(1 for entry in error_history if entry.get("response") == response)


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Compute the Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]
