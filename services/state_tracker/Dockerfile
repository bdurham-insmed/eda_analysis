FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates

ADD https://astral.sh/uv/install.sh /uv-installer.sh

RUN sh /uv-installer.sh && rm /uv-installer.sh

ENV PATH="/root/.local/bin/:$PATH"

WORKDIR /app

COPY uv.lock ./
COPY services/state_tracker/pyproject.toml ./

COPY services/state_tracker/main.py .

RUN uv lock && uv sync --frozen

CMD ["uv", "run", "python", "main.py"]
