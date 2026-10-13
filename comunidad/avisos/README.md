# Avisos por correo

Servicio activo desde el 14 de octubre de 2026. Remitente y buzón de Pepe: peperisasybuenrollo@gmail.com. pepedm83@gmail.com y sus alias de Gmail están excluidos de los avisos.

El proyecto de Apps Script «Risas y Buen Rollo · Avisos» funciona bajo el correo dedicado, con un único activador de procesarAvisos cada cinco minutos. Se habilitó Google en Firebase y se autorizó el ID público del cliente OAuth del script. El script no solicita lectura del buzón. No contiene contraseñas, claves privadas ni tokens persistentes.

Los avisos administrativos se generan únicamente para quedadas nuevas creadas por participantes que no son administradores. Se envían a Pepe, administradores de comunidad y administradores del grupo, excluyendo bloqueados y duplicados. El directorio privado notificationContacts se inició con las 13 direcciones exactas de los administradores registrados. Los futuros administradores sincronizan su dirección verificada al entrar en la comunidad.

Los usuarios pueden activar voluntariamente los avisos para grupos seleccionados desde Mi cuenta. Están desactivados por defecto; activar emails exige verificar el correo. Participar no exige verificarlo. La suscripción es privada y se puede desactivar. No se envían quedadas anteriores a la elección de avisos. Los emails individuales no revelan otras direcciones.

Toda nueva quedada genera una cola atómica validada por reglas. La cola no permite seleccionar destinatarios ni mensajes arbitrarios. El servidor comprueba el evento y el grupo actuales; omite cancelados y grupos eliminados. Consulta la cuota antes de cada envío y reanuda pendientes cuando hay cuota. Si un envío queda sin confirmación, pasa a needsReview para revisión manual sin reenvíos automáticos ambiguos.

Cada evento ofrece Google Calendar y .ics para otros calendarios, sin solicitar acceso a su cuenta. Duración orientativa: tres horas. La copia no sincroniza modificaciones posteriores.

Code.gs y appsscript.json corresponden al código y los permisos del proyecto. comprobarConfiguracion valida la conexión y cuenta los contactos; activarAvisos reemplaza solo el activador de esta función en este proyecto. probarEnvio manda una única prueba al propio buzón dedicado. La prueba se ejecutó correctamente; no se enviaron pruebas a administradores ni usuarios.

