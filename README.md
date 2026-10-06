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

### Alarma / Intrusión

El paso de cámaras incorpora un subsistema opcional de alarma, desactivado por
defecto, con relevamiento rápido y personalización avanzada. El motor vive en
FastAPI; `alarm` es opcional en `POST /api/v1/quotes/estimate`. La previsualización
usa `POST /api/v1/quotes/alarm/estimate` y el mismo motor. El resultado combina
la BOM de CCTV y alarma sin precios nuevos. El Excel agrega **Alarma** solamente
cuando está activa, y amplía **Resumen** y **Materiales** desde el resultado.

Consultar [reglas y limitaciones de alarma](docs/alarm-rules.md) para zonas,
overrides, expansión, consumos placeholder, cableado, batería y advertencias.
No se agregan dependencias ni integración con servicios reales de monitoreo.

Pruebas del módulo: `python -m pytest -q` desde `backend` y `npm test` desde
`frontend`. `tests/alarm.browser.cjs` verifica el flujo completo contra una API
local mediante `ALARM_API_URL`, un frontend indicado por `WIZARD_URL` y una
instalación existente de Playwright (`PLAYWRIGHT_MODULE`).

### Exportar proyecto

El resultado permite descargar un `.xlsx` generado en memoria por
`POST /api/v1/exports/materials.xlsx`. El request contiene un snapshot del
resultado actual (`estimate`, incluida su BOM), cámaras con su recomendación
preliminar de lente, cliente/sitio, fecha local y parámetros de grabación.
No recalcula materiales ni guarda archivos. La dependencia nueva del backend
es `openpyxl>=3.1.5,<4` (incluida en `requirements.txt`).

El Excel incluye **Resumen**, **Materiales** y **Cámaras**, con filtros,
encabezados congelados, importes y porcentajes formateados. Los textos se
exportan como valores literales, sin ejecutar fórmulas. Un ejemplo de nombre:
`colcams_Jose_Cliente_Porton_principal_2026-10-06.xlsx`.

El frontend envía el snapshot, recibe un Blob y descarga mediante un enlace
temporal, conservando el wizard. El modelo actual tiene una sola referencia
de sitio; no se inventan un nombre de proyecto ni una dirección separados.
Las descripciones de materiales conservan el texto original de la BOM; las
categorías conocidas se traducen. La unidad se deriva de categorías conocidas
(`cable`: metros; equipos: unidades), dejando vacías las desconocidas.

El modal de email valida el formato y comunica que el envío no está configurado.
`backend/app/services/export_email.py` define el contrato del futuro proveedor.
No existe endpoint de envío ni se envían emails. Un futuro adaptador debe leer
`RESEND_API_KEY` solamente en backend y agregar autenticación y límites antes
de exponer el envío, reutilizando el mismo generador Excel.

Pruebas: `python -m pytest -q` desde `backend`; `npm test` y `npm run build`
desde `frontend`. La prueba de navegador opcional también verifica descarga
real, recuperación de errores y modal en escritorio y móvil si se define
`EXPORT_API_URL` con una API local en ejecución. La estimación se simula en
esa prueba; el endpoint de exportación se invoca realmente.

El módulo de cámaras distingue distancia de cableado (`distanceM`) de distancia
al punto de interés (`targetDistanceM`, opcional y no negativa). `viewingRange`
registra vista cercana, media, lejana o ambas. Inicialmente usa vista cercana
sin asumir una distancia. El reducer existente conserva los defaults en el
frontend: las cámaras sin personalizar los heredan; guardar conserva todos los
valores individuales y restablecer recupera los defaults actuales.

`getLensRecommendation` en `frontend/lib/cameras.ts` ofrece orientaciones de
2.8–4 mm, 4–6 mm, 6–12 mm/varifocal o evaluación de una segunda cámara.
A partir de 20 m sugiere revisar los casos cercano y lejano; es un umbral
de revisión modificable, no un límite óptico. El caso mixto siempre muestra
una advertencia sin bloquear. No calcula DORI ni selecciona productos.
Los campos nuevos permanecen en el estado del relevamiento y no se envían
al backend ni se persisten. El request de estimación conserva su esquema.

Desde `frontend`, ejecutar `npm test` (Node con soporte de eliminación de
tipos, validado con Node 24) y `npm run build`.

`frontend/tests/wizard.browser.cjs` verifica los siete pasos, overrides,
payload y resultado en escritorio y móvil con API simulada. No instala
dependencias: necesita una instalación existente de Playwright, indicada
mediante `PLAYWRIGHT_MODULE` si no está en la resolución habitual de Node.
Con el servidor iniciado, ejecutar `node tests/wizard.browser.cjs` desde
`frontend`; `WIZARD_URL` permite cambiar la URL (default: localhost:3100).

Early MVP / active development.

The application is currently intended for internal testing and validation with electronic security installers.
