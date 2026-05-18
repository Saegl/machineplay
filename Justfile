run-backend:
    cd backend && uv run uvicorn app.main:app --reload --timeout-graceful-shutdown 0

test-backend:
    cd backend && uv run pytest

coverage-backend:
    cd backend && uv run pytest --cov --cov-report=term-missing --cov-report=html
    xdg-open backend/htmlcov/index.html

run-frontend:
    cd frontend && pnpm dev

# Export the FastAPI OpenAPI schema and regenerate frontend TS types.
gen-api:
    cd backend && PYTHONPATH=. uv run python scripts/export_openapi.py
    cd frontend && pnpm gen-api

run-db:
    mongod --dbpath db/ --bind_ip 127.0.0.1 --port 27017

deploy:
    ssh root@machineplay.org deploy-machineplay
