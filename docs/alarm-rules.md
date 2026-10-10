# Alarma / Intrusión: reglas preliminares

El subsistema se expresa con `AlarmConfiguration`, opcional en el request
existente de estimación. `enabled=false` o ausencia de `alarm` conserva el
comportamiento de CCTV. El estado del wizard conserva cada subsistema separado;
se combinan al pedir el resultado. No se agregan pasos al relevamiento simple.

## Fuente de verdad

`backend/app/services/alarm_engine.py` contiene el único motor de alarma.
`POST /api/v1/quotes/alarm/estimate` expone una previsualización del mismo motor.
`POST /api/v1/quotes/estimate` integra su resultado y BOM con CCTV. El frontend
solamente organiza requerimientos, personalizaciones y etiquetas; no replica
dimensionamiento. El exportador consume la estimación actual sin recalcular.

## Revisión del campo «medios de comunicación»

Esta iteración CCTV solamente inspecciona este campo; no modifica el
comportamiento de alarmas.

- UI: `frontend/components/alarm/AlarmConfigurator.tsx`, en la sección
  **Sirenas y comunicación**, muestra **Medios de comunicación** y la opción
  **Sin comunicación remota**.
- Frontend: `frontend/types/alarm.ts` define
  `AlarmCommunication = "ethernet" | "wifi" | "lte" | "telephone"` y
  `AlarmConfiguration.communications: AlarmCommunication[]`.
- Etiquetas: `frontend/lib/alarm.ts`, `alarmCommunicationLabels`, muestra
  Ethernet/IP, Wi-Fi, LTE/4G y línea telefónica. El default es `[]`.
- Backend: `backend/app/models/alarm.py` define el mismo literal
  `AlarmCommunication` y `AlarmConfiguration.communications`; el validador
  elimina selecciones repetidas para no duplicar consumo ni materiales.
- Motor: `backend/app/services/alarm_engine.py`, `estimate_alarm_load`, agrega
  5 W conceptuales por comunicador. `build_alarm_bom` agrega un comunicador
  IP/Ethernet, IP/Wi-Fi, LTE/4G o telefónico por cada medio seleccionado.
  `get_alarm_warnings` advierte sobre app/notificaciones/monitoreo sin un medio,
  contradicción con `localOnly`, redundancia IP + LTE y revisión del enlace LTE.
- Presentación: `frontend/components/alarm/AlarmArchitecture.tsx` muestra las
  comunicaciones resueltas. `backend/app/services/excel_export.py` las incluye
  en **Resumen**, y su BOM en **Materiales**.

Por los valores y usos actuales, representa **medios de comunicación remota del
panel**. Ethernet/Wi-Fi pueden dar salida a una red IP; LTE y telefonía son otros
transportes. El modelo no concreta proveedor, central, protocolo ni destino.
No representa sensores ↔ panel: ese tramo usa `systemType` y
`AlarmDeviceRequirement.connection`. Tampoco especifica por sí solo el canal de
aviso al usuario o el contrato de monitoreo: `remoteAppRequired`,
`pushNotificationsRequired` y `professionalMonitoringRequired` son requisitos
independientes.

El nombre es **ambiguo fuera del contexto** porque no indica qué equipo se
comunica ni hacia dónde. Esta conclusión describe la implementación, no una
integración remota garantizada. Una futura revisión de UX podría aclarar el
tramo panel → red/servicio remoto sin mezclarlo con conexión de sensores o
acciones de eventos CCTV.

El campo `mode` indica configuración automática o personalizada. Los ajustes
explícitos se conservan al alternar modos; `panelMode` y `auxiliaryPowerMode`
indican qué selección se debe calcular o respetar manualmente. Los dispositivos
personalizados conservan su configuración cuando cambian las cantidades rápidas.
Las conexiones `auto` heredan el tipo de sistema; restablecer un dispositivo
recupera esa herencia. Para personalizar un integrante de un grupo de cantidad
mayor que uno, se puede separar una unidad.

## Zonas, panel y expansión

Cada unidad ocupa una zona por defecto. `requiresSeparateZone=false` agrupa
las unidades de una fila en una zona. Un `zoneGroup` explícito permite compartir
zona entre filas. Conexiones cableadas e inalámbricas en el mismo grupo mantienen
zonas distintas y generan advertencia. Compartir pánico, exteriores o detección
técnica genera recomendaciones de separación, sin eliminar el override.

`zonesWithReserve = ceil(zonesRequired × (1 + expansionReservePercent / 100))`.
Se recomienda la menor capacidad de 8, 16, 32 o 64 zonas que cubra la reserva.
Más de 64 zonas se presenta como superior / revisión manual, sin asumir un panel
de 64 como suficiente. El instalador puede seleccionar una capacidad manual.

Los expansores conceptuales son de ocho zonas:
`ceil(max(0, zonesWithReserve - selectedPanelZones) / 8)`.
Un panel automático suficiente no necesita expansores. Un panel manual menor
que las zonas requeridas genera advertencia aunque los expansores propuestos
cubran matemáticamente la diferencia: debe verificarse compatibilidad real.

## Cable y alimentación

El cable de alarma se estima sumando `cantidad × recorrido` de los sensores
**cableados**, con margen del 15%. El recorrido individual, si existe, reemplaza
al promedio general. Se exporta por separado del UTP de CCTV. Esta estimación no
incluye recorridos de teclados, sirenas o buses: requieren relevamiento posterior.

La tabla conceptual usa **watts**, no amperes de fabricante:

| Elemento | Carga de referencia |
| --- | ---: |
| Panel | 15 W |
| Teclado LCD / touch / inalámbrico | 3 / 5 / 2 W |
| PIR interior / exterior | 1 / 2 W |
| Barrera | 3 W |
| Rotura de vidrio, humo, inundación, otro | 1 W |
| Gas | 3 W |
| Contacto magnético, pulsador de pánico pasivos | 0 W |
| Sirena interior / exterior | 8 / 12 W |
| Cada medio de comunicación | 5 W |
| Expansor | 3 W |

Los sensores inalámbricos no suman carga al panel ni metros de cable. Los valores
son placeholders modificables. Se consideran las sirenas como carga sostenida;
la aproximación es conservadora y puede proponer baterías grandes.

`batteryWhRequired = estimatedLoadW × backupAutonomyHours × 1.20`.
`batteryAhApprox = batteryWhRequired / 12`, usando un banco conceptual de 12 V.
Se recomienda el menor tamaño de 7, 12, 18, 26 o 40 Ah que cubra la necesidad.
Por encima se exige revisión manual. Autonomía cero significa sin respaldo.
No se calculan curvas de descarga, envejecimiento, corriente de carga ni límites
reales del panel. Validar capacidad útil y gabinete con los equipos elegidos.

La fuente auxiliar automática se propone si la carga supera **36 W**, un umbral
conceptual, no una especificación de panel. El instalador puede forzar Sí / No;
desactivar con carga elevada mantiene una advertencia.

## BOM, exportación y advertencias

`build_alarm_bom` consume el resultado resuelto. Agrega panel, expansores,
teclados, sensores por tipo/conexión, sirenas, cada comunicador solicitado,
fuente si corresponde, batería, cable y gabinete/accesorios. Los precios siguen
en cero; no hay marcas ni catálogo. Los ítems nuevos incluyen unidad y
observaciones; el resultado anterior conserva sus campos cuando no hay alarma.

El Excel mantiene las tres hojas existentes y agrega **Alarma** cuando el
resultado tiene este subsistema. **Resumen** incluye la arquitectura propuesta;
**Materiales** exporta la BOM combinada con unidades. **Alarma** detalla cada
fila relevada, conexión resuelta, cantidad, asignación preliminar de zona y
advertencias. No se ejecuta otro motor dentro del exportador.

Las advertencias cubren capacidad/reserva, compatibilidad de expansores,
particiones, conexiones mezcladas, baterías inalámbricas, carga/fuente,
respaldo, comunicaciones y requisitos remotos, protección exterior, agrupación
manual, pánico, objetivos sin sensores asociados y detección técnica. IP + LTE
informa redundancia. Cada medio seleccionado agrega su comunicador, por lo que
LTE no puede quedar solicitado sin el ítem correspondiente en la BOM automática.

Los detectores técnicos de intrusión **no se consideran automáticamente un
sistema certificado de detección de incendio o gas**. No se implementan normas
de incendio, EOL/DEOL, radiofrecuencia, programación, monitoreo real ni apps.

La separación requerimiento → motor → resultado → BOM → exportación permite
incorporar futuros subsistemas con contratos propios, sin duplicar cálculo en
la UI. Esta iteración sigue requiriendo CCTV; no implementa proyectos de alarma
sin cámaras ni nuevos módulos.
