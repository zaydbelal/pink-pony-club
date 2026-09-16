"""Route error handling - a direct port of lib/api-utils.ts."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from google.genai.errors import APIError


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid request body", "issues": exc.errors()},
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_request: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

    @app.exception_handler(APIError)
    async def handle_gemini_api_error(_request: Request, exc: APIError):
        status = exc.code
        if status == 429:
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limited by Gemini API, try again shortly"},
            )
        if status in (401, 403):
            return JSONResponse(
                status_code=500, content={"error": "Gemini API authentication failed"}
            )
        if status is not None and 400 <= status < 500:
            return JSONResponse(
                status_code=400, content={"error": f"Bad request to Gemini: {exc.message}"}
            )
        return JSONResponse(status_code=502, content={"error": f"Gemini API error: {exc.message}"})

    @app.exception_handler(Exception)
    async def handle_unknown_error(_request: Request, exc: Exception):
        return JSONResponse(status_code=500, content={"error": str(exc) or "Unknown error"})
