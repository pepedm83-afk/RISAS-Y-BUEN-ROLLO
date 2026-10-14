# Avisos al móvil y correos para administradores

Estado de esta entrega: código preparado; `push-config.json` mantiene `enabled:false` hasta completar autorización y prueba real. No hay claves privadas ni tokens de dispositivos en GitHub. La agenda antigua sigue separada.

## Autorización pendiente, antes de activar

1. Firebase → Configuración → Cloud Messaging → Certificados push web: generar el par de claves. Solo se copia la **clave pública** a `comunidad/push-config.json`; Firebase conserva la privada.
2. En Google Cloud IAM, dar a `peperisasybuenrollo@gmail.com` un rol personalizado con **solo** `cloudmessaging.messages.create` en el proyecto `risas-y-buen-rollo`. No darle Editor ni Propietario. Esto autoriza a la cuenta de avisos a enviar push a los dispositivos de esta app; no da acceso al buzón Gmail.
3. Publicar las reglas de `comunidad/firestore.rules`: el usuario solo lee/escribe su dispositivo; el remitente dedicado puede leerlos y desactivar tokens caducados. Los grupos, roles y pagos conservan sus permisos anteriores.
4. En el proyecto Apps Script de la cuenta nueva, sustituir `Code.gs` y `appsscript.json` y añadir `Push.gs`. Autorizar el alcance añadido `https://www.googleapis.com/auth/firebase.messaging`. Los correos mantienen su disparador; ejecutar `activarPush` crea otro disparador cada cinco minutos. Nunca ejecutar desde el Gmail excluido.
5. Comprobar que FCM Registration API está habilitada. Firebase Cloud Messaging V1 ya aparecía habilitada al revisar la consola el 14/10/2026.

## Publicación y prueba

- Publicar el cliente, trabajador y configuración con la clave pública. Mantener `enabled:false` hasta tener los permisos y el procesador activos. Para la prueba inicial, activar el botón solo cuando esté listo el servidor.
- Abrir desde un iPhone con iOS 16.4+ añadido a inicio y desde Android; elegir un grupo y aceptar las notificaciones. Este permiso lo concede cada usuario en su teléfono.
- Crear una quedada claramente identificada como prueba desde una cuenta participante verificada, comprobar el correo administrativo y el push con la app cerrada. Tocar el aviso debe abrir exactamente la quedada.
- Confirmar que otro grupo no recibe aviso, que un administrador con dos grupos puede seguir ambos, y que desactivar o cerrar sesión impide avisos en ese dispositivo. Comprobar cuenta cambiada en teléfono compartido.
- Cancelar la prueba conservando el historial; no eliminar otros eventos. `sent` en la cola significa aceptación por FCM, no prueba de que el teléfono lo mostró.

## Funcionamiento

- Correos únicamente a la cuenta de avisos y administradores de comunidad/grupo correspondiente cuando publica un participante; Gmail antiguo excluido, sin suscripciones de usuarios por email.
- Push opcional para participantes y administradores; los grupos asignados se preseleccionan para administradores de grupo. Ninguno recibe otros grupos salvo selección expresa. Las preferencias se guardan por dispositivo.
- Solo nuevas quedadas tras la activación o modificación de los grupos; no recordatorios automáticos ni avisos por edición. Cola push independiente: una cuota de correo agotada no detiene el push. Los eventos pasados, cancelados o de grupos retirados no generan avisos.
- Cada disparador procesa un lote limitado y conserva qué dispositivos se han enviado. Se desactivan tokens FCM caducados. El trabajador descarta mensajes de otras cuentas y deduplica por evento/cuenta para evitar repetir avisos al reintentar.
- El trabajador tiene alcance exclusivo de `/comunidad/` y no introduce cachés ni redirecciones. No necesita facturación Blaze, cuenta de servicio descargada ni acceso a leer Gmail.

Validación automatizada: `node check-push.cjs` y `node --experimental-vm-modules check-verification.cjs` desde esta carpeta. La prueba física en iPhone/Android sigue siendo obligatoria antes de considerar comprobada la recepción.
