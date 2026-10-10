# Security Quote

Aplicación de relevamiento y presupuesto técnico para instaladores de seguridad
electrónica. Permite registrar la visita, preparar una BOM preliminar y estimar
materiales, almacenamiento, mano de obra, margen bruto y precio de venta.

## Implementado

- Wizard de siete pasos en español, usable desde celular.
- CCTV con configuración general y personalizaciones individuales por cámara.
- Alcance visual, objetivo de imagen, distancia al objetivo, requisitos
  nocturnos, eventos, objetivos de detección y acciones solicitadas.
- Grabación continua, por eventos o a definir; retención de 1 a 180 días.
- Pendientes técnicos/comerciales que permiten guardar un borrador y errores
  de validación que deben corregirse.
- Estimación determinista preliminar de NVR, almacenamiento, puertos PoE,
  switch, cableado y BOM; costos ingresados manualmente y margen bruto.
- Guardado y recuperación de proyectos en MongoDB, incluidos relevamiento,
  cámaras, defaults y personalizaciones; actualización del proyecto abierto.
- Subsistema opcional de alarma/intrusión, con motor independiente.
- Excel con **Resumen**, **Materiales** y **Cámaras**; **Alarma** cuando está activa.

Las selecciones expresan requisitos del cliente. «Identificar», color nocturno
o detección de personas no certifican capacidades de un equipo. La orientación
de lente sigue siendo preliminar. Consultar los [requisitos CCTV y sus
limitaciones](docs/cctv-requirements.md) antes de usar el resultado como propuesta.

## Arquitectura y documentación

Frontend: Next.js **16.3.8**, React y TypeScript. Backend: FastAPI y Python.
Persistencia: MongoDB. No se incorporan dependencias nuevas en la iteración
de requisitos CCTV.

```text
Formulario → normalización → API/validación → MongoDB/proyecto
                 ↑                               ↓
                 └──────── recuperación ─────────┘

Requisitos → motor técnico → resultado/BOM → exportación Excel
```

- [Requisitos CCTV, persistencia y compatibilidad](docs/cctv-requirements.md).
- [Informe de la iteración CCTV y verificación](docs/cctv-iteration-report.md).
- [Reglas de dimensionamiento CCTV](docs/quote-rules.md).
- [Arquitectura implementada y futura](docs/architecture.md).
- [Reglas de alarma y significado de «medios de comunicación»](docs/alarm-rules.md).
- [Definición del producto](docs/product.md), [roadmap](docs/roadmap.md) y
  [decisiones](docs/decisions.md).

La estructura principal es `frontend/` (interfaz, tipos y pruebas), `backend/`
(API, modelos, motores y pruebas) y `docs/` (documentación).

## Ejecución local

Desde `backend/`, crear y activar el entorno virtual, instalar dependencias e
iniciar FastAPI:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

La API escucha en `http://localhost:8000`; la documentación interactiva está
en `http://localhost:8000/docs`. Configurar `MONGODB_URI` y `MONGODB_DB` en el
`.env` del backend para guardar y abrir proyectos. `CORS_ORIGINS` admite una
lista separada por comas; incluir el origen del frontend utilizado.

Desde `frontend/`:

```powershell
npm install
npm run dev
```

El frontend escucha en `http://localhost:3000`. Configurar
`NEXT_PUBLIC_API_URL` en `.env.local` si la API utiliza otra dirección. Usar
[.env.example](.env.example) como referencia y mantener credenciales y secretos
fuera del repositorio. Para Vercel, conservar Next.js 16.3.8 y configurar la URL
pública de la API; MongoDB y sus credenciales se usan solamente en backend.

## Guardar, abrir y estimar

El wizard permite **Guardar borrador** durante el relevamiento y abrir un
proyecto guardado. Guarda los datos individuales, los defaults generales, los
requisitos de grabación, el relevamiento completo y la alarma. Al editar un
proyecto abierto se actualiza su documento mediante la API existente ampliada.
Se requiere una conexión disponible con la API y MongoDB.

Los cambios técnicos obligan a obtener una estimación actual. El Excel utiliza
el resultado vigente y los datos normalizados; no vuelve a dimensionar la
solución. La descarga no envía correo: el modal comunica que el proveedor de
email todavía no está configurado.

## Verificación

Comandos disponibles, sin afirmar resultados de una ejecución particular:

```powershell
# Desde backend/
python -m pytest -q

# Desde frontend/ (Node con soporte de --experimental-strip-types)
npm test
npm run build
```

Las pruebas opcionales de navegador usan una instalación existente de
Playwright (`PLAYWRIGHT_MODULE` si es necesario) y un frontend indicado por
`WIZARD_URL`, cuyo valor por defecto es `http://localhost:3100`:

```powershell
node tests/wizard.browser.cjs
node tests/alarm.browser.cjs
```

`EXPORT_API_URL` habilita la verificación real de exportación en la prueba del
wizard; `ALARM_API_URL` indica la API para la prueba de alarma. No se agrega
Playwright como dependencia del proyecto.

`tests/cctv.browser.cjs` verifica el nuevo flujo contra la API desde escritorio
y móvil mediante Chromium existente y Node 24, sin depender de Playwright.
Usa `WIZARD_URL`, `CCTV_API_URL` y, si hace falta, `CHROMIUM_PATH`:

```powershell
node tests/cctv.browser.cjs
```

Para pruebas locales sin MongoDB, `backend/tests/browser_api.py` monta las rutas,
modelos, motores y Excel reales con una colección de proyectos en memoria:

```powershell
# Desde backend/
.\.venv\Scripts\python.exe -m uvicorn browser_api:app --app-dir tests --host 127.0.0.1 --port 8100
```

Ese harness es solamente para pruebas: pierde datos al cerrarse y no sustituye
la conexión MongoDB de la aplicación ni verifica un servidor MongoDB real.

## Futuro

Quedan pendientes DORI, FOV y cálculo óptico real; selección de modelos y SKU;
catálogos, proveedores y precios reales; planos y recorridos; integración de
sirena/NVR/alarma; horarios y actividad validada de eventos; propuestas PDF,
email real e IA. El motor actual no garantiza detalle de imagen ni retención
exacta. Es un MVP para validación con instaladores.
