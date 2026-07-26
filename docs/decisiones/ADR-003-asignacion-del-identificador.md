# ADR-003 · Asignación del identificador de catalogación

**Fecha:** 26 de julio de 2026
**Estado:** Aceptada
**Resuelve:** DP-01 y, parcialmente, DP-02

---

## Contexto

`id_catalogacion` es el dato más delicado del esquema: clave primaria, etiqueta
física pegada a la obra real y eje de todas las tablas relacionadas. Ningún
documento original decía quién lo asigna.

Lo que forzó la decisión fue el flujo de captura rápida (RF-1204). Teclear
`AR-0247` de pie, con una mano y con la obra delante es exactamente el gesto que
produce los duplicados que el esquema ya anticipaba como previsibles.

## Decisión

**Lo asigna la base de datos**, mediante un *trigger* `before insert`. El cliente
omite el campo y recibe de vuelta el número asignado.

```
AR-0001, AR-0002…   fondo Alberto Rotili
RC-0001, RC-0002…   fondo María Ruiz Campins
```

Cuatro garantías que solo se pueden dar desde la base:

1. **Serialización por fondo.** Un `pg_advisory_xact_lock` sobre el prefijo
   impide que dos catalogadores dando de alta a la vez obtengan el mismo número.
   El cerrojo vive en la misma transacción que el `insert`, así que no hay
   ventana entre reservar y usar.
2. **Ningún número retirado se recicla.** El contador cuenta también las fichas
   dadas de baja, porque la baja es lógica y la fila permanece. Así, una etiqueta
   física antigua nunca acaba señalando a una obra distinta. Reutilizar un número
   sigue siendo posible, pero solo como acto deliberado: restaurar la ficha desde
   la papelera (RF-908).
3. **El prefijo no puede contradecir al fondo.** Una restricción `check` lo
   impide. Sin ella, una `AR-0001` atribuida a Ruiz Campins sería una fila válida
   y una etiqueta mintiendo sobre la obra que lleva pegada.
4. **El fondo es inmutable**, igual que la clave. Cambiarlo dejaría el prefijo
   desalineado con el contenido.

Se admite **indicar el identificador explícitamente**, y entonces el *trigger* lo
respeta. Cubre dos casos reales: recuperar la numeración de un inventario
anterior y corregir una carga de datos.

La interfaz muestra una **previsualización** («se guardará como AR-0248») mediante
una función de solo lectura. No reserva el número, y la interfaz lo advierte: el
definitivo es el que devuelve el guardado.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| **Teclearlo el catalogador** | Es el origen previsible de los duplicados, y en un formulario de móvil a una mano el riesgo se multiplica |
| **Generarlo en el cliente** consultando el máximo | Hay una ventana entre consultar y guardar. Con dos personas catalogando en paralelo, el choque no es hipotético: es cuestión de tiempo |
| **Secuencia de PostgreSQL por fondo** | Más simple, pero una secuencia avanza aunque la transacción se deshaga, dejando huecos en la numeración. En un catálogo razonado un salto sin explicar obliga a justificarlo por escrito para siempre |

El descarte de la secuencia es el menos obvio y merece precisión: los huecos no
son un problema técnico, son un problema editorial. Que falte `AR-0107` en un
catálogo publicado es una pregunta que alguien hará dentro de veinte años.

## Consecuencias

- El cliente **no puede** funcionar sin conexión para dar de alta, porque el
  número lo pone el servidor. Coincide con RF-1203, que ya lo excluía por otro
  motivo, así que no añade limitación.
- La numeración es densa y sin huecos mientras no haya bajas.
- `id_imagen` (DP-02) puede seguir el mismo patrón cuando llegue la tabla de
  imágenes, con el `id_catalogacion` como prefijo.

## Cabo suelto conocido

El *trigger* calcula el siguiente número con un `max()` sobre las filas del
fondo. Con el volumen previsto —unos cientos de obras por fondo— el coste es
irrelevante, y el índice de la clave primaria lo resuelve. Si algún día el fondo
creciera en un orden de magnitud, convendría una tabla de contadores; no antes,
porque añadir una tabla para optimizar algo que no duele es empeorar el esquema.
