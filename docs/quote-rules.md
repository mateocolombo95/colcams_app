# Reglas CCTV de dimensionamiento preliminar

Los valores son referencias del MVP. Requieren validación con productos reales;
no certifican prestaciones ni garantizan retención exacta. Los requisitos que
todavía no intervienen en el cálculo se describen en
[requisitos CCTV](cctv-requirements.md).

## Implementado: NVR

Se elige la menor capacidad conceptual que cubre la cantidad de cámaras:

| Cámaras | Canales |
| --- | ---: |
| 1–4 | 4 |
| 5–8 | 8 |
| 9–16 | 16 |
| 17–32 | 32 |
| 33–64 | 64 y advertencia de revisión manual |

No se validan ancho de banda de entrada, bahías, compatibilidad o capacidad de
analíticas de un NVR comercial.

## Implementado: almacenamiento

El bitrate de referencia se mantiene por resolución:

| Resolución | Bitrate aproximado |
| --- | ---: |
| 2 MP | 2 Mbps |
| 4 MP | 4 Mbps |
| 5 MP | 5 Mbps |
| 8 MP | 8 Mbps |

```text
TB = bitrate_Mbps × cámaras × retention_days × horas_referencia × 3600
     / 8 / 1.000.000 × 1,15
```

`recordingMode` determina las horas de referencia:

- `continuous`: 24 h/día.
- `events`: 24 h/día como referencia conservadora. No se aplica un porcentaje
  inventado de actividad. El resultado informa: «El almacenamiento se estimó
  con grabación continua como referencia. El consumo real con grabación por
  eventos dependerá de la actividad de la escena».
- `undefined`: cálculo provisional con `recording_hours_per_day`, conservado
  para compatibilidad (24 por defecto). El motor informa el supuesto utilizado.
  No se solicitan horarios ni franjas en el formulario actual.

`retention_days` admite enteros de 1 a 180. El motor aplica 15% de reserva y
selecciona la siguiente capacidad conceptual de 1, 2, 4, 6, 8, 10, 12, 16 o
20 TB. Por encima de 20 TB advierte que requiere diseño multidisco/bahías; el
placeholder de 20 TB no implica que cubra la capacidad requerida.

Con resoluciones diferentes, la adaptación existente usa la mayor para todo
el conjunto e informa la aproximación conservadora. No suma bitrates reales
individuales. Falta considerar codec, FPS, VBR/CBR, calidad, complejidad de escena,
audio, metadatos, capacidad útil, redundancia y límites del NVR.

## Implementado: cable y PoE

```text
Cable estimado = cantidad de cámaras × distancia promedio × 1,15
```

`distanceM` es cableado; `targetDistanceM` describe la escena y no agrega metros
de cable. Las cámaras personalizadas aportan distancias individuales para el
promedio de las cámaras PoE. El motor agregado conserva su aproximación sobre
la cantidad total. Una mezcla PoE/Wi-Fi genera advertencia: todavía no se
dimensiona con precisión por cámara. Wi-Fi puro no suma cable de red ni puertos PoE.

Se estima un puerto por cámara cuando el agregado requiere PoE; el switch se
redondea a capacidades de 4, 8, 16, 24 o 48 puertos. La capacidad máxima conceptual
puede requerir revisión cuando el proyecto supera 48 puertos. No se calculan
watts, PoE+/PoE++, uplinks, SFP, agrupaciones ni redundancia.

## Implementado: comercial

```text
Precio de venta = costo total / (1 − margen / 100)
```

El margen es **margen bruto**, no markup. Con costo 100 y margen 35%, el precio
es 153,85. El costo usa importes manuales de extras y mano de obra. Los precios
de equipos de la BOM siguen siendo placeholders: no hay proveedores ni precios
reales incorporados por esta iteración.

## Futuro

Cálculo por cámara con parámetros reales; actividad de eventos validada;
compatibilidad y canales/bahías reales del NVR; recorridos sobre plano;
consumo y presupuesto PoE; catálogo y precios. DORI, FOV, lente, sensor, altura
y geometría utilizarán los requisitos registrados, sin deducir identificación
únicamente de megapíxeles.
