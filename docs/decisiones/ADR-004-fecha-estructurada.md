# ADR-004 · Fecha de ejecución estructurada

**Fecha:** 27 de julio de 2026
**Estado:** Aceptada
**Revisa:** RF-207; elimina `fecha_orden`

---

## Contexto

El esquema original definía `fecha_ejecucion` como texto libre («1978», «1975-1978», «c. 1980»,
«c. 1975-1978») con `fecha_orden` como número auxiliar para poder ordenar. Eso hacía imposible la
consulta que motiva un inventario: «obra de los setenta» no se puede preguntar contra un texto.
El equipo confirmó que el texto libre no era adecuado y pidió campos estructurados.

## Decisión

Cuatro columnas más una nota, y **el texto publicable lo compone la base de datos**:

| Columna | Significado |
|---|---|
| `anio_inicio`, `anio_fin` | El año, o el rango si `anio_fin` no es nulo |
| `fecha_aproximada` | «c.» — la obra es de alrededor de ese año |
| `fecha_sin_confirmar` | «[?]» — la fecha se desconoce; el año es una estimación |
| `fecha_nota` | Redacción libre cuando la estructura no alcanza («finales de los setenta») |
| `fecha_ejecucion` | **Columna generada**: la nota si existe; si no, la composición canónica |

Las dos banderas son independientes y se combinan (`c. 1975-1978 [?]`): hablan de cosas distintas
y el equipo confirmó mantenerlas como conmutadores separados.

Decisiones derivadas:

- **La columna generada no se puede escribir** — lo impide PostgreSQL, no una convención. Texto y
  estructura no tienen forma de divergir, y el catálogo impreso seguirá leyendo `fecha_ejecucion`
  como siempre.
- **La escritura a mano también estructura.** El campo manual de la interfaz analiza lo tecleado:
  un formato canónico (con las variantes reales de catálogo: «ca.», sin espacio, guion largo)
  rellena la estructura y no deja nota; solo lo imparseable se conserva como nota, y aun entonces
  se rescata el primer año plausible hacia `anio_inicio` para que la obra no desaparezca de las
  búsquedas por época.
- **La nota manda en la ficha.** «Finales de los setenta» dice algo que 1975-1979 no dice: si
  alguien lo escribió, eso es lo que se publica.
- **Restricciones en la base**: años plausibles (1000–2100), rango que avanza (`anio_fin >
  anio_inicio`), y banderas solo si hay año del que hablar.
- **`fecha_orden` desaparece**: era el apaño para ordenar texto libre. `anio_inicio` hace su
  trabajo siendo además un dato de verdad, con índice parcial para la consulta de época
  (solapamiento de rangos, no igualdad).

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| `int4range` nativo | Semánticamente más puro, pero los límites inclusivo/exclusivo despistan siempre, PostgREST lo expone como cadena `"[1975,1980)"`, y a esta escala el GiST no compra nada que dos `smallint` no den |
| Tabla de dataciones (una fila por propuesta, con fuente) | Es investigación, y ya tiene su sitio en `notas_criticas`. Una tabla puente para el 2 % de los casos complica el 98 % |
| Texto + columnas derivadas por *trigger* | Dos fuentes de verdad que mantener de acuerdo: lo peor de ambos mundos |
| Un eje de tres niveles (exacta/aproximada/sin confirmar) en vez de dos banderas | Se planteó porque ambas hablan de cuánto se sabe de la fecha; el equipo prefirió los dos conmutadores independientes, que además permiten la combinación |

## Interfaz

Por indicación del equipo: en modo rango, los dos años comparten línea (son un solo dato); las tres
banderas —Aproximada, Rango, Sin confirmar— comparten línea como botones compactos del mismo
lenguaje visual que el Sí/No/Sin revisar, con la explicación una sola vez debajo.

## Nota de despliegue

La migración incluye el relleno desde el texto existente (análisis de los formatos canónicos;
lo demás va íntegro a `fecha_nota`). En local se aplicó con base recreada porque los datos eran de
prueba; el relleno queda como el camino para cualquier entorno con datos reales.
