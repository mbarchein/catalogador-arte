# ADR-002 · Almacenamiento de imágenes y archivos

**Fecha:** 26 de julio de 2026
**Estado:** Aceptada
**Depende de:** [`ADR-001`](ADR-001-stack-y-despliegue.md)

---

## Contexto

El proyecto necesita alojar cientos de imágenes en alta calidad, y además los documentos digitalizados
de la tabla Archivo/Documentación (`archivo_digitalizado`: cartas, recortes de prensa, carteles,
normalmente PDF multipágina escaneado).

ADR-001 asumió que los másters en alta resolución se quedarían fuera de la aplicación, en el disco del
equipo. Se descarta esa premisa: los másters deben estar también en la nube.

### Dimensionado

Con el volumen previsto en el esquema —hasta unas 500 obras por fondo, 1000 en total, con 3 a 5 tomas
por obra— el archivo fotográfico ronda las 5000 tomas.

| Formato del máster | Por toma | 500 tomas | 2.000 tomas | 5.000 tomas |
|---|---|---|---|---|
| JPEG de cámara, calidad máxima (24 MP) | ~8 MB | 4 GB | 16 GB | 40 GB |
| RAW (24-45 MP) | ~35 MB | 18 GB | 70 GB | 175 GB |
| TIFF sin comprimir, 50 MP (estándar de archivo museístico) | ~150 MB | 75 GB | 300 GB | 750 GB |

**Ningún tramo gratuito cubre esto.** El más generoso entre los proveedores compatibles con S3 son los
10 GB permanentes de Cloudflare R2, que no llegan ni al escenario más modesto.

### Coste mensual real

| Volumen | Cloudflare R2 (0,015 $/GB) | Backblaze B2 (0,006 $/GB) | Hetzner Storage Box (1 TB fijo) |
|---|---|---|---|
| 40 GB | 0,45 $ | 0,18 $ | 3,81 $ |
| 175 GB | 2,48 $ | 0,99 $ | 3,81 $ |
| 750 GB | 11,10 $ | 4,44 $ | 3,81 $ |

La conclusión que ordena la decisión: el coste está entre 0 y 5 $ al mes. Perseguir el cero absoluto
para el archivo completo cuesta más en complejidad de la que ahorra. Lo que sí debe ser gratuito es lo
que la aplicación sirve a diario.

## Decisión

### Tres niveles por cada toma

| Nivel | Formato | Tamaño | Quién lo usa |
|---|---|---|---|
| **Miniatura** | WebP, borde largo 400 px | ~30 KB | Índice visual en mosaico |
| **Derivada de consulta** | WebP, borde largo 2000 px | ~300 KB | Ficha de obra, ficha imprimible |
| **Máster de archivo** | El original tal como salió de la cámara o del escáner | 8-150 MB | Nadie, en el uso diario. Descarga puntual bajo demanda |

Los niveles 1 y 2 para 5000 tomas suman en torno a 1,7 GB: **entran en el tramo gratuito de R2**. El
nivel 3 es el único que genera coste.

**Las derivadas se generan en el navegador antes de subir**, no en el servidor. Una foto de móvil son
4-12 MB; subir tres versiones ya reducidas desde el propio teléfono ahorra tiempo de subida en el
almacén, que es donde más escasea la conexión, y evita necesitar un proceso de servidor que en este
stack no existe.

### Proveedor

**Cloudflare R2 para los tres niveles**, en dos buckets separados: uno para derivadas y miniaturas y
otro para másters. Motivos: es la misma cuenta que aloja el frontend en Pages, luego una sola
credencial y un solo `provider` de Terraform; el egreso es cero sin condiciones; y es compatible con
S3, lo que mantiene abierta la puerta de salida.

**Umbral de revisión escrito:** si los másters superan los 100 GB —lo que ocurre en cuanto se adopte
RAW o TIFF como formato de archivo— se migra el bucket de másters a Backblaze B2, cuyo egreso hacia
Cloudflare es gratuito, o a un Storage Box de Hetzner si el uso es de archivo puro sin necesidad de API
S3. Las derivadas se quedan en R2 en cualquier caso.

Para que esa migración no sea una refactorización, **todo acceso a imágenes pasa por una única función
del frontend**, que resuelve la URL de cada nivel. Cambiar de proveedor debe ser cambiar esa función y
la variable de entorno del endpoint.

### Copias de seguridad de los másters

Los másters son el documento, no una copia de él. El esquema contempla `estado_existencia` con valores
*Destruida* y *Perdida (paradero desconocido)*: para esas obras la fotografía será la única prueba que
quede de que existieron, y no hay forma de volver a tomarla.

Se aplica la regla **3-2-1**: tres copias, en dos medios distintos, una de ellas fuera del lugar de
trabajo.

| Copia | Dónde | Cómo se mantiene |
|---|---|---|
| 1 | Disco de la máquina Ubuntu del equipo (500 GB disponibles) | Es donde se descargan las tarjetas de la cámara |
| 2 | Disco externo | Sincronización manual periódica, con la nomenclatura de fichero del esquema |
| 3 | Bucket de másters en R2 | Subida desde la aplicación |

Un bucket en la nube no cuenta como copia de seguridad por sí solo: un borrado por error se propaga.
El bucket de másters se configura con **versionado de objetos activado**, de modo que una sobrescritura
o un borrado accidental sean recuperables.

### Volcado de la base de datos

Independiente de las imágenes y con el mismo criterio: el tramo gratuito de Supabase no incluye copias
de seguridad. Un volcado periódico de PostgreSQL se guarda en el bucket de másters, donde ocupa una
fracción irrelevante del espacio. Sin esto, una pérdida de la base de datos deja miles de imágenes sin
ninguna ficha que las explique, es decir, deja de haber catálogo.

## Consecuencias

- La aplicación nunca sirve un máster en una vista: solo enlaces de descarga firmados, para quien
  necesite el archivo original (una imprenta, un comisario, una publicación).
- La subida desde el móvil produce **tres objetos por toma**, no uno. La tabla Imágenes debe poder
  representar los tres niveles sin duplicar filas: son tres derivaciones del mismo `id_imagen`, no tres
  imágenes distintas.
- El campo `archivo_digitalizado` de Archivo/Documentación sigue el mismo esquema de tres niveles, con
  la miniatura correspondiente a la primera página del PDF.
- El coste deja de ser cero. Es de céntimos al mes mientras el máster sea JPEG, y de unos pocos euros
  si se adopta un formato de archivo real. Conviene decidir el formato del máster antes de acumular
  volumen, porque reconvertir 5000 archivos a posteriori no recupera la información que el JPEG ya
  descartó.

## Decisión pendiente que esto abre

**Formato del máster.** No es una decisión de infraestructura sino de criterio archivístico, y afecta
al coste en un factor de veinte. JPEG de cámara a máxima calidad es suficiente para publicar en web y
para el catálogo impreso; TIFF es lo que pide un archivo destinado a durar. Debe decidirse antes de
empezar a fotografiar en serie, y conviene consultarlo con el asesor externo.
