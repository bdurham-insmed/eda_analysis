FROM python:3.12-slim


RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates

ADD https://astral.sh/uv/install.sh /uv-installer.sh

RUN sh /uv-installer.sh && rm /uv-installer.sh

ENV PATH="/root/.local/bin/:$PATH"

WORKDIR /app

COPY uv.lock ./
COPY services/api_server/pyproject.toml ./

COPY services/api_server/main.py .
COPY services/api_server/schemas.py .
COPY services/api_server/db.py .
COPY services/api_server/websocket_manager.py .
COPY services/api_server/queries ./queries
COPY services/api_server/routes ./routes

RUN uv lock && uv sync --frozen

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
