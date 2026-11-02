# Bajas definitivas: servicio activado

La interfaz permite solicitar «Rechazar solicitud» y «Eliminar definitivamente». El servicio se ha activado el 2 de noviembre de 2026. Desactivar sigue siendo reversible. Las eliminaciones solicitadas se muestran aparte de las solicitudes de aprobación, con su estado de proceso o revisión.

El servicio de bajas se ejecuta en el proyecto de Apps Script existente, como `peperisasybuenrollo@gmail.com`. Requiere añadir el scope OAuth `https://www.googleapis.com/auth/cloud-platform` y un rol personalizado del proyecto `risas-y-buen-rollo` con:

- `serviceusage.services.use`.
- `firebaseauth.users.get`, `firebaseauth.users.update`, `firebaseauth.users.delete`.
- `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`, `datastore.entities.delete`.

Estos permisos permiten leer y modificar la base de datos del proyecto y desactivar/borrar cuentas de acceso. Deben autorizarse expresamente antes de asignar el rol. No requieren activar facturación. No se usan claves privadas ni se solicitan permisos de Gmail.

Una vez autorizado: cargar `Bajas.gs`, añadir el scope al manifiesto y ejecutar `activarBajas`. Este comprueba acceso sin borrar usuarios y configura un ciclo cada cinco minutos. No ejecutar el procesador para probar con cuentas reales.

## Comportamiento

- Solo administrador principal o de comunidad puede solicitar bajas. No puede borrar su propia cuenta y debe retirar antes los permisos del destinatario.
- El servicio vuelve a comprobar el permiso del solicitante y protege las cuentas principal y de avisos.
- Primero bloquea el acceso y desactiva Authentication. Los tokens antiguos quedan bloqueados por `members/{uid}`.
- Recorre eventos en bloques de 30. Las reservas futuras se retiran mediante movimiento de baja y actualización de revisión/cola, para mantener los ascensos de espera. Los conflictos se detienen para revisión.
- La actividad pasada se conserva con el nombre «Miembro eliminado». Los historiales de pagos y valoraciones conservan su UID opaco para coherencia interna; esto es una eliminación de cuenta, no un borrado integral de cualquier dato histórico.
- Borra perfil, teléfono, dispositivos push, suscripciones, solicitudes y reserva del nombre, y finalmente la cuenta de Authentication.
- Volver requiere registro nuevo, verificación de correo y aprobación. No recupera permisos ni reservas de la cuenta anterior.
- `needsReview` requiere resolver el motivo y volver a dejar el estado en `pending` desde consola. Nunca se presenta como completado un borrado fallido.

## Proyecto de las llamadas administrativas

El servicio conserva su proyecto predeterminado de Apps Script. Las llamadas de Authentication usan `X-Goog-User-Project: risas-y-buen-rollo` y las credenciales OAuth de la cuenta del servicio. Esto requiere `serviceusage.services.use` en el proyecto Firebase, incluido en `bajas-role.json` (nueve permisos). No se usan claves privadas ni claves API para estas llamadas administrativas.

El módulo y el scope cloud-platform están cargados y autorizados. La comprobación de Authentication devuelve HTTP 200. `activarBajas` ha completado correctamente la creación de configuración y programación. No se han borrado cuentas reales como prueba.

`comprobarPermisosBajas` consulta un UID inexistente y la configuración del servicio. Solo registra códigos y errores, sin credenciales ni contenidos de personas.
