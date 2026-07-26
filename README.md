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

## Arranque local

Requiere Docker y `make`. No hace falta instalar Node, Python ni la CLI de Supabase: el stack completo
—Postgres, autenticación, API y frontend— corre en contenedores.

```bash
make up          # levanta todo y crea los usuarios de prueba
make verificar   # infraestructura, tipos, tests de SQL y de frontend
make help        # el resto de comandos
```

Después, http://localhost:5173 con cualquiera de estas cuentas (contraseña `password123`):

| Cuenta | Rol | Qué puede hacer |
|---|---|---|
| `admin@local.test` | Superusuario | Todo |
| `catalogador@local.test` | Catalogador | Crear y editar obra |
| `lector@local.test` | Lector | Solo consultar |

Para probar en el móvil, que es el dispositivo del caso de uso principal, `make movil` explica los dos
pasos. Merece la pena hacerlo pronto: catalogar de pie con una mano se juzga mal desde un escritorio.

## Qué hay construido

Primera entrega: **captura básica de obra**. La tabla Obras con los campos de fase 1 —los que se
rellenan con la pieza delante—, autenticación con tres roles, listado con búsqueda, captura rápida
pensada para el móvil y ficha editable.

Faltan las ocho tablas restantes del esquema (Imágenes, Series, Exposiciones, Bibliografía, las dos
tablas puente, Propietarios/Instituciones y Archivo/Documentación) y, con ellas, la subida de imágenes,
la papelera, el bloqueo de edición y la ficha imprimible con QR.

## Documentación

Toda la documentación del proyecto está en [`docs/`](docs/). Empezar por
[`docs/README.md`](docs/README.md), que explica qué documento es normativo para cada cosa.

## Convenciones de trabajo

Ver [`CLAUDE.md`](CLAUDE.md): idioma, estilo de commits, política de tests y estructura del repositorio.

## Licencia

El **código** de este repositorio es libre, bajo la [licencia MIT](LICENSE).

La licencia **no cubre las obras del catálogo**: las imágenes y los textos sobre la obra de Alberto
Rotili y María Ruiz Campins son propiedad de sus titulares de derechos y no forman parte del
software. Este repositorio público contiene el código de la herramienta; el contenido del catálogo
vive en la base de datos y el almacenamiento de la aplicación, que exigen autenticación.
