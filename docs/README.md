# Documentación del proyecto

## Qué leer según lo que necesites

| Si quieres… | Lee |
|---|---|
| Saber qué debe hacer la aplicación, con requisitos identificados y verificables | [`requisitos.md`](requisitos.md) |
| Saber qué datos se guardan, campo a campo | [`originales/esquema_campos_inventario_v11.md`](originales/esquema_campos_inventario_v11.md) |
| Entender por qué el modelo de datos es como es | El historial de cambios al final de ese mismo documento |
| Saber con qué se construye y dónde se despliega, y por qué | [`decisiones/`](decisiones/) |
| Entender el diseño de interfaz, las páginas y el comportamiento | [`originales/diseno_interfaz_y_arquitectura_v4.md`](originales/diseno_interfaz_y_arquitectura_v4.md) — con las decisiones de stack ya sustituidas por los ADR |
| Ver cómo debe quedar la ficha de obra | [`disenos/`](disenos/) |
| Saber qué está mal o sin decidir en los documentos anteriores | [`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md) |
| Saber qué está verificado con tests y qué no | [`plan-de-pruebas.md`](plan-de-pruebas.md) |

## Jerarquía documental

Los dos documentos de [`originales/`](originales/) son la **fuente**: se conservan sin modificar, con su
historial de versiones intacto, porque su valor está tanto en las decisiones que registran como en el
razonamiento que las llevó hasta ahí, incluidas las marchas atrás. Sus decisiones de **stack** están
sustituidas: describen una aplicación Django que no se ha construido.

Los documentos de [`decisiones/`](decisiones/) son **normativos y prevalecen sobre los originales**.
Cada uno registra una decisión de arquitectura con su contexto, las alternativas descartadas y sus
consecuencias, incluidas las malas.

[`requisitos.md`](requisitos.md) es el documento **operativo**: reformula esas decisiones como
requisitos numerados, resuelve las contradicciones entre los originales y es lo que citan los tests.
Ante una discrepancia entre los originales y los requisitos, manda el documento de requisitos, y la
discrepancia debe estar explicada en
[`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md).

Las maquetas de [`disenos/`](disenos/) son **indicativas**: ante una discrepancia entre una maqueta y el
esquema de campos, manda el esquema.

## Cómo se mantiene

- Los originales no se editan. Si una decisión cambia, se refleja en `requisitos.md` y se anota la
  divergencia en `revision/incidencias-detectadas.md`.
- Cada requisito nuevo estrena identificador, sin reutilizar los de requisitos retirados: los tests los
  citan y un identificador reciclado apunta a lo que no debe.
- Toda decisión pendiente resuelta pasa del apartado 9 de `requisitos.md` a un requisito con
  identificador propio.
