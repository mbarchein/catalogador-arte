# ADR-005 · Frontend en Vercel, repositorio público y vistas en vivo

**Fecha:** 27 de julio de 2026
**Estado:** Aceptada
**Enmienda:** ADR-001 (alojamiento del frontend) y ADR-002 (almacenamiento de ficheros)

---

## 1. El frontend deja Cloudflare Pages por Vercel

Los bloqueos de IPs que LaLiga ejecuta en España durante los partidos hacen inviable servir la
aplicación desde Cloudflare: entre enero y junio de 2026, [554.507 dominios afectados, con
Cloudflare concentrando el 90,4 %](https://revistacloud.com/los-bloqueos-de-laliga-golpean-la-infraestructura-compartida-de-internet-en-espana)
del daño. Una aplicación cuyo caso de uso es catalogar en fin de semana no puede caerse cada
jornada de liga.

**Se elige Vercel** por el mismo criterio que React en ADR-001: es lo que el equipo ya tiene
probado **desde España** con la otra aplicación (ensayadero), y su Terraform y su job de despliegue
existen escritos y rodados en producción. [Vercel también ha sido alcanzado puntualmente por los
bloqueos](https://www.genbeta.com/actualidad/bloqueos-laliga-no-afectan-solo-a-cloudflare-ultimo-proveedor-caer-ha-sido-vercel-fuera-dias-partido)
— ningún alojamiento compartido es inmune al método — pero el orden de magnitud no es comparable, y
la experiencia de primera mano pesa más que cualquier comparativa.

Condición del plan Hobby: **estrictamente no comercial**. Un catálogo familiar sin monetizar encaja;
si el proyecto cambiara de naturaleza, esta decisión se revisa.

Descartadas: GitHub Pages (viable al ser el repo público, pero sin experiencia previa del equipo y
con el apaño del 404.html para las rutas de la SPA), Netlify (equivalente, provider nuevo que
aprender sin ganancia), Firebase (cuarto proveedor sin ventaja).

### Enmienda a ADR-002: los ficheros viven en Supabase Storage

Al retirar Cloudflare afloró que ADR-002 y la implementación ya divergían: **las imágenes viven en
Supabase Storage desde la primera entrega**, con URL firmadas, y los buckets R2 de Terraform estaban
sin uso. Se consolida lo real: derivadas y miniaturas en Supabase Storage; másters y volcados irán a
**Backblaze B2** cuando toquen (mismo umbral de ADR-002). El único uso de Cloudflare que permanece
es el bucket del estado de Terraform (`bootstrap/`): es tráfico de operador, no de usuarios, y un
`apply` que tropiece con un bloqueo se reintenta.

## 2. El repositorio pasa a ser público

Decisión del equipo. No cambia el modelo de seguridad porque nada del árbol era secreto: la clave
anónima es pública por diseño, las claves JWT del stack local son las de demostración bien conocidas
de Supabase, y el perímetro son las políticas RLS. Los secretos reales viven en Actions y en el
estado remoto de Terraform.

**Pendiente que esto abre (DP-10): la licencia.** Un repositorio público sin fichero de licencia es
«todos los derechos reservados» — publicado pero no reutilizable. Elegirla es decisión del equipo
(el código es una cosa; las imágenes y textos del catálogo, otra muy distinta, y conviene dejarlo
escrito).

## 3. Vistas en vivo por WebSocket

Requisito nuevo del equipo: algunas vistas se actualizan «en caliente». Se implementa con **Supabase
Realtime** — los WebSockets van contra Supabase, no contra el alojamiento estático, así que esta
decisión es independiente de la de Vercel.

- **Publicación**: solo `obras` e `imagenes`, las tablas que la interfaz observa. Publicar de más es
  trabajo de descodificación WAL por cada suscriptor.
- **RLS se respeta también aquí**: Realtime evalúa la política de SELECT del suscriptor antes de
  entregarle una fila. Un Lector no recibe por el canal lo que no podría consultar.
- **El evento dispara una recarga, no trae la verdad**: reconstruir el estado desde el payload es la
  fuente clásica de vistas desincronizadas. La recarga usa la consulta de siempre, políticas
  incluidas.
- **En edición no se refresca**: pisar un formulario a medio rellenar con datos ajenos destruye
  trabajo. El conflicto de edición concurrente es asunto del bloqueo de edición (RF-700), pendiente.
- El stack local corre el mismo servicio de Realtime que la nube, con la alineación del secreto del
  tenant documentada en `docker/seed-users.sh`.

En vivo quedan: el listado (altas y cambios de otros catalogadores), la ficha en consulta y la
galería (fotos añadidas o retiradas).

---

## Adenda (27/07/2026): dominio propio

La aplicación vive en **`catalogo.ruizcampins.com`**, con la zona DNS en Cloudflare y el registro
como **CNAME solo-DNS (nube gris) hacia el edge de Vercel** — gestionado en `infra/dominio.tf`.

Que la zona esté en Cloudflare no contradice esta ADR: los bloqueos de LaLiga golpean las IPs del
*proxy*, no la resolución DNS. Solo-DNS significa que Cloudflare únicamente contesta «dónde está»,
y el tráfico va directo a Vercel. Proxiado, además de recomprar el problema, apilaría dos CDN e
impediría a Vercel emitir el certificado TLS. Mismo patrón que la otra aplicación del equipo.

Con dominio y HTTPS, la PWA queda **instalable de verdad** en producción (el service worker exige
contexto seguro, que la IP local por http no daba), y los enlaces de los correos de Supabase Auth
apuntan al dominio.
