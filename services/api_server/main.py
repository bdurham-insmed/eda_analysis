"""
FastAPI app entry point. Routes are organised by concern under `routes/`;
queries by concern under `queries/`. This file only wires the app together.
"""

import logging

from dotenv.main import load_dotenv
from fastapi import FastAPI
from fastapi import Request
from fastapi import status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes.broadcast import router as broadcast_router
from routes.parameters import router as parameters_router
from routes.pipelines import router as pipelines_router
from routes.workflows import router as workflows_router

load_dotenv()

app = FastAPI(title="Pipeline Monitoring API Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    Handle validation errors for incoming requests.
    """
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    content = {"status_code": 422, "message": exc_str, "data": None}
    return JSONResponse(content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


app.include_router(pipelines_router)
app.include_router(workflows_router)
app.include_router(parameters_router)
app.include_router(broadcast_router)
