# Arquitectura

## Implementado

```text
Instalador → Next.js/TypeScript → FastAPI/Pydantic → MongoDB
                    |                   |
                    |                   +→ motor CCTV + motor de alarma
                    |                                  |
                    +← resultado técnico y BOM ←───────┘
                    |
                    +→ snapshot → exportador Excel
```

`frontend/components/QuoteWizard.tsx` mantiene los siete pasos del relevamiento.
Los componentes existentes de `frontend/components/cameras/` presentan
configuración general, editor individual, detalle y orientación de lente.
`frontend/lib/cameras.ts` normaliza las cámaras, conserva la herencia y adapta
el conjunto al contrato agregado de estimación. `frontend/types/quote.ts`
define los requisitos, cámaras, defaults y proyecto; `frontend/lib/api.ts`
centraliza el acceso a la API.

`backend/app/models/quote.py` valida requisitos CCTV y datos individuales.
`backend/app/services/quote_engine.py` conserva el motor determinista de
dimensionamiento preliminar. La API actual de estimación es
`POST /api/v1/quotes/estimate`; admite clientes anteriores que envían solamente
los campos agregados.

`backend/app/api/routes/projects.py` ofrece creación (`POST /api/v1/projects`),
lista (`GET /api/v1/projects`), lectura (`GET /api/v1/projects/{id}`) y actualización
(`PUT /api/v1/projects/{id}`). Se conserva un único documento de proyecto con
cliente/sitio, relevamiento, requisitos, cámaras, defaults, estado de borrador
y última estimación. Las cámaras y defaults viajan dentro de `requirements`;
los datos completos de la visita viajan en `survey`.

El guardado usa modelos validados y serializados, no una nueva colección paralela
de cámaras. La recuperación normaliza campos ausentes para proyectos antiguos
y restaura el estado del wizard. Las personalizaciones individuales no se
reconstruyen a partir de los defaults cuando ya están almacenadas. Consultar
[el contrato CCTV y la compatibilidad](cctv-requirements.md).

El subsistema de alarma conserva contratos independientes y su motor en
`backend/app/services/alarm_engine.py`. `alarm` sigue siendo opcional en los
requisitos. Su previsualización usa `POST /api/v1/quotes/alarm/estimate`; el
resultado de CCTV incorpora su BOM cuando está activo. Esta iteración revisa
sus medios de comunicación sin modificar su comportamiento.

`POST /api/v1/exports/materials.xlsx` recibe el snapshot del resultado vigente,
cámaras normalizadas y contexto del proyecto. `backend/app/services/excel_export.py`
genera el archivo en memoria con `openpyxl`. No calcula almacenamiento, materiales
ni compatibilidad de equipos. No se implementa envío de email.

## Responsabilidades actuales

- Frontend: captura en español, presentación móvil, herencia/personalización,
  pendientes, validación inmediata, guardado/recuperación y exportación.
- Backend: validación del contrato, persistencia, normalización de legado,
  dimensionamiento CCTV/alarma, BOM y cálculo comercial con importes manuales.
- MongoDB: documentos de `projects`; credenciales solamente en backend.

El frontend y la API se despliegan por separado. El frontend conserva Next.js
16.3.8 y la URL de API configurable para Vercel. El backend permite configurar
los orígenes CORS, la URI y la base MongoDB.

## Futuro

Autenticación, empresas/usuarios, clientes independientes, catálogo de productos,
proveedores/listas de precios, versiones de presupuesto, fotos/planos, propuestas
y editor comercial. Estas capacidades no deben inferirse del diagrama actual.

La selección de productos y precios deberá guardar snapshots para conservar
presupuestos históricos. DORI/FOV, densidad de píxeles, geometría, consumo PoE
real y compatibilidad de analíticas requieren datos validados de equipos.
