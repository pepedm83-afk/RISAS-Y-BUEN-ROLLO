# Servicio de avisos

Esta rama prepara la transición a **correos de administración y notificaciones push opcionales por dispositivo**. El código de producción anterior no cambia hasta completar la autorización y publicar esta rama. Consulta [PUSH_SETUP.md](PUSH_SETUP.md) para el estado, los permisos concretos y la prueba de activación.

El remitente sigue siendo `peperisasybuenrollo@gmail.com`; el Gmail antiguo y sus alias quedan excluidos de los correos. `Code.gs` conserva los avisos administrativos cada cinco minutos para nuevas quedadas de participantes, con destinatarios de comunidad y grupo, direcciones privadas, deduplicación y control de cuota.

`Push.gs` procesa otra cola cada cinco minutos, sin depender de la cuota de Gmail. Envía únicamente a los dispositivos que hayan elegido el grupo antes de publicarse el evento. No envía eventos cancelados, pasados o de grupos retirados. No genera recordatorios ni avisos de edición.

Los tokens de dispositivos se guardan de forma privada en Firebase. No hay contraseñas, claves privadas de servicio ni credenciales persistentes en este repositorio. El envío utiliza un token OAuth temporal con el alcance de mensajería de Firebase; no pide acceso a leer Gmail.

En iPhone se requiere iOS 16.4 o posterior, añadir a pantalla de inicio, abrir desde el icono y permitir notificaciones. Android requiere un navegador compatible y permiso. Cada dispositivo puede desactivarse; cerrar sesión detiene los avisos de esa cuenta en ese dispositivo.

El estado `sent` confirma que el servicio aceptó el envío; la recepción en pantalla se verifica mediante una prueba real. `push-config.json` permanece desactivado y sin clave pública hasta preparar el servidor. La interfaz y agenda antiguas se mantienen separadas.
