# Informe de la iteración de requisitos CCTV

Se extendió el wizard y el módulo de cámaras existentes. La iteración registra
requisitos del cliente, conserva herencia/personalizaciones y completa el flujo
de guardado/recuperación. Next.js se mantiene en 16.3.8; no se agregan dependencias.
El contrato detallado está en [requisitos CCTV](cctv-requirements.md).

## 1. Archivos modificados y creados

Frontend:

- `frontend/types/quote.ts`.
- `frontend/lib/cameras.ts`, `frontend/lib/api.ts`, `frontend/lib/exports.ts`.
- `frontend/components/QuoteWizard.tsx`, `frontend/components/QuoteResult.tsx`.
- `frontend/components/cameras/CameraDefaults.tsx`, `CameraEditor.tsx`,
  `CameraList.tsx`, `CameraDetails.tsx`.
- Nuevos `frontend/components/cameras/CameraRequirementsFields.tsx` y
  `CameraPending.tsx`.
- `frontend/app/globals.css`.
- `frontend/tests/cameras.test.mjs`, `exports.test.mjs`, `wizard.browser.cjs` y
  nuevos `projects.test.mjs` y `cctv.browser.cjs`.

Backend:

- `backend/app/models/quote.py`, `backend/app/models/export.py`.
- `backend/app/api/routes/projects.py`, `backend/app/api/routes/exports.py`.
- `backend/app/services/quote_engine.py`, `backend/app/services/excel_export.py`.
- Nuevo `backend/app/services/cctv_requirements.py` para normalización,
  adaptación agregada y pendientes compartidos.
- `backend/tests/test_excel_export.py`.
- Nuevos `backend/tests/test_cctv_requirements.py`, `test_cctv_projects.py` y
  `browser_api.py` (harness local de pruebas con almacenamiento en memoria).

Documentación:

- `README.md`, `docs/architecture.md`, `docs/quote-rules.md`, `docs/alarm-rules.md`.
- Nuevos `docs/cctv-requirements.md` y `docs/cctv-iteration-report.md`.

No se modificó funcionalmente el módulo de alarma. Los archivos generados por
Next.js o TypeScript durante verificación no forman parte de la implementación
de requisitos CCTV.

## 2. Campos nuevos

Por cámara y en sus defaults: `imageObjective`, `nightObjectiveRequired`,
`nightLighting`, `nightColorRequired`, `detectionEvent`, `detectionTarget` y
`eventActions`. El requisito general agrega `recordingMode`. El request conserva
el contrato agregado y extiende `requirements` con `cameras` y `cameraDefaults`.

El proyecto agrega `survey` completo. La respuesta de estimación agrega
`technical_pending` y `storage_hours_per_day`. El snapshot Excel agrega modo
de grabación y detalle/pendientes normalizados por cámara.

## 3. Campos y funciones existentes conservados

Se mantienen `viewingRange`, `targetDistanceM`, `distanceM`, `retention_days`,
resolución, ambiente, formato, conectividad, nombre/ubicación/notas y `customized`.
También se mantienen los siete pasos, configuración global, editor por cámara,
restablecimiento explícito, orientación preliminar de lente, endpoint de
estimación, cálculo comercial, BOM y exportación existentes.

`recording_hours_per_day` sigue en el contrato para clientes/proyectos antiguos;
ya no se solicita un horario en el relevamiento actual.

## 4. Alcance, objetivo y distancia

| Campo | Qué registra |
| --- | --- |
| `viewingRange` | Cobertura/alcance deseado: cercano, medio, lejano o mixto |
| `imageObjective` | Requisito de detalle: sin definir, vista general, reconocer o identificar |
| `targetDistanceM` | Distancia aproximada hasta la persona/objeto de interés |
| `distanceM` | Distancia de cableado al punto de concentración/NVR |

Ejemplo válido: C4, alcance lejano, identificación a 28 m y 42 m de cable.
El requisito de identificación no certifica capacidad por megapíxeles.

## 5. Requisitos nocturnos

Se guardan tres respuestas independientes: cumplir el objetivo de noche
(`yes/no/undefined`), iluminación (`none/permanent/motion/unknown`) y color
(`yes/no/undefined`). La ayuda se adapta al objetivo; iluminación y color se
muestran solamente cuando se requiere el objetivo nocturno. No se seleccionan
tecnologías/modelos comerciales ni se garantiza identificación nocturna.

## 6. Modo de grabación

`continuous`, `events` y `undefined` se presentan como **Continua**, **Solo ante
eventos** y **A definir**. Retención conserva el intervalo entero de 1–180 días.
No se agregan horarios ni franjas; su ausencia no bloquea el borrador.

## 7. Almacenamiento

Continua usa 24 h/día. Eventos usa las mismas 24 h como referencia conservadora,
sin porcentaje arbitrario de actividad; una nota explica que el consumo real
dependerá de la escena. A definir conserva las horas antiguas o 24 por defecto
y advierte que el cálculo es provisional, indicando el supuesto.

Se mantiene el modelo de bitrate por resolución, 15% de reserva y selección
de capacidades comunes hasta 20 TB. Resoluciones mixtas usan la mayor como
aproximación conservadora. La retención y capacidad no son una garantía exacta.
Cambios técnicos invalidan el resultado previo y el wizard recalcula al volver
al resultado; la descarga Excel queda vinculada a la estimación vigente.

## 8. Eventos, objetivos y acciones

- `detectionEvent`: sin detección, movimiento, cruce de línea, intrusión en zona
  o a definir.
- `detectionTarget`: cualquier objeto/movimiento, personas, vehículos, ambos
  o a definir.
- `eventActions`: aviso al celular y/o sirena externa; admite arreglo vacío.

Grabación continua puede coexistir con detección y avisos. Las opciones expresan
requisitos; no atribuyen IA o analítica a un equipo. Solicitar sirena externa
genera pendiente de integración con checklist de interfaz/relé, alimentación,
compatibilidad, materiales y configuración; no agrega una sirena a la BOM CCTV.

## 9. Persistencia completa

El frontend envía cámaras/defaults/requisitos a Pydantic y los guarda en el
documento de `projects` en MongoDB. El relevamiento completo se guarda en `survey`.
Se usan `POST /api/v1/projects`, `GET /api/v1/projects`,
`GET /api/v1/projects/{id}` y la actualización agregada
`PUT /api/v1/projects/{id}`. La recuperación normaliza y restaura el mismo wizard.

Se conservan las cámaras individualizadas y sus overrides, sin sustituirlos
por defaults al guardar/abrir. Defaults globales modificados actualizan cámaras
heredadas; las personalizadas retienen su configuración completa. La alarma
también se guarda cuando está desactivada, preservando sus ajustes para abrirla;
solamente su estimación/BOM se excluye mientras no está activa.

## 10. Compatibilidad con proyectos antiguos

Los campos nuevos ausentes usan `undefined`, `eventActions=[]` y
`nightLighting=unknown`, conforme al enum. No se inventan respuestas del cliente.
Proyectos agregados sin cámaras generan filas base a partir de los requisitos
anteriores. `viewingRange`, distancias y detalle individual existente se conservan.

Como la UI anterior aceptaba distancia al objetivo cero, la recuperación del
esquema legado la convierte en pendiente. La migración backend aplica a registros
anteriores sin `imageObjective`; los nuevos requests siguen rechazando cero.
Los snapshots antiguos se recalculan al recuperar para evitar mostrar una
estimación desactualizada.

## 11. Pendientes y errores

Respuestas todavía no definidas, distancia faltante para reconocer/identificar,
iluminación/color por verificar, evento faltante para grabación por eventos o
integración de sirena pendiente permiten guardar. El resumen muestra
**Pendientes técnicos / comerciales** solamente cuando corresponde.

Valores ingresados inválidos —distancia cero/negativa/no finita, retención
fraccionaria o fuera de límites, enums inválidos— se rechazan en UI/API y deben
corregirse. Se distingue una respuesta ausente de un dato inválido.

## 12. Excel

**Cámaras** incorpora objetivo de imagen, alcance, distancia al objetivo,
objetivo nocturno, iluminación, color, evento, objetivo del evento, acciones,
pendientes y recomendación preliminar de lente. **Resumen** muestra modo,
horas de referencia, advertencias y pendientes. Se conservan **Materiales** y
la hoja opcional **Alarma**.

El exportador consume el snapshot normalizado y la BOM/estimación actuales.
El endpoint reutiliza el helper de pendientes; no vuelve a dimensionar
almacenamiento, materiales u óptica.

## 13. «Medios de comunicación» en alarmas

La UI está en `frontend/components/alarm/AlarmConfigurator.tsx`, sección
**Sirenas y comunicación**. El tipo frontend está en `frontend/types/alarm.ts`:
`AlarmConfiguration.communications: AlarmCommunication[]`, con valores
`ethernet`, `wifi`, `lte`, `telephone`. El backend refleja el contrato en
`backend/app/models/alarm.py`.

Representa transportes de **comunicación remota del panel**. Sensores ↔ panel
usa `systemType`/`AlarmDeviceRequirement.connection`. App, push y monitoreo son
requisitos separados. El motor agrega 5 W conceptuales por comunicador y un
ítem correspondiente a la BOM, y genera advertencias de requisitos remotos
sin transporte, contradicción con solo local, cobertura LTE y redundancia IP+LTE.

El nombre resulta ambiguo porque no explicita tramo ni destino; tampoco define
proveedor, protocolo o integración real. Se inspeccionó y documentó sin cambiar
su comportamiento. Ver [detalle de archivos y usos](alarm-rules.md#revisión-del-campo-medios-de-comunicación).

## 14–16. Pruebas ejecutadas y resultados

| Verificación | Resultado de la ejecución disponible |
| --- | --- |
| Backend: `.venv/Scripts/python.exe -m pytest -q` desde `backend` | 81 pruebas exitosas; 2,51 s |
| Frontend: `npm test` desde `frontend` | 37 pruebas exitosas |
| Frontend: `npm run build` | Compilación final exitosa con Next.js 16.3.8, verificación de tipos y generación estática |
| Navegador: `node tests/cctv.browser.cjs`, escritorio y móvil | Flujo exitoso a 1280 px y 390 px, con API real y colección Mongo simulada en memoria |
| MongoDB real | No verificado con un servidor MongoDB local |

Las pruebas cubren campos visuales existentes, requisitos independientes por
cámara, distancias decimales y separación de cableado, noche, almacenamiento
24 h/supuesto provisional, eventos/targets/acciones, pendientes/errores,
herencia/overrides, legado, request real de estimación, proyectos y columnas Excel.
Los tests de proyecto usan las rutas y modelos reales con una colección Mongo
simulada en memoria. El harness de navegador usa API/motor/Excel reales con
esa misma clase de reemplazo de almacenamiento; no es una prueba contra MongoDB
real ni debe desplegarse como aplicación.

La prueba de navegador verificó creación, lista, lectura, actualización y
reapertura; preservación de defaults globales frente a agregados de cámaras
personalizadas; distancias, requisitos nocturnos, eventos/targets/acciones;
borradores pendientes y rechazo de cero; equivalencia de almacenamiento continua
y eventos a 24 h; descarga Excel real y sus columnas nuevas; recuperación de
proyecto legado sin respuestas inventadas. No encontró excepciones de consola
ni desbordamiento horizontal en los anchos verificados. Se utilizó
`CCTV_LEGACY_PROJECT_ID` para seleccionar el proyecto antiguo preparado por
el harness, además de las URLs de API/frontend.

También se revisaron enlaces locales de documentación (sin destinos faltantes)
y `git diff --check` para documentación.

## 17. Limitaciones actuales y futuro

No se implementan DORI completo, FOV exacto, cálculo óptico real, densidad de
píxeles ni capacidad de identificación por escena. La recomendación de lente
sigue siendo preliminar. Almacenamiento usa bitrates de referencia, sin codec,
FPS, bitrate real o actividad validada. La mezcla PoE/Wi-Fi mantiene la
aproximación agregada; faltan presupuesto PoE y compatibilidad reales.

No se agregan selección de modelos, marcas/SKU, proveedores, precios reales,
IA, horarios, nuevas reglas comerciales, integración de sirena/NVR/alarma ni
protocolos propietarios. Las preguntas registradas preparan esos trabajos
futuros. La persistencia requiere conexión con API y MongoDB.

## 18. Alcance de las afirmaciones de prueba

Los resultados corresponden a ejecuciones realizadas durante esta iteración,
con el alcance indicado. No se atribuyen pruebas con MongoDB real, despliegue
en Vercel ni prestaciones comerciales de cámaras.
