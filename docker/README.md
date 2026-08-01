# El stack local

Todo lo que en producción son servicios de terceros corre aquí en contenedores, con **el mismo software
que en la nube** siempre que se puede: `storage-api` es el contenedor que ejecuta Supabase, GoTrue y
PostgREST son los suyos, y la función de firmas corre en el mismo Deno. Lo que cambia son las URL y las
credenciales, no la lógica — por eso la aplicación no distingue un entorno de otro.

```
make up      levanta todo y siembra las cuentas de prueba
make ps      qué hay corriendo
make logs    registros de todos los servicios
make clean   lo detiene y borra los volúmenes, base incluida
```

## Dónde acaban las fotografías

Es la parte menos evidente, porque en producción viven en **dos sitios distintos**: la decisión y su
motivo están en [ADR-002](../docs/decisiones/ADR-002-almacenamiento-de-imagenes.md), y en resumen es que
de cada toma se guardan tres niveles —miniatura de 400 px, derivada de pantalla y máster de cámara de
8 a 35 MB— y lo que la aplicación sirve a diario tiene que ser gratis, mientras que el archivo completo
no cabe en ningún tramo gratuito.

| | Producción | En local | Dónde acaba el fichero |
|---|---|---|---|
| Miniatura y derivada (`_min.webp`, `_der.webp`) | Supabase Storage, bucket privado `obras` | Contenedor `storage` (`supabase/storage-api`), backend de fichero | Volumen `storage_data`, en `/var/lib/storage/stub/stub/obras/<ruta>/<uuid>` |
| Máster (`_master.<ext>`) | Backblaze B2, bucket privado `…-masters-…` | Contenedor `minio`, que habla la misma API S3 | Volumen `minio_data`, bucket `masters-local` |
| Las rutas de los tres | Columnas `thumbnail_path`, `derivative_path` y `master_path` de `public.images` | Igual, en el Postgres local | Volumen `db_data` |

### Y cómo llega cada uno

**Las derivadas** viajan por el cliente de Supabase (`supabase.storage.from('obras')`), que apunta a
`VITE_SUPABASE_URL` — en local, la pasarela nginx del puerto 8321. `storage-api` guarda el fichero en su
volumen **y escribe su fila en `storage.objects`**: es él quien lleva el registro. Un fichero que
aparece en el volumen sin su fila no existe para nadie, y de ahí que `make db-load` suba las fotografías
por la API en vez de copiarlas al volumen.

**Los másters** no pasan por ningún servidor propio. El navegador pide una firma a la función Edge
`sign-file` y hace el `PUT` **directo** contra el almacén; para descargarlo, lo mismo. La misma función
en local y en la nube, con otras variables:

| | Producción | Local |
|---|---|---|
| `S3_ENDPOINT` | `https://s3.<región>.backblazeb2.com` | `http://<DEV_HOST>:9100` |
| `S3_BUCKET_MASTERS` | el bucket de B2 | `masters-local` |
| `S3_KEY_ID` / `S3_KEY_SECRET` | clave de Terraform, con escritura | `minio-local` / `minio-local-secreto` |

El *endpoint* local es la IP de la máquina y no `minio:9000` a propósito: **la firma cubre el
anfitrión**, y quien la usa es el navegador del móvil, que no resuelve nombres internos de Docker.

Aquí no hay registro de ninguna clase: el único índice de los másters es la columna `master_path` de la
base. Por eso `db-load` los vuelca a minio con la CLI de AWS a pelo, mientras que las derivadas van por
la API. La asimetría no es un descuido; es la diferencia entre un almacén con catálogo y uno sin él.

### Consecuencias al traer una copia de producción

- `FOTOS=1 make db-clone` llena el lado de Supabase: baja el bucket `obras` y lo sube por la API, que
  crea las filas de `storage.objects`.
- `FOTOS=todo` llena además minio con los másters.
- Sin `FOTOS`, las filas de `images` están pero los ficheros no: la ficha se ve, la galería no.
- **Borrar un fichero por la API es imposible**, y está bien que lo sea: no hay política de DELETE sobre
  `storage.objects` (RF-901, nada se borra de verdad). Limpiar en local exige borrar la fila y el
  fichero por separado.

## Privilegios que la nube da y la imagen no

`migrate.sh` concede al final unos permisos sobre el esquema `storage` que en producción pone la
plataforma y la imagen de self-host no trae. Sin ellos, `storage-api` no puede ni leer la fila del
bucket, y responde a cualquier subida con «new row violates row-level security policy» — un mensaje que
manda a revisar unas políticas que están bien. Se conceden en el arranque local y no en una migración
porque en la nube ya están.
