# Catalogador de arte

Aplicación web de inventario y catalogación razonada de la obra de **Alberto Rotili** y **María Ruiz Campins**.

Base de datos unificada para ambos fondos que sirve simultáneamente como:

- **inventario de trabajo** — toma de datos con la obra delante, reordenación física del estudio;
- **catálogo razonado** — investigación documental, procedencia, historial expositivo y bibliográfico;
- **origen de los productos derivados** — catálogo online y catálogo impreso generado vía LaTeX.

## Estado

En desarrollo. La infraestructura está definida como código y verificada; el siguiente paso es el
esquema de la base de datos en SQL, y detrás las políticas RLS con sus tests. Ver el orden de
construcción en [`docs/requisitos.md`](docs/requisitos.md), apartado 7.

## Stack

PWA estática sobre **Supabase** (PostgreSQL gestionado, PostgREST, Auth y Storage), sin servidor de
aplicación propio. Frontend en Vite, Svelte y TypeScript, alojado en Cloudflare Pages. Imágenes en
Cloudflare R2 en tres niveles: miniatura, derivada de consulta y máster de archivo. Toda la plataforma
se gestiona con Terraform en [`infra/`](infra/).

La aplicación es instalable en el móvil, que es el dispositivo del caso de uso principal: catalogar de
pie, con la obra delante. No funciona sin conexión, por decisión explícita.

El razonamiento completo, con las alternativas descartadas, está en
[`docs/decisiones/`](docs/decisiones/). El stack anterior era Django; los documentos originales todavía
lo describen y se conservan tal cual.

> **Aviso de seguridad para quien vaya a tocar el esquema:** al no haber backend, las políticas RLS son
> el único perímetro que protege los datos. Una tabla nueva sin sus políticas es una tabla pública.

## Documentación

Toda la documentación del proyecto está en [`docs/`](docs/). Empezar por
[`docs/README.md`](docs/README.md), que explica qué documento es normativo para cada cosa.

## Convenciones de trabajo

Ver [`CLAUDE.md`](CLAUDE.md): idioma, estilo de commits, política de tests y estructura del repositorio.
