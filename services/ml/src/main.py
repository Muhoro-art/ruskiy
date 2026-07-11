"""
Russkiy ML Service
FastAPI server for error classification and pronunciation scoring.
"""

import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from error_classifier.classifier import classify_error, ClassificationResult

app = FastAPI(
    title="Russkiy ML Service",
    description="Error classification and pronunciation scoring for the Russkiy adaptive learning platform",
    version="0.1.0",
)

# Optional shared-secret auth. When ML_SERVICE_KEY is set, the caller (the Go API)
# must present it in the X-ML-Key header — this closes the "open endpoint if bound to
# anything but loopback" gap. Deployments should ALSO bind uvicorn to 127.0.0.1.
_ML_KEY = os.getenv("ML_SERVICE_KEY", "")


def _require_key(x_ml_key: str | None) -> None:
    if _ML_KEY and x_ml_key != _ML_KEY:
        raise HTTPException(status_code=401, detail="unauthorized")


class ClassifyErrorRequest(BaseModel):
    # Bounded lengths so an adversarial caller can't drive the O(n*m) Levenshtein
    # in the classifier into a CPU DoS with huge strings.
    response: str = Field(max_length=2000)
    correct_answer: str = Field(max_length=2000)
    skill_id: str = Field(max_length=200)
    learner_l1: str = Field(default="en", max_length=16)
    error_history: list[dict] = Field(default_factory=list, max_length=100)


class ClassifyErrorResponse(BaseModel):
    error_type: str
    confidence: float
    explanation: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "russkiy-ml", "version": "0.1.0"}


@app.post("/v1/classify-error", response_model=ClassifyErrorResponse)
async def classify_error_endpoint(request: ClassifyErrorRequest, x_ml_key: str | None = Header(default=None)):
    """Classify a learner error by type (transfer, overgeneralization, etc.)"""
    _require_key(x_ml_key)
    result: ClassificationResult = classify_error(
        response=request.response,
        correct=request.correct_answer,
        skill_id=request.skill_id,
        learner_l1=request.learner_l1,
        error_history=request.error_history,
    )
    return ClassifyErrorResponse(
        error_type=result.error_type.value,
        confidence=result.confidence,
        explanation=result.explanation,
    )


# Pronunciation scoring endpoint (Phase 1 v4-6)
# @app.post("/v1/score-pronunciation")
# async def score_pronunciation(audio: UploadFile, expected_text: str):
#     pass
