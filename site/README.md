# La página pública

El escaparate del proyecto, en GitHub Pages: <https://mbarchein.github.io/catalogador-arte/>.

```
public/       Lo que se publica. HTML y CSS a mano, sin compilación
  index.html    Español
  en/           Inglés
  img/          Las capturas, ya optimizadas
screenshots/  El arnés que genera esas capturas. NO se publica
```

## Por qué no hay compilación

Lo que se publica tiene que seguir abriéndose dentro de diez años, y cada dependencia es una cosa
menos que va a estar. Son dos ficheros HTML, una hoja de estilo y cinco imágenes. La paleta es la de
la aplicación, escrita en hexadecimal porque aquí no hay Tailwind.

Un cambio en `site/public/**` publica la página y **no** dispara el despliegue a producción; eso lo
fija un test (`make pipeline-test`), no la buena voluntad.

## Las capturas

Son de la aplicación de verdad, con **un fondo inventado**: ni las obras, ni los artistas, ni los
coleccionistas que salen existen. No es una precaución estética — la base real guarda datos
personales de terceros (`parties.contact` es la fila más delicada de toda la matriz RLS) y una
página pública es exactamente donde eso no puede acabar.

Para regenerarlas:

```sh
site/screenshots/run.sh
```

Cuatro pasos, todos deterministas —volver a ejecutarlo sin cambios reescribe imágenes idénticas—:

1. `artwork_images.py` pinta la obra inventada: composiciones abstractas con semilla fija, un
   reverso con sus etiquetas, un detalle de firma y cuatro carteles de exposición.
2. `build-demo.sh` compila la aplicación desde una copia de `app/` contra el servidor de la
   demostración. La copia es necesaria para sustituir los nombres reales de los fondos, que están en
   el código (`ARTIST_LABEL`), sin ensuciar el árbol de trabajo.
3. `capture.mjs` levanta `server.mjs` —un Supabase de mentira que responde desde `demo-data.mjs`— y
   fotografía la aplicación con Chromium por su protocolo de depuración, a 390 px y a 1280 px.
4. `optimize.py` deja las imágenes en WebP y a la mitad de densidad, en `public/img/`.

Hace falta Chromium (`CHROME=` apunta a otro binario) y `node_modules` de `app/` ya instalado.

**Lo que se fotografía es la compilación de producción**, no un montaje: la aplicación hace sus
propias consultas, firma sus propias URL y abre su propia sesión. Un cliente falso inyectado en el
código fotografiaría una aplicación distinta de la que se despliega, que es justo lo que una página
comercial no puede hacer.

`server.mjs` implementa solo lo que las pantallas piden —un subconjunto de PostgREST, la firma del
almacenamiento y lo justo de Auth— y **avisa por consola de lo que no sabe responder**, para que una
pantalla nueva lo diga en vez de salir en blanco.
