ifeq ($(OS),Windows_NT)
PYTHON ?= py -3.11
VENV_PYTHON = backend/.venv/Scripts/python.exe
BACKEND_PYTHON = .venv/Scripts/python.exe
else
PYTHON ?= python3.11
VENV_PYTHON = backend/.venv/bin/python
BACKEND_PYTHON = .venv/bin/python
endif

.PHONY: setup backend frontend

setup:
	$(PYTHON) -m venv backend/.venv
	$(VENV_PYTHON) -m pip install -r backend/requirements.txt
	cd frontend && npm install

backend:
	cd backend && $(BACKEND_PYTHON) -m uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev
