# Avisos por correo

Remitente y buzón de Pepe: `peperisasybuenrollo@gmail.com`. `pepedm83@gmail.com`, incluidos sus alias de Gmail, queda excluido. Los administradores de comunidad y los asignados al grupo reciben cada aviso en su propio correo. No se accede al contenido del buzón de Gmail.

Este proyecto de Google Apps Script funciona con la cuenta de avisos. Requiere activar el proveedor Google en Firebase Authentication y publicar las reglas y la web que acompañan este cambio. Usa un token OAuth de la cuenta autorizada en el propio servidor de Apps Script, lo intercambia por una sesión de Firebase y solo accede a los documentos que permiten las reglas. No contiene contraseñas, tokens persistentes ni claves privadas.

Copiar `Code.gs` y `appsscript.json` en un proyecto de Apps Script de la cuenta de avisos. Ejecutar `comprobarConfiguracion` y autorizar los permisos mostrados por Google. Cuando las comprobaciones pasen, ejecutar `activarAvisos` para crear un único disparador cada cinco minutos.

Las nuevas quedadas de participantes generan una solicitud privada y atómica con el evento. Los administradores guardan su propio correo cuando entran en la web. Para administradores que aún no han vuelto a entrar, Pepe puede completar `notificationContacts/{UID}` con su dirección exacta de Firebase Authentication y el único campo `email`; nunca se deben adivinar direcciones a partir de nombres.

No se envían avisos por eventos antiguos, modificaciones o quedadas creadas por administradores. La cola mantiene el estado de los envíos y no permite que los participantes indiquen destinatarios ni contenidos arbitrarios. Cada destinatario recibe un correo individual, sin revelar las direcciones de otros administradores. Las cuotas diarias de Google se consultan antes de enviar y los envíos pendientes se reanudan después.

Si un intento queda sin confirmación, pasa a `needsReview` y no se repite automáticamente. Un administrador debe comprobar el correo enviado antes de decidir repetirlo. Esta precaución evita duplicados ante fallos entre el envío y el registro de su resultado.

La autorización y la activación del disparador son imprescindibles: guardar el código o la dirección del buzón no activa los avisos.
