# Security Quote

Technical and commercial quoting platform for electronic security installers.

Security Quote helps installers go from a site survey to a structured technical solution, bill of materials, project cost and commercial proposal.

The initial MVP focuses on IP CCTV installations.

---

## Product vision

Electronic security installers often build quotations using a combination of:

- site notes
- spreadsheets
- supplier price lists
- manual calculations
- WhatsApp
- previous quotations
- technical experience

Security Quote aims to centralize this workflow.

The system guides the installer through the site survey and converts project requirements into a structured technical and commercial solution.

The long-term workflow is:

Site Survey
→ Technical Requirements
→ Engineering Engine
→ Bill of Materials
→ Supplier Pricing
→ Project Cost
→ Commercial Proposal

---

## Current MVP

The current version includes a guided CCTV site survey covering:

- customer and site information
- camera requirements
- indoor/outdoor cameras
- resolution
- PoE / Wi-Fi connectivity
- recording retention
- recording hours per day
- cabling estimates
- infrastructure requirements
- extraordinary work
- additional materials
- labor cost
- commercial margin

The system currently calculates:

- required NVR capacity
- estimated storage
- PoE requirements
- switch size
- estimated UTP cable
- preliminary BOM
- project cost
- gross margin
- sale price

---

## Camera configuration

Camera requirements can be defined using global defaults for fast quotations.

For more complex projects, individual cameras can override the global configuration.

Example:

C1 - Entrance - Outdoor - Bullet - 8 MP - PoE - 42 m  
C2 - Patio - Outdoor - Turret - 4 MP - PoE - 31 m  
C3 - Cash register - Indoor - Dome - 4 MP - PoE - 12 m

This model will later allow cameras to be associated with floor plans, products, suppliers and installation points.

---

## Engineering philosophy

Critical calculations should be:

- deterministic
- explainable
- auditable
- reproducible

AI should not silently make critical engineering decisions.

AI may later be used to:

- interpret installer notes
- structure customer requirements
- assist during site surveys
- generate technical descriptions
- generate commercial proposals
- suggest observations

The installer remains responsible for validating the technical solution.

---

## Architecture

Frontend:
- Next.js
- TypeScript

Backend:
- FastAPI
- Python

Database:
- MongoDB

Future integrations:
- supplier price lists
- Excel / CSV imports
- proposal generation
- project plans
- AI assistance

Architecture:

Installer
→ Next.js Web Application
→ FastAPI
→ Engineering / Pricing Engine
→ MongoDB

---

## Project structure

security-quote/
├── backend/
│   ├── app/
│   └── tests/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── types/
│
├── docs/
│   ├── product.md
│   ├── architecture.md
│   ├── roadmap.md
│   ├── quote-rules.md
│   └── decisions.md
│
├── .env.example
├── .gitignore
└── README.md

---

## Running locally

### Backend

From `/backend`:

python -m venv .venv

Activate the virtual environment on Windows:

.\.venv\Scripts\Activate.ps1

Install dependencies:

pip install -r requirements.txt

Start FastAPI:

uvicorn app.main:app --reload

Backend:

http://localhost:8000

API documentation:

http://localhost:8000/docs

### Frontend

From `/frontend`:

npm install

npm run dev

Frontend:

http://localhost:3000

---

## Environment variables

Environment variables must not be committed to the repository.

Use `.env.example` as reference and create local `.env` / `.env.local` files when required.

Never commit:

- credentials
- API keys
- MongoDB credentials
- supplier credentials
- production secrets

---

## Roadmap

Current:

Site survey wizard
→ Camera configuration
→ CCTV engineering engine

Next:

Individual camera engineering
→ Product catalog
→ Supplier catalogs
→ Supplier price comparison
→ Detailed BOM
→ Commercial proposal
→ PDF / shareable proposal
→ Site plan
→ AI-assisted survey

Future verticals:

- Access Control
- Intrusion Alarms
- Intercom
- Networking / Wi-Fi
- Fire Detection

---

## Status

Early MVP / active development.

The application is currently intended for internal testing and validation with electronic security installers.