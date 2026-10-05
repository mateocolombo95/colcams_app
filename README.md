# Security Quote MVP

Working name for a web app that helps security installers perform a site survey, dimension a CCTV solution, calculate costs/margins, and generate a commercial quote.

## Stack

- Frontend: Next.js + TypeScript
- Backend: FastAPI + Python
- Database: MongoDB
- Local DB option: Docker Compose
- Data imports later: Pandas + OpenPyXL

## MVP v0.1

The first functional slice focuses on CCTV IP:

1. Capture basic customer/site requirements.
2. Estimate:
   - NVR channel count
   - storage
   - PoE port requirement
   - cable quantity
3. Build an initial BOM.
4. Calculate internal cost, margin and sale price.
5. Save projects in MongoDB.

The technical calculation is deterministic. AI is intentionally not part of the critical calculation engine yet.

## Project structure

```text
security-quote-mvp/
├── backend/
│   └── app/
├── frontend/
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

## 1. MongoDB

### Option A — local with Docker

```bash
docker compose up -d
```

This exposes MongoDB on `localhost:27017`.

### Option B — MongoDB Atlas

Set `MONGODB_URI` in `backend/.env`.

## 2. Backend

```bash
cd backend

python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt

copy .env.example .env
# macOS/Linux: cp .env.example .env

uvicorn app.main:app --reload
```

API:
- http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

## 3. Frontend

In another terminal:

```bash
cd frontend
npm install

copy .env.example .env.local
# macOS/Linux: cp .env.example .env.local

npm run dev
```

Open:
- http://localhost:3000

## First manual test

On the home page, enter for example:

- Cameras: 8
- Outdoor cameras: 3
- Resolution: 4 MP
- Retention: 30 days
- Average cable per camera: 25 m
- Margin: 35%

The frontend calls the FastAPI quote engine and renders the proposed solution.

## GitHub

Once the project runs locally:

```bash
git init
git add .
git commit -m "Initial CCTV quote MVP scaffold"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

Keep the repo private while the product is still being defined.
