# Equipo 8 · Guion de las seis exposiciones

[Abrir las 48 diapositivas en Canva](https://www.canva.com/d/TncRb7OcrO7JC6Y) · [Copia en PowerPoint](Equipo-8-Nube-48.pptx)

Son 48 diapositivas. Cada tema dura aproximadamente 4–5 minutos con pausas para señalar los gráficos. Cada alumno tiene 16 diapositivas en total. Los turnos se agrupan para que puedan explicar una idea completa antes de pasar la palabra.

| Tema | Unidad y código | Diapositivas | Orden de los alumnos |
|---|---|---|---|
| SaaS | 1 · 1.2.3 | 1–8 | 1 → 2 → 3 |
| Teorema CAP y modelos de consistencia | 2 · 2.1.3 | 9–16 | 2 → 3 → 1 |
| Gestión de VMs y redes virtuales | 3 · 3.1.1 | 17–24 | 3 → 1 → 2 |
| Elasticidad, escalabilidad y resiliencia | 3 · 3.4 | 25–32 | 1 → 2 → 3 |
| Seguridad de red y de datos | 4 · 4.2 | 33–40 | 2 → 3 → 1 |
| Autenticación y autorización de APIs | 5 · 5.1.3 | 41–48 | 3 → 1 → 2 |

## Tema 1 de 6 · SaaS

Unidad 1 · 1.2.3

### 1. SaaS · Alumno 1

*En pantalla: Software como servicio*

Imagina que los tres abrimos una hoja de gastos desde nuestras computadoras. Nadie del equipo instaló un servidor ni actualizó el programa. Esa parte la hace el proveedor. Durante este tema vamos a seguir esa hoja para ver qué recibimos y qué seguimos administrando nosotros.

### 2. ¿Dónde está el archivo? · Alumno 1

*En pantalla: Navegador · Servicio SaaS · Hoja guardada*

Cuando escribo una cantidad, mi navegador manda el cambio al servicio. Ahí se guarda la versión compartida. Por eso puedo cerrar la laptop y abrir la misma hoja desde otro equipo con mi cuenta.

### 3. ¿Qué administra cada quien? · Alumno 1

*En pantalla: Proveedor / Aplicación y servidores · Equipo / Archivos y accesos*

Si mañana hay una actualización, le toca al proveedor aplicarla. Si compartimos la hoja con el grupo equivocado, nos toca a nosotros corregir el permiso. Las dos responsabilidades conviven aunque todo se use desde la misma pantalla.

### 4. Un documento, dos permisos · Alumno 2

*En pantalla: Ana / Editora · Luis / Lector*

Ana organiza los gastos y necesita modificar cantidades. Luis solo quiere consultar el total. Compartimos el mismo documento con ambos y les damos funciones distintas. Eso evita hacer una copia por cada integrante.

### 5. Una edición desde el celular · Alumno 2

*En pantalla: Abrir la hoja · Capturar $80 · Guardar el cambio*

Luis pagó ochenta pesos de transporte y avisa a Ana. Ella abre el archivo en su teléfono, registra el gasto y confirma que se guardó. Cuando volvemos a la laptop, abrimos el mismo documento y podemos revisar el registro.

### 6. Correo, documentos y diseño · Alumno 2

*En pantalla: Correo / Gmail · Documentos / Google Docs · Diseño / Canva*

Piensen en lo que hicimos para esta exposición. En el correo coordinamos el equipo, en un documento escribimos el diálogo y en Canva abrimos el diseño. En cada caso usamos la función de la aplicación sin administrar la máquina que la sostiene.

### 7. Qué ganas y de qué dependes · Alumno 3

*En pantalla: Acceso / Varios dispositivos · Dependencia / Cuenta y servicio*

La ventaja para nosotros es empezar rápido y colaborar a distancia. La dependencia se nota el día de la exposición: si el servicio falla o perdemos acceso a la cuenta, podemos quedarnos sin la presentación. Una exportación disponible antes de entrar al salón ayuda en ese caso.

### 8. ¿SaaS o una VM? · Alumno 3

*En pantalla: Opción A / Abrir el editor · Opción B / Instalarlo en una VM*

Si contratamos una máquina y nosotros instalamos el editor, también nos encargamos de actualizarlo. Si abrimos directamente un editor que el proveedor mantiene, estamos usando SaaS. Con esa pregunta podemos reconocer el modelo aunque cambie la marca del producto.

## Tema 2 de 6 · Teorema CAP y modelos de consistencia

Unidad 2 · 2.1.3

### 9. Teorema CAP y modelos de consistencia · Alumno 2

*En pantalla: Consistencia fuerte y eventual*

Para este tema imaginemos una tienda con dos copias del inventario. El dato que seguiremos es el estado de una sola butaca, la B12. Lo interesante aparece cuando una copia registra la venta y la otra todavía no se ha enterado.

### 10. Dos réplicas de B12 · Alumno 2

*En pantalla: Réplica A / Libre · Réplica B / Libre*

Al comienzo ambas copias dicen libre. Si alguien compra la butaca en A, el cambio también tiene que llegar a B. Ese envío tarda tiempo y depende de una red que puede fallar.

### 11. Qué significan C, A y P · Alumno 2

*En pantalla: C / Última escritura · A / Respuesta · P / Partición de red*

Aquí consistencia significa que una lectura exitosa respeta la última escritura completada. Disponibilidad significa que toda petición a un nodo que sigue funcionando obtiene respuesta válida. La partición ocurre cuando ciertos nodos dejan de poder intercambiar mensajes.

### 12. Se corta el enlace · Alumno 3

*En pantalla: Réplica A / Vendida · Réplica B / Libre*

Miren el orden: primero se interrumpe la comunicación, luego A confirma la venta. Ahora llega una consulta a B. B ve su copia local, pero no tiene manera de comprobar si A acaba de cambiarla.

### 13. Dos respuestas posibles · Alumno 3

*En pantalla: Esperar / Proteger consistencia · Responder / Proteger disponibilidad*

Si priorizamos el dato más reciente, B quizá tenga que bloquear o rechazar la lectura. Si priorizamos que responda, puede devolver su valor local. El compromiso de CAP aparece justo mientras B está aislada.

### 14. Consistencia fuerte · Alumno 3

*En pantalla: Venta confirmada · Lectura posterior · B12 vendida*

Supongamos que la venta terminó y no hay otra escritura. Si después consulto B12 y la lectura tiene éxito, debo verla vendida. El sistema puede necesitar coordinación para asegurar eso, aunque tenga varias copias internas.

### 15. Consistencia eventual · Alumno 1

*En pantalla: B12 libre · Llega la venta · B12 vendida*

B puede mostrar libre durante un rato. Si la comunicación se recupera y dejan de llegar escrituras, las copias terminan coincidiendo. Eventual tampoco nos da por sí solo un plazo exacto de actualización.

### 16. ¿Qué dato puede esperar? · Alumno 1

*En pantalla: Butaca / Confirmar una reserva · Vistas / Mostrar un contador*

Para confirmar una reserva necesitamos impedir que dos personas compren la misma butaca, por ejemplo con una operación atómica sobre su estado. En un contador de vistas podemos tolerar algo de retraso. El costo del dato viejo es distinto en cada operación.

## Tema 3 de 6 · Gestión de VMs y redes virtuales

Unidad 3 · 3.1.1

### 17. Gestión de VMs y redes virtuales · Alumno 3

*En pantalla: VPC y comunicación entre instancias*

Este tema tiene dos partes. Primero hay que crear y cuidar las máquinas virtuales. Después hay que conectarlas para que la aplicación pueda consultar la base. Las dos máquinas pueden estar en la misma nube y aun así necesitar rutas y reglas para hablar.

### 18. Qué contiene una VM · Alumno 3

*En pantalla: CPU virtual · Memoria RAM · Disco y sistema*

Piensen en dos computadoras que comparten el mismo equipo físico. Cada una ve su memoria, su disco y sus procesos. El hipervisor se encarga de repartir el hardware y aislar las máquinas.

### 19. Crear una instancia · Alumno 3

*En pantalla: Imagen del sistema · Tamaño de VM · Subred y disco*

Para la app elegimos una imagen de Linux, una combinación de CPU y memoria y un disco. También elegimos la subred donde vivirá. Con esas decisiones ya sabemos con qué arranca y dónde tendrá su dirección privada.

### 20. Operar y retirar · Alumno 1

*En pantalla: Operar / Métricas y parches · Retirar / Respaldo y liberación*

Mientras funciona revisamos CPU, memoria y disco y programamos las actualizaciones. Al retirarla, guardamos lo necesario y verificamos qué discos siguen existiendo. Apagar una máquina y eliminar todos sus recursos son operaciones diferentes.

### 21. Cómo se divide una VPC · Alumno 1

*En pantalla: VPC / 10.0.0.0/16 · Subred app / 10.0.1.0/24 · Subred datos / 10.0.2.0/24*

El primer bloque abarca toda nuestra red de ejemplo. Dentro separamos las direcciones de la aplicación y las de datos. Esa separación facilita aplicar rutas y reglas diferentes según la función de cada recurso.

### 22. Dirección, ruta y regla · Alumno 1

*En pantalla: Destino privado · Ruta de red · Regla permitida*

Conocer la IP de destino es el primer paso. Además debe existir un camino de ida y vuelta, y las reglas deben permitir el protocolo y el puerto necesarios. Una ruta válida por sí sola no concede permiso de acceso.

### 23. Una consulta entre instancias · Alumno 2

*En pantalla: VM app / 10.0.1.10 · PostgreSQL / 10.0.2.20*

La app se conecta a la IP privada de PostgreSQL. La regla de la base permite conexiones desde la app al puerto del servicio. Para atender esa consulta la base no necesita una IP pública.

### 24. La consulta no llega · Alumno 2

*En pantalla: ¿Destino correcto? · ¿Hay ruta? · ¿Está permitido?*

En este ejemplo se restauró la VM de datos con otra IP y la app sigue usando la anterior. Aunque la ruta y las reglas estén bien, no llegará. Revisar destino, ruta y permisos en orden nos ayuda a identificar qué parte corresponde corregir.

## Tema 4 de 6 · Elasticidad, escalabilidad y resiliencia

Unidad 3 · 3.4

### 25. Elasticidad, escalabilidad y resiliencia · Alumno 1

*En pantalla: Capacidad, demanda y recuperación*

Imaginemos un portal que recibe muchas solicitudes cuando se abre un registro. Crecer para atender más gente, liberar capacidad al terminar y seguir funcionando si falla una máquina son tres problemas distintos. Los vamos a ver con el mismo portal.

### 26. Cómo reconocer la saturación · Alumno 1

*En pantalla: Solicitudes por minuto · Tiempo de respuesta · Uso de CPU*

Si llegan más solicitudes y las respuestas empiezan a tardar, buscamos dónde se forma la cola. Puede ser la CPU de la app, la base de datos o el disco. Elegir qué recurso ampliar depende de ese diagnóstico.

### 27. Escalado vertical · Alumno 1

*En pantalla: Antes / 4 GB de RAM · Después / 8 GB de RAM*

Nuestra app se queda corta de memoria. Una posibilidad es pasar la misma máquina de cuatro a ocho gigas. Es una intervención sencilla de entender, pero tiene un límite de tamaño y algunos cambios pueden requerir reiniciar.

### 28. Escalado horizontal · Alumno 2

*En pantalla: Balanceador · VM A · VM B · VM C*

Aquí dejamos el tamaño de cada VM igual y agregamos copias de la aplicación. Un balanceador reparte las solicitudes. Funciona mejor si cualquier copia puede atender al usuario sin depender de información guardada solo en una máquina.

### 29. Elasticidad en las dos direcciones · Alumno 2

*En pantalla: 08:00 / 2 VMs · 10:00 / 5 VMs · 12:00 / 2 VMs*

Nuestra demanda sube a las diez y vuelve a bajar al mediodía. Agregamos tres instancias para el pico y después las liberamos. El segundo movimiento es tan importante como el primero si queremos ajustar el gasto al uso real.

### 30. Qué activa el ajuste · Alumno 2

*En pantalla: Medir la carga · Aplicar la regla · Ajustar capacidad*

Podemos definir un mínimo y un máximo de instancias y una señal, por ejemplo carga sostenida por instancia. La política espera suficiente evidencia antes de ajustar. Así evitamos crear y quitar máquinas por una subida que duró apenas unos segundos.

### 31. Resiliencia ante una falla · Alumno 3

*En pantalla: VM A / Fuera de servicio · VM B / Atiende tráfico*

Ahora la demanda es normal. El problema es que A dejó de responder. El balanceador detecta la falla y manda solicitudes nuevas a B mientras se reemplaza A. Para que esto funcione, B necesita capacidad suficiente.

### 32. ¿Pico, crecimiento o falla? · Alumno 3

*En pantalla: Más usuarios cada mes · Pico de dos horas · Una VM caída*

Si el portal crece cada mes, hablamos de escalabilidad. Si el reto es un pico de dos horas, buscamos elasticidad. Si se cae una máquina y queremos continuar, diseñamos para resiliencia. Un servicio real suele necesitar las tres.

## Tema 5 de 6 · Seguridad de red y de datos

Unidad 4 · 4.2

### 33. Seguridad de red y de datos · Alumno 2

*En pantalla: El viaje de un archivo*

Supongan que una profesora consulta la lista de su grupo. La lista viaja por la red, la aplicación revisa permisos y una base la guarda. Protegerla requiere pensar en cada paso de ese recorrido.

### 34. Qué queremos proteger · Alumno 2

*En pantalla: Confidencialidad · Integridad · Disponibilidad*

Confidencialidad es que alguien ajeno al grupo no pueda leer la lista. Integridad es que un cambio sin permiso no pase inadvertido. Disponibilidad es que la profesora pueda consultarla cuando haga falta.

### 35. Separar las zonas de red · Alumno 2

*En pantalla: Internet · Aplicación · Base privada*

La base no necesita recibir peticiones directas de los navegadores. Podemos separar la entrada pública, la aplicación y los datos. Así controlamos los caminos entre zonas según lo que cada componente necesita.

### 36. Permitir el tráfico necesario · Alumno 3

*En pantalla: Público → app / HTTPS · App → base / Puerto de BD*

El navegador llega a la aplicación por HTTPS. La aplicación llega al puerto de la base desde un origen autorizado. Si alguien intenta llegar desde internet directamente a esa base, la regla no habilita ese camino.

### 37. Cifrado en tránsito y en reposo · Alumno 3

*En pantalla: En tránsito / TLS · En reposo / Disco cifrado*

La lista se transmite por una conexión protegida y después se escribe en un disco cifrado. Son momentos diferentes. También cuidamos quién puede usar las claves, porque una aplicación que descifra datos necesita permisos adecuados.

### 38. Acceso mínimo a los datos · Alumno 3

*En pantalla: Docente / Su grupo · Soporte / Diagnóstico limitado*

La profesora necesita ver su grupo. La cuenta de soporte quizá solo necesite ver el estado del servicio. Si los dos tienen acceso a toda la base, un error en cualquiera de las cuentas tiene mucho más alcance.

### 39. Detectar y recuperar · Alumno 1

*En pantalla: Registro · Alerta · Restauración*

Si se borra una lista, el registro ayuda a saber qué operación ocurrió y cuándo. Para recuperarla necesitamos un respaldo utilizable. Por eso se ensaya la restauración con una copia y se revisa si recuperó el contenido esperado.

### 40. Un archivo llega al grupo equivocado · Alumno 1

*En pantalla: Limitar acceso · Revisar registros · Corregir el permiso*

La conexión estaba cifrada, pero alguien compartió el archivo con un grupo de más. Primero se corrige el permiso y se revisan los registros disponibles para entender el alcance. Restaurar un respaldo tendría sentido si se perdieron datos, no para retirar un acceso concedido.

## Tema 6 de 6 · Autenticación y autorización de APIs

Unidad 5 · 5.1.3

### 41. Autenticación y autorización de APIs · Alumno 3

*En pantalla: Tokens y OAuth 2.0*

Usaremos una app que quiere guardar una reunión en el calendario de Ana. La API necesita saber qué credencial llegó y si esa credencial permite crear eventos. Vamos a separar identidad, permisos y delegación.

### 42. Autenticar una identidad · Alumno 3

*En pantalla: Ana · Inicio de sesión · Cuenta verificada*

Ana abre el proveedor de calendario e inicia sesión. El servicio comprueba sus credenciales y, cuando corresponde, un segundo factor. En ese punto ya sabe qué cuenta está presente, pero aún falta decidir qué puede hacer la app.

### 43. Autorizar una acción · Alumno 3

*En pantalla: Consultar / Permitido · Editar / Denegado*

Ana puede tener acceso de lectura al calendario de su grupo y edición en el personal. La respuesta depende de qué operación pide y sobre cuál calendario. El servidor comprueba ese permiso incluso si la pantalla oculta el botón de editar.

### 44. Qué representa un token · Alumno 1

*En pantalla: Destino / API calendario · Alcance / Lectura · Vigencia / 10 minutos*

En este ejemplo, el servicio emite una credencial para consultar el calendario durante diez minutos. La API valida el token y comprueba su alcance. Si la app intenta crear un evento con permiso de lectura, la operación debe rechazarse.

### 45. Quién participa en OAuth 2.0 · Alumno 1

*En pantalla: Ana · Aplicación cliente · Servidor de autorización · API*

Ana es quien autoriza. La app cliente quiere actuar con ese permiso. El servidor de autorización emite el token y la API del calendario protege los eventos. Dos de esos papeles pueden pertenecer al mismo proveedor, pero hacen trabajos distintos.

### 46. Del permiso al token · Alumno 1

*En pantalla: Ana aprueba · La app recibe un código · Canjea el código por un token*

La app abre la autorización en el proveedor. Ana ve el permiso solicitado y lo aprueba. La app recibe un código temporal y lo canjea con su verificador de PKCE. El resultado es un token para la API sin que la app reciba la contraseña de Ana.

### 47. Una llamada al calendario · Alumno 2

*En pantalla: App presenta token · API valida permiso · Evento creado*

La app manda los datos de la reunión por HTTPS junto con el token de acceso. El servidor comprueba que acepta esa credencial y que autoriza crear eventos en ese calendario. Solo entonces guarda la reunión y devuelve una confirmación.

### 48. ¿Por qué se rechazó la petición? · Alumno 2

*En pantalla: 401 / Credencial inválida · 403 / Permiso insuficiente*

Si el token venció, la app necesita volver a obtener una credencial válida. Si sigue vigente pero solo permite leer, necesita autorización para crear el evento. Con esa diferencia cerramos el tema: identificar, delegar y comprobar el permiso son pasos distintos.

## Fuentes

- [Google Cloud: SaaS](https://cloud.google.com/saas) — definición y responsabilidad del proveedor.
- [AWS: teorema CAP](https://docs.aws.amazon.com/whitepapers/latest/availability-and-beyond-improving-resilience/cap-theorem.html) — precisión sobre la elección durante una partición.
- [AWS Well-Architected: definiciones](https://docs.aws.amazon.com/wellarchitected/latest/framework/definitions.html) — consistencia, escalabilidad y elasticidad.
- [AWS: seguridad de infraestructura EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/infrastructure-security.html) — controles de tráfico y grupos de seguridad.
- [Google Cloud: Zero Trust](https://cloud.google.com/architecture/framework/security/implement-zero-trust) — mínimo privilegio y seguridad de red.
- [IETF RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — marco de autorización OAuth 2.0.
- [IETF RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — uso y protección de bearer tokens.
- [IETF RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — buenas prácticas actuales de seguridad para OAuth 2.0.
