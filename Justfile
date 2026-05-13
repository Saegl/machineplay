run-backend:
    cd backend && uvicorn app:app --reload --timeout-graceful-shutdown 0

test-backend:
    cd backend && uv run pytest

coverage-backend:
    cd backend && uv run pytest --cov --cov-report=term-missing --cov-report=html
    xdg-open backend/htmlcov/index.html

run-frontend:
    cd frontend && pnpm dev

run-db:
    mongod --dbpath db/ --bind_ip 127.0.0.1 --port 27017

deploy:
    ssh root@machineplay.org deploy-machineplay
