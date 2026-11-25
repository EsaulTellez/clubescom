# Manuales de usuario del TT 2026-B155

Los dos volúmenes se imprimen en tamaño carta. Cada PDF incluye un índice con enlaces y marcadores por tarea.

- **Comunidad escolar** cubre el uso por visitantes, estudiantes y docentes. Su archivo principal es `manual-comunidad.tex`.
- **Operación institucional** cubre la gestión de clubes, oficinas, moderación y administración. Su archivo principal es `manual-operacion.tex`.

## Editar y compilar

Conserva los archivos principales, el archivo compartido `estilo.tex` y la carpeta `figuras/` en el mismo directorio. Las imágenes son capturas de la demostración local y el escudo utilizado por la plataforma.

En Overleaf, importa el ZIP de fuentes como proyecto. Elige **XeLaTeX** como compilador y selecciona el archivo principal del volumen que quieras obtener. Recompila y descarga el PDF. Cambia el archivo principal para obtener el otro volumen.

También puedes ejecutar los siguientes comandos desde este directorio con Tectonic instalado.

~~~sh
tectonic manual-comunidad.tex
tectonic manual-operacion.tex
~~~

Con XeLaTeX local, compila dos veces cada archivo principal para actualizar el índice y las referencias. Para cambiar textos o capturas, modifica el volumen correspondiente y vuelve a compilar.
