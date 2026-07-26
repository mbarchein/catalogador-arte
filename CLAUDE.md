# Convenciones del proyecto

## Idioma

- **Documentación, comentarios y mensajes de commit:** español.
- **Identificadores de código:** español, siguiendo los nombres del esquema de campos
  (`id_catalogacion`, `titulo_atribuido`, `estado_conservacion`...). El esquema es el vocabulario
  del dominio y no se traduce: un modelo se llama `Obra`, no `Work`.
- **Textos de interfaz:** español de España (`LANGUAGE_CODE = 'es-es'`, `TIME_ZONE = 'Europe/Madrid'`).

## Commits

- **Un commit por unidad funcional independiente.** Si un cambio se puede revertir por separado sin
  romper nada, va en su propio commit. No agrupar «modelos + vistas + tests de tres entidades» en uno.
- Formato [Conventional Commits](https://www.conventionalcommits.org/) con asunto en español,
  en imperativo y sin punto final:
  `feat: modelo de Obra con clave de catalogación`, `docs: especificación de requisitos`,
  `test: cobertura del bloqueo de edición`, `fix: cascada de baja lógica en imágenes`.
- Tipos en uso: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- **Los mensajes de commit no mencionan Claude, Anthropic ni ninguna herramienta de IA.** Sin trailer
  `Co-Authored-By`, sin «Generated with». El historial se lee como trabajo propio.
- **Identidad de autor:** `mariobarchein@gmail.com`. Configurada en local en este repositorio
  (`git config --local user.email`), lo que prevalece sobre la identidad global de la máquina.
  Nunca firmar con la cuenta corporativa.

## Tests

- **Todo código lleva tests.** Ningún modelo, vista, regla de permisos o utilidad se da por terminado
  sin cobertura. Un commit `feat:` va acompañado de sus tests, en el mismo commit o en un `test:`
  inmediatamente posterior.
- Los tests **citan el requisito que verifican** por su identificador (`RF-402`, `RNF-105`), en el
  docstring o en el nombre del método. El plan de pruebas
  ([`docs/plan-de-pruebas.md`](docs/plan-de-pruebas.md)) mantiene la correspondencia entre requisitos
  y tests, y sirve para detectar requisitos sin verificar.
- Prioridad de cobertura, por orden: reglas de negocio con consecuencia sobre los datos (baja lógica y
  su cascada, bloqueo de edición, campos calculados, inmutabilidad de claves primarias) → permisos por
  rol → validación de formularios → renderizado de vistas.
- Toda incidencia corregida deja antes un test que la reproduce.

## Estructura del repositorio

```
docs/               Documentación del proyecto (ver docs/README.md)
  originales/       Documentos fuente, copiados sin modificar
  disenos/          Maquetas de interfaz
  revision/         Incidencias detectadas sobre los documentos fuente
```

La estructura de la aplicación Django se añadirá a este apartado cuando exista.

## Criterios de diseño heredados de los documentos fuente

Reglas que ya están decididas y no conviene reabrir sin motivo:

- **Nunca una página en blanco.** Una búsqueda sin resultados devuelve la misma página con el mensaje
  «No se han encontrado obras con estos criterios», nunca un listado vacío sin explicación. Lo mismo
  con los bloques de una ficha: «Sin referencias registradas» antes que un hueco.
- **Nunca un borrado real.** Toda eliminación es baja lógica con traza de quién y cuándo.
- **Las claves primarias no se editan** una vez creada la ficha: son el eje de las tablas relacionadas
  y, en el caso de `id_catalogacion`, la etiqueta física pegada en la obra real.
- **«Sin revisar» no es «no».** Distinguir siempre el dato pendiente de investigar del dato investigado
  sin resultado (`N/D`) y del dato dudoso (`[?]`).
