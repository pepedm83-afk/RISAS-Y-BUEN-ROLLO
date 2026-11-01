# Reducción de consumo — versión 2026.11.01.2

## Qué cambia para las personas

- La agenda muestra veinte tarjetas y ofrece Ver más quedadas. Los filtros siguen aplicándose a todos los eventos cargados, y el calendario conserva el mes completo.
- Todas las tarjetas mostradas conservan el contador de asistentes y el botón de inscripción propio. Las tarjetas nuevas esperan a verificar la inscripción antes de permitir pulsar; no se presume que una persona está sin apuntar.
- Solo las tarjetas mostradas consultan sus contadores e inscripción personal. Mis quedadas consulta las inscripciones del conjunto cargado para no ocultar reservas por la paginación.
- Las listas de asistentes se conservan hasta treinta minutos en la sesión de esa cuenta, un máximo de diez listas / 300.000 caracteres. Antes de reutilizarlas se comprueba la revisión del servidor y el evento; solo se consultan los movimientos y personas que han cambiado. Se mantienen fechas de admisión y plazos de Bizum, y se borra la caché de listas al salir o cambiar de cuenta.
- Actualizar lista y totales comprueba el estado actual sin obligar a volver a descargar todo el historial. Un historial incoherente sigue descartándose y recuperándose completo.
- Las valoraciones automáticas se preparan como máximo cada quince minutos. Pueden tardar hasta ese plazo después de finalizar una quedada. Recuentos, correos, promociones desde espera y avisos push conservan su frecuencia de cinco minutos.

## Cambios internos

La consulta personal usa una colección agrupada con rutas de documentos explícitas, en lotes de hasta treinta y `limit(30)`. Una regla adicional permite únicamente consultas de un participante aprobado para sus propias filas, limitadas a treinta. No permite escrituras ni barridos generales; los permisos existentes de las listas de cada evento se mantienen. Mientras se propagan las reglas hay una alternativa de lotes de cinco rutas explícitas compatible con las comprobaciones anteriores.

La preparación periódica de valoraciones guarda en la caché del servicio la próxima ejecución solo después de terminar sin errores. Una pérdida de caché provoca otro barrido seguro; no bloquea reintentos ni cambia los activadores existentes. La preparación manual sigue disponible sin espera.

El catálogo base de eventos y grupos continúa leyéndose al entrar/actualizar: todavía no hay paginación del catálogo en servidor. Los bloques de veinte evitan consultar contadores e inscripciones de todas las tarjetas y renderizarlas todas; no se afirma haber eliminado esas lecturas base.

## Evidencia y límites

- Simulación local de 70 personas x 5 entradas, 60 eventos en catálogo, veinte tarjetas iniciales y dos inscripciones entre ellas: 350 consultas personales / 700 documentos devueltos frente a 21.000 lecturas individuales del método anterior sobre los sesenta eventos. Es el ahorro de esa operación específica, excluidas las reglas, los eventos, los recuentos y las demás funciones. No es una medición de la aplicación completa ni tráfico real contra Firebase.
- Valoraciones: 288 barridos potenciales diarios pasan a 96 si la caché permanece disponible: reducción del 66,7 % en esos barridos, no en todo el consumo del proyecto.
- Emulador: lote de treinta, consultas generales rechazadas, visitantes, pendientes y bloqueados denegados; permisos anteriores de eventos, grupos, pagos y plantillas conservados.
- Regresiones: estados personales y errores de red, solicitudes simultáneas, carreras con altas/bajas, aislamiento de cuentas, tarjetas por bloques de veinte, caché de listas revalidada, descarga incremental, marcas de tiempo y limpieza al salir.

Se mantiene Spark. No se habilita facturación, no se contrata Blaze y no se modifican inscripciones reales para simular usuarios. Las cuotas gratuitas siguen siendo finitas: ninguna de estas cifras garantiza que un volumen arbitrario de actividad quepa gratis. El ahorro real debe contrastarse con días de uso representativo después de desplegar.
