# Requisitos CCTV: relevamiento, persistencia y límites

## Implementado: alcance, objetivo y distancias

Se conservan `viewingRange` y `targetDistanceM`; se agrega `imageObjective`
como requisito independiente por cámara.

| Campo | Significado | Valores |
| --- | --- | --- |
| `viewingRange` | Alcance/cobertura deseada de la escena | `near`, `medium`, `far`, `mixed` |
| `imageObjective` | Detalle que necesita el cliente | `undefined`, `overview`, `recognize`, `identify` |
| `targetDistanceM` | Distancia aproximada cámara → persona/objeto de interés | Decimal positivo opcional |
| `distanceM` | Distancia de cableado al punto de concentración/NVR | Metros de cable; 0–500 |

Los objetivos visibles son **Sin definir**, **Vista general** («Ver qué ocurre
en el ambiente o sector»), **Reconocer** («Poder reconocer una persona conocida
o distinguir un objeto conocido») e **Identificar** («Obtener suficiente detalle
para identificar a una persona o distinguir características específicas»).

Ejemplo: C4 puede tener `viewingRange=far`, `imageObjective=identify` y
`targetDistanceM=28`, con un recorrido de cable `distanceM=42`. Ninguno de
estos campos sustituye a otro. Una escena lejana no atribuye identificación,
y una necesidad de identificación no certifica la capacidad de una cámara.

Reconocer/identificar muestra «Distancia aproximada hasta la persona u objeto».
Un valor ingresado debe ser finito y positivo; omitirlo genera un pendiente y
permite guardar. Vista general no fuerza esta pregunta. El valor de escena
no interviene en el cálculo de cable.

`getLensRecommendation`, en `frontend/lib/cameras.ts`, conserva las orientaciones
de 2.8–4 mm, 4–6 mm, 6–12 mm/varifocal o evaluación de una segunda cámara,
según alcance. El umbral de 20 m genera revisión, no un límite óptico. Alcance
mixto advierte que una única cámara puede no resolver cobertura y detalle.
La recomendación es preliminar y no demuestra cumplimiento del objetivo.

## Implementado: requisitos nocturnos separados

| Campo | Valores | Pregunta |
| --- | --- | --- |
| `nightObjectiveRequired` | `yes`, `no`, `undefined` | ¿Necesita cumplir este mismo objetivo de noche? |
| `nightLighting` | `none`, `permanent`, `motion`, `unknown` | Iluminación disponible de noche |
| `nightColorRequired` | `yes`, `no`, `undefined` | ¿Necesita imagen en color de noche? |

La ayuda se adapta al objetivo: por ejemplo, «¿También necesita poder identificar
de noche?». Solamente cuando `nightObjectiveRequired=yes` se muestran iluminación
y color. Iluminación ofrece **Sin iluminación**, **Iluminación permanente**,
**Iluminación que se enciende por movimiento** y **A verificar**. Color permite
**Sí**, **No, acepta blanco y negro** y **A definir**.

Los tres datos se guardan por separado. La falta de iluminación verificada o
de respuesta de color puede generar pendientes. No se infiere identificación
garantizada por color nocturno ni se eligen ColorVu, Full Color, IR, luz blanca
o un modelo comercial automáticamente.

## Implementado: grabación y retención

`recordingMode` es un requisito general con valores `continuous` (**Continua**),
`events` (**Solo ante eventos**) y `undefined` (**A definir**). La grabación
continua registra períodos sin eventos; por eventos registra cuando se produce
el evento configurado. `retention_days` conserva los días que se desea consultar
hacia atrás: un entero de 1 a 180.

Continua utiliza 24 h/día. Eventos utiliza las mismas 24 h como referencia
conservadora; el consumo real depende de actividad aún no modelada. A definir
utiliza el valor legado de `recording_hours_per_day` (24 por defecto) y presenta
el cálculo como provisional, indicando el supuesto. El formulario no solicita
horarios/franjas y su ausencia no bloquea guardar ni estimar. Ver fórmula y
límites de capacidades en [reglas CCTV](quote-rules.md).

## Implementado: eventos, objetivos y acciones

| Campo | Valores |
| --- | --- |
| `detectionEvent` | `none`, `motion`, `line_crossing`, `intrusion_zone`, `undefined` |
| `detectionTarget` | `any`, `person`, `vehicle`, `person_vehicle`, `undefined` |
| `eventActions` | Arreglo de `mobile_notification` y/o `external_siren`; puede estar vacío |

«Evento que necesita detectar» permite sin detección adicional, movimiento
dentro de la imagen, cruce de línea virtual, ingreso/permanencia en zona o a
definir. Movimiento es un cambio general en la escena; línea es un objeto que
cruza una línea virtual; zona es ingreso/permanencia en un área definida.

Con evento definido se pregunta «¿Qué debe generar el evento?»: cualquier
movimiento/objeto, personas, vehículos, ambos o a definir. También se pueden
seleccionar **Aviso al celular** y **Activación de una sirena externa**. Evento
`none`/`undefined` oculta estas preguntas. Para grabación por eventos, cada cámara
sin evento utilizable queda pendiente; el borrador sigue siendo guardable.

La grabación y las acciones son independientes. Por ejemplo, continua + cruce
de línea + personas + aviso al celular es válido. Resolución, marca genérica
o descripción no permiten asumir clasificación de personas/vehículos, IA ni
analítica avanzada. Los campos registran requisitos para selección futura.

`external_siren` agrega **Verificar integración de sirena externa** a pendientes;
no agrega una sirena genérica a la BOM CCTV ni modifica la configuración de
alarma. La revisión técnica comprende equipo que ejecutará la acción, salida o
interfaz, relé/contacto seco si aplica, alimentación, compatibilidad, materiales
y configuración. Puede depender de NVR, cámara, panel, relé o automatización;
no se impone una arquitectura ni se ejecuta una integración.

## Implementado: herencia y personalización

La configuración general crea los valores heredados. Una cámara con
`customized=false` sigue los defaults actuales; al guardar su personalización,
`customized=true` conserva una configuración individual completa. Cambiar
defaults globales actualiza cámaras heredadas y preserva cámaras personalizadas,
incluidos campos nuevos. La UI distingue ambas condiciones.

Restablecer una cámara es una acción explícita que recupera los defaults
actuales. Este es el patrón existente de personalización por cámara, no una
nueva arquitectura de overrides por campo. Al guardar o recuperar se conservan
los datos individuales; no se reemplazan con los defaults del proyecto.

## Implementado: pendientes, errores y resultado vigente

Un pendiente es una respuesta o revisión todavía no resuelta, por ejemplo:

- C3: definir distancia de identificación.
- C5: verificar iluminación nocturna.
- C7: definir evento para grabación por eventos.
- C8: verificar integración de sirena externa.

La sección **Pendientes técnicos / comerciales** aparece cuando hay pendientes;
no presenta una lista vacía. Se incluyen en resumen y Excel y permiten guardar
el borrador. No certifican la factibilidad técnica de lo solicitado.

Un error es un valor ingresado inválido: distancia al objetivo cero/negativa,
no finita, retención fraccionaria/fuera de 1–180, cantidad fuera de límites o
enum no admitido. La UI y Pydantic validan el contrato; estos valores deben
corregirse para avanzar/guardar. La ausencia de distancia requerida se trata
como pendiente, no como valor inválido.

Cambios de resolución, retención, grabación, cantidad, conectividad o cableado
requieren una estimación vigente. El wizard recalcula al llegar/volver al
resultado y actualiza el estado del proyecto. Los requisitos de imagen y noche
se conservan aun cuando todavía no cambian números. La exportación usa un
resultado actual y los requisitos correspondientes.

El estado de guardado compara el relevamiento actual con el snapshot guardado;
un cambio posterior no conserva un aviso que indique que el borrador actual ya
está guardado. Guardar nuevamente actualiza el documento del proyecto abierto.

## Implementado: flujo completo de proyectos

1. El formulario conserva el relevamiento `Survey`, requisitos generales,
   defaults y cada `CameraRequirement`.
2. La adaptación envía el contrato agregado existente y extiende `requirements`
   con `cameras`, `cameraDefaults` y `recordingMode`; incluye `alarm` cuando
   corresponde. Los campos visuales ya no quedan solamente en memoria local.
3. `POST /api/v1/quotes/estimate` valida con `CCTVRequirements` y devuelve la
   estimación; no guarda un proyecto por sí solo.
4. **Guardar borrador** crea mediante `POST /api/v1/projects` o actualiza un
   proyecto abierto mediante `PUT /api/v1/projects/{id}`. Incluye `customer_name`,
   `site_name`, `notes`, `requirements` y `survey` completo. MongoDB guarda la
   configuración individual, defaults, relevamiento y última estimación.
5. `GET /api/v1/projects` lista proyectos; `GET /api/v1/projects/{id}` recupera
   uno. La normalización conserva los valores persistidos y agrega únicamente
   defaults seguros de los campos nuevos ausentes.
6. El wizard restaura cliente/sitio, notas e infraestructura/extras del
   relevamiento, grabación, defaults, cámaras, personalizaciones y alarma.
   Los datos recuperados vuelven a ser editables en los mismos siete pasos.

Contratos principales: `frontend/types/quote.ts`, `frontend/lib/cameras.ts`,
`frontend/lib/api.ts`, `backend/app/models/quote.py` y
`backend/app/api/routes/projects.py`. La normalización y los pendientes backend
se comparten en `backend/app/services/cctv_requirements.py`; el resultado expone
`technical_pending` y `storage_hours_per_day` para transparentar el cálculo.
MongoDB usa `projects`, sin colección paralela para cámaras. Guardar/abrir
requiere API y MongoDB disponibles.

## Implementado: compatibilidad con proyectos anteriores

El endpoint de estimación sigue aceptando el esquema agregado anterior. Cuando
un proyecto no contiene detalle de cámaras, se reconstruye su configuración
base desde los campos agregados existentes; no se inventan respuestas a las
preguntas nuevas. Cuando contiene cámaras individuales, se conservan sus valores
y `customized`.

| Campo nuevo ausente | Default seguro |
| --- | --- |
| `imageObjective` | `undefined` — Sin definir |
| `nightObjectiveRequired` | `undefined` — A definir |
| `nightLighting` | `unknown` — A verificar |
| `nightColorRequired` | `undefined` — A definir |
| `detectionEvent` | `undefined` — A definir |
| `detectionTarget` | `undefined` — A definir |
| `eventActions` | `[]` |
| `recordingMode` | `undefined` — A definir |

`nightLighting` usa `unknown`, que es el valor desconocido permitido por su
enum; no admite la cadena `undefined`. `targetDistanceM` faltante queda ausente,
sin asignar cero ni una distancia estimada. Se conservan `viewingRange` y la
orientación de lente existente. Las horas antiguas son un supuesto provisional,
no una declaración retrospectiva de grabación continua.

La UI anterior aceptaba `targetDistanceM=0`. Al recuperar un registro legado,
ese cero se convierte en distancia pendiente, sin atribuir una distancia real:
la migración backend se aplica solamente a cámaras/defaults del esquema anterior
(sin `imageObjective`). Los requests nuevos mantienen validación estricta y
rechazan cero; la migración de lectura no permite guardar un valor inválido.
La apertura frontend también convierte el cero antiguo en ausencia de distancia.

La configuración de alarma se conserva en el proyecto incluso cuando está
desactivada. Su desactivación excluye el dimensionamiento/BOM de alarma, sin
eliminar los requisitos y personalizaciones guardados al recuperar el proyecto.

## Implementado: detalle de cámaras y Excel

El detalle final usa cards para preservar lectura en móvil y muestra nombre,
ubicación, ambiente, resolución, conexión, cableado, alcance, objetivo, distancia
al objetivo, requisitos nocturnos/iluminación/color, evento, objetivo del evento,
acciones, recomendación de lente y notas.

`frontend/lib/exports.ts` prepara un snapshot normalizado con la estimación
vigente, requisitos, cámaras, recomendación preliminar y pendientes.
`backend/app/models/export.py` valida el request y
`backend/app/services/excel_export.py` escribe **Cámaras** con columnas de objetivo
de imagen, alcance visual, distancia al objetivo, objetivo nocturno, iluminación,
color, evento, objetivo del evento, acciones, pendientes y lente. **Resumen**
incluye modo y supuestos de grabación. El exportador consume datos normalizados
y resultado existente, sin duplicar dimensionamiento.

## Revisión de alarmas: significado actual

«Medios de comunicación» corresponde a `AlarmConfiguration.communications`,
un arreglo de Ethernet/IP, Wi-Fi, LTE/4G y línea telefónica para comunicación
remota del panel. El enlace de sensores al panel está modelado por
`systemType`/`device.connection`. App, notificaciones y monitoreo son requisitos
separados. El nombre puede resultar ambiguo porque no explicita el tramo ni
destino. Ver [archivos, tipos y usos exactos en alarmas](alarm-rules.md#revisión-del-campo-medios-de-comunicación).
Esta iteración no cambia su comportamiento.

## Futuro y limitaciones

Se registran requisitos para futuros DORI, FOV, densidad de píxeles, lente,
sensor, altura y geometría, sin implementar esos cálculos. Faltan equipos reales,
clasificación/analíticas verificadas, compatibilidad nocturna y de alarmas,
integración de sirena, protocolos y actividad de grabación validada. No se
agregan proveedores, precios reales, marcas, SKU, IA ni horarios. La capacidad
del placeholder y la retención aproximada no son una garantía técnica.
