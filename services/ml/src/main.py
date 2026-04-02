"""
Russkiy ML Service
FastAPI server for error classification and pronunciation scoring.
"""

from fastapi import FastAPI
from pydantic import BaseModel

from error_classifier.classifier import classify_error, ClassificationResult

app = FastAPI(
    title="Russkiy ML Service",
    description="Error classification and pronunciation scoring for the Russkiy adaptive learning platform",
    version="0.1.0",
)


class ClassifyErrorRequest(BaseModel):
    response: str
    correct_answer: str
    skill_id: str
    learner_l1: str = "en"
    error_history: list[dict] = []


class ClassifyErrorResponse(BaseModel):
    error_type: str
    confidence: float
    explanation: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "russkiy-ml", "version": "0.1.0"}


@app.post("/v1/classify-error", response_model=ClassifyErrorResponse)
async def classify_error_endpoint(request: ClassifyErrorRequest):
    """Classify a learner error by type (transfer, overgeneralization, etc.)"""
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
