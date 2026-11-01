# Asistencia visible y revisión de lecturas — 1 de noviembre de 2026

## Corrección 2026.11.01.1

Las tarjetas cargaban el resumen global, pero `myEventIds` solo se rellenaba al abrir Mis quedadas o una lista de asistentes. Eso mostraba Me apunto a personas ya inscritas. La inscripción estaba guardada correctamente.

Ahora, antes del primer render, se consulta exclusivamente `events/{eventId}/attendees/{uid}` de la persona conectada. No se descargan las listas completas. Se reutilizan resultados positivos y negativos durante 60 segundos en la misma sesión; Actualizar hace una consulta nueva. Las peticiones simultáneas comparten promesa y una lectura antigua no pisa una alta/baja recién guardada. Si no puede verificarse la inscripción, aparece Ver inscripción, sin afirmar que no esté apuntado. El cambio de cuenta descarta respuestas anteriores.

Los resúmenes globales también comparten peticiones simultáneas, conservan la caché de 60 segundos y no pisan un recuento más reciente obtenido tras una modificación propia. Al cambiar de vista se cierran las escuchas de las listas que dejan de estar visibles.

## Qué consume

No se cuentan visitas visuales, sino documentos leídos y comprobaciones de permisos. Mostrar un texto, mover el scroll o actualizar la cuenta atrás no consulta Firestore.

| Acción | Lecturas directas, antes de permisos |
| --- | --- |
| Abrir / Actualizar la agenda | Documentos devueltos por tres consultas de eventos (futuros, últimos tres días y finales explícitos), grupos, configuración y cuenta |
| Contadores de tarjetas | Un resumen por quedada mostrada; consultas en lotes de hasta 30 documentos, mínimo una lectura por consulta vacía |
| Estado de mi botón | Un documento personal por quedada cargada, incluso si no existe |
| Cambiar filtro/vista en menos de un minuto | Reutiliza resultados; no vuelve a leer lo ya cargado |
| Abrir asistentes por primera vez | Lista de inscripciones + historial de movimientos + evento y revisiones; extras de platos, pagos o presencia cuando correspondan |
| Mantener una lista de asistentes abierta | Una escucha del documento de revisión; al cambiar se carga el incremento. Al cerrar o cambiar de vista se detiene |
| Plantillas, miembros e informes | Consultas bajo demanda al abrir sus paneles; los informes mensuales se conservan 15 minutos |
| Procesadores automáticos | Se ejecutan cada cinco minutos aunque nadie abra la aplicación |

Las reglas actuales de lectura de una inscripción pueden necesitar hasta cinco documentos adicionales distintos: miembro, perfil, revisión de alta, permisos y evento. Firebase puede cobrar esas dependencias; no se debe estimar todo como una única lectura por botón. Las consultas vacías también tienen un coste mínimo. No se debe dar por hecho un ahorro compartido entre peticiones independientes.

## Presupuesto orientativo, no contador real

Ejemplo: 40 eventos futuros, 12 grupos y pocos eventos recientes, para un participante ordinario aprobado, sin abrir listas ni informes:

- Datos directos: alrededor de 140 lecturas (eventos + resúmenes + inscripción propia + cuenta/grupos).
- Dependencias de seguridad: aproximadamente otras 200–250, según qué ramas se evalúen.
- Presupuesto conservador: unas 350–400 lecturas por entrada completa. Recientes, valoraciones, reconexiones, administración y tareas automáticas se suman.
- 100 personas entrando una vez: unas 35.000–40.000 lecturas, más el resto.
- 100 personas entrando cinco veces con recargas completas: unas 175.000–200.000 lecturas, más el resto.

Esto no es una medición de producción. No se han podido consultar las gráficas del proyecto: el acceso al inicio de sesión de Google fue rechazado por revisión automática. Tampoco se ha comprobado el plan de facturación actual. El nivel gratuito estándar ofrece 50.000 lecturas al día, no 50.000 visitas. En Spark se puede agotar el acceso diario; Blaze permite excedentes facturables.

## Tareas automáticas

Hay 288 intervalos de cinco minutos al día. Sin trabajos pendientes, los procesadores ejecutan como mínimo consultas de cola de recuentos, dos consultas de eventos para valoraciones, cola administrativa, cola push y cola de promociones: seis consultas mínimas por intervalo, aproximadamente 1.728 lecturas/día antes de permisos y resultados adicionales. No es un total de producción ni un techo: colas antiguas, eventos recientes y sus revisiones pueden elevarlo mucho.

Los recuentos completos se recalculan cuando existe una tarea de asistencia, no por cada visita. El procesador de valoraciones sí vuelve a consultar eventos recientes y revisiones; conviene medirlo antes de asegurar que el consumo en segundo plano es pequeño. Los envíos push consultan dispositivos solamente cuando hay trabajos pendientes.

## Próximo ajuste de capacidad

Contrastar gráficas de 24 horas y 7 días con aperturas y número de eventos. Si el volumen lo exige, priorizar agenda por páginas y un índice privado de inscripciones por usuario, mantenido con transacciones y reglas de seguridad: evitaría una consulta individual por cada evento. Ese cambio requiere migración y despliegue de reglas; no se introduce como arreglo improvisado ni se declara resuelto con esta corrección.

Fuentes oficiales: https://firebase.google.com/docs/firestore/pricing y https://firebase.google.com/docs/firestore/quotas

Validación: suite de pruebas existente y regresiones de primera carga, caché positiva/negativa, refresco explícito, concurrencia, respuestas antiguas, error de red, aislamiento de cuentas y deduplicación de resúmenes. Sin prueba autenticada en un móvil real ni lectura del contador de producción.
