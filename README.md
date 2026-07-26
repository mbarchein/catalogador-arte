# Catalogador de arte

Aplicación web de inventario y catalogación razonada de la obra de **Alberto Rotili** y **María Ruiz Campins**.

Base de datos unificada para ambos fondos que sirve simultáneamente como:

- **inventario de trabajo** — toma de datos con la obra delante, reordenación física del estudio;
- **catálogo razonado** — investigación documental, procedencia, historial expositivo y bibliográfico;
- **origen de los productos derivados** — catálogo online y catálogo impreso generado vía LaTeX.

## Estado

En desarrollo. El entorno y el esqueleto de Django están resueltos; el siguiente paso es traducir las
nueve tablas del esquema de campos a modelos de Django. Ver la hoja de ruta en
[`docs/originales/diseno_interfaz_y_arquitectura_v4.md`](docs/originales/diseno_interfaz_y_arquitectura_v4.md),
sección 15.

## Stack

Django + PostgreSQL, servido por Gunicorn detrás de Apache como proxy inverso. Sin build de frontend:
plantillas de Django y una librería CSS ligera. Los ficheros subidos (imágenes de obra y documentos
digitalizados) viven dentro de la propia aplicación y se sirven únicamente a usuarios autenticados.

## Documentación

Toda la documentación del proyecto está en [`docs/`](docs/). Empezar por
[`docs/README.md`](docs/README.md), que explica qué documento es normativo para cada cosa.

## Convenciones de trabajo

Ver [`CLAUDE.md`](CLAUDE.md): idioma, estilo de commits, política de tests y estructura del repositorio.
