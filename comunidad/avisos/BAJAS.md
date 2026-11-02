# Bajas definitivas: activación pendiente

La interfaz permite solicitar «Rechazar solicitud» y «Eliminar definitivamente». Hasta autorizar y activar el servicio, ambas operaciones informan de que están pendientes de habilitar. Desactivar sigue siendo reversible.

El servicio de bajas se ejecuta en el proyecto de Apps Script existente, como `peperisasybuenrollo@gmail.com`. Requiere añadir el scope OAuth `https://www.googleapis.com/auth/cloud-platform` y un rol personalizado del proyecto `risas-y-buen-rollo` con:

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
