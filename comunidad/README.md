# Transición de Risas y Buen Rollo

Página independiente de prueba: `comunidad/index.html`. No modifica ni reemplaza la agenda de Google Calendar.

## Activación pendiente

1. Crear proyecto Firebase en plan Spark, sin asociar facturación. Desactivar Google Analytics para minimizar datos.
2. Activar Authentication con correo y contraseña. Autorizar el dominio `pepedm83-afk.github.io`. Configurar idioma español para los correos.
3. Crear Cloud Firestore en región de la UE. Publicar `firestore.rules` antes de aceptar usuarios. Nunca utilizar reglas de modo prueba.
4. Registrar aplicación web y copiar su configuración pública a `config.json`, a partir del ejemplo. No colocar cuentas de servicio ni credenciales privadas en GitHub.
5. Registrarse como `pepedm83@gmail.com`, verificar el correo y entrar. Solo ese correo verificado tiene permisos de propietario.
6. Crear los grupos y sus enlaces de WhatsApp. Los admins se registran y solicitan un grupo; Pepe aprueba desde su panel.
7. Probar con dos cuentas en dispositivos distintos: consulta pública, denegación de permisos, aprobación admin, publicación, edición, inscripción, acompañantes, comida/cena y baja.

## Estado

Configuración pública del proyecto Firebase incorporada. Pendiente publicar las reglas en Firebase y probar permisos y operaciones contra el servicio real. El acceso público a la agenda antigua no depende de estos archivos. Los eventos de prueba nuevos no se sincronizan todavía con Calendar y no se han importado los antiguos. No anunciar ni retirar el grupo de Eventos hasta completar la prueba y la migración.

El propietario (correo verificado pepedm83@gmail.com) es el único que gestiona grupos y permisos. Las concesiones en grants usan role: group o community y una lista groups. El administrador de comunidad puede gestionar eventos de cualquier grupo, sin conceder permisos. El administrador de grupo solo puede gestionar los grupos asignados. Pepe autoriza primero una solicitud de grupo y puede ampliar el acceso desde el panel de permisos. Ningún usuario puede otorgarse permisos a sí mismo.

Listas de asistencia accesibles solo a usuarios con correo verificado. Correos y perfiles privados; en las listas aparecen nombre y recuentos. Las inscripciones de comida/cena indican cuántas personas del total van a la comida, sin imponer que todos los acompañantes participen.
