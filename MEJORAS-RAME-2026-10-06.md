# Actualización Ramé Sushi — 6 de octubre de 2026

## Publicar la interfaz

Descomprime `Rame-Sushi-Mejoras-GitHub.zip`. Sube su contenido al directorio principal del repositorio `cagonzalezlagos-blip/rame-sushi-smart`, conservando las subcarpetas. Los archivos `src.js`, `style.css` y los módulos de interfaz deben quedar junto al `package.json` existente; no crees una carpeta adicional con el nombre del ZIP. Confirma los cambios en GitHub y espera el despliegue de Vercel.

La migración de Supabase ya fue aplicada y probada. El archivo SQL incluido es el respaldo del cambio: no vuelvas a ejecutarlo manualmente.

## Actualizar el computador del local

1. Cierra la ventana **Rame - Impresión**.
2. Descomprime `Rame-Sushi-Actualizar-Impresion-PC.zip` completamente.
3. Ejecuta `ACTUALIZAR-IMPRESION.cmd` con la misma cuenta de Windows con que instalaste la impresión.
4. Abre nuevamente **Rame - Impresión** desde el escritorio.

La actualización conserva la impresora, la clave protegida de Supabase y el inicio automático. Guarda una copia de los archivos de impresión anteriores. No pide volver a ingresar la clave. No copies claves a GitHub.

## Funcionamiento

- **Correlativo por jornada:** comienza en 001 con cada apertura de caja. Sigue hasta el cierre, aunque pase de medianoche. Los pedidos requieren caja abierta. La reimpresión conserva el número y la jornada del pedido original.
- **Registro e impresión:** Registrar pedido confirma el pedido y deja una única comanda en la cola, dentro de la misma operación. El agente del PC la procesa cada cinco segundos. El medio de pago queda por confirmar.
- **Pago:** en Pedidos, elige Efectivo, Tarjeta o Transferencia y pulsa Confirmar pago y registrar en caja. El ingreso se guarda una vez en la caja abierta. Registrar una comanda o una pre-cuenta no registra un cobro.
- **Comanda:** sin logo, con letras grandes, nombre, teléfono, preparación de cada producto, fecha agendada, salsas, palitos y notas de reparto. Los grupos de selección no imprimen el rótulo Cambio de ingrediente.
- **Varios pedidos:** Otro pedido abre un borrador independiente. Puedes alternar entre clientes, modificar productos y sus cantidades y volver al borrador anterior. Cada cuenta guarda sus borradores en Supabase; una versión evita sobrescribir cambios de otra sesión. Los cambios sin conexión quedan temporalmente en ese navegador y deben sincronizarse antes de registrar.
- **Preparación:** usa Editar en el producto del carrito para anotar pollo por palta, sin cebollín, etc. Las notas se guardan en ese pedido; no necesitas crear un cambio nuevo en cada tabla de la carta. Las opciones obligatorias del handroll siguen guiadas. Si unidades del mismo producto llevan cambios distintos, duplica o agrega otra línea.
- **Pedido registrado:** Editar datos y preparación permite corregir nombre, teléfono, indicaciones, regalos, agendamiento y notas de cada producto antes de asignarlo o cerrarlo. En delivery también permite recalcular el destino o usar una tarifa manual. No permite cambiar el cobro de delivery de un pedido ya pagado. Si cocina ya recibió la comanda, genera una actualización; si aún está pendiente, se imprime el detalle actualizado.
- **Pre-cuenta y reimpresión:** se solicitan desde Pedidos y salen por la impresora configurada. Requieren el agente del computador abierto. La pre-cuenta es informativa y no equivale a una boleta tributaria.
- **Direcciones:** la búsqueda usa la comuna seleccionada y permite arrastrar el punto en el mapa o pegar coordenadas. Siempre revisa y confirma el domicilio. Si no se puede calcular, activa Tarifa manual, ingresa el cobro al cliente, el pago al repartidor y el motivo. Sin un punto confirmado, el repartidor recibe la dirección y una indicación para coordinar la ubicación: no se inventan coordenadas ni distancias.
- **Regalos:** al tomar el pedido agrega el tipo y cantidad de cada salsa, los pares de palitos y las indicaciones. Aparecen en la comanda, en Pedidos y en Mis entregas del repartidor.
- **Clientes:** al salir del campo Teléfono, la app busca coincidencias y ofrece Usar datos guardados. Al registrar o corregir el pedido, actualiza los datos del cliente. El domicilio recuperado debe revisarse antes de calcular el reparto.
- **Categorías:** Carta → Categorías permite agregar categorías y eliminarlas de la carta. Retirar una categoría deja de ofrecer sus productos y permite recuperarla; conserva los pedidos y sus datos históricos.
- **WhatsApp:** Pegar pedido de WhatsApp sugiere datos y coincidencias con nombres del catálogo. Revisa nombre, teléfono, dirección, cantidades y preparación. El texto original queda guardado con el pedido. Completa las opciones obligatorias del handroll en Editar. Esta función no recibe mensajes automáticamente ni accede a WhatsApp Web. La sincronización automática requiere conectar el número a WhatsApp Business Platform y configurar la recepción de mensajes.
- **Remuneraciones:** cada trabajador consulta sus propias horas, tarifa de cada jornada, pausas, base por horas, entregas y pagos registrados. Administración consulta a todos y puede registrar pagos ya realizados. El saldo histórico pendiente separa lo devengado de lo pagado; las jornadas abiertas muestran una estimación provisional. Los filtros incluyen jornadas cerradas según su fecha de salida, en hora de Chile. No se envía dinero ni se registra un egreso de caja desde esa pantalla. Es un control por horas y repartos, no una liquidación tributaria o laboral.
- **Cajón:** Abrir cajón envía una orden manual al PC. La orden vence en 30 segundos si el agente no la recibe. Las comandas y pre-cuentas usan impresión RAW ESC/POS y no incluyen el pulso de apertura del cajón. No hay apertura automática al cobrar.

## Comprobación en el local

Con el agente actualizado y la app publicada:

1. Abre caja y registra un pedido con un cambio de preparación, dos salsas y tres pares de palitos. Comprueba nombre, teléfono y número de jornada en la comanda.
2. Comprueba que la comanda y la pre-cuenta impriman sin abrir el cajón. Pulsa Abrir cajón y verifica la apertura manual.
3. Si Windows sigue abriendo el cajón al imprimir, revisa POS-80-Series → Preferencias de impresión → Cash Drawer / Cajón, y desactiva Open before / Open after printing. Los nombres dependen del controlador.
4. Confirma un pago y revisa el ingreso único en caja.
5. Ingresa otro pedido con el mismo teléfono y recupera sus datos.
6. Prueba Mis entregas con la cuenta del repartidor y Remuneraciones con una cuenta de trabajador.

La impresora identificada como POS-80-Series se trata como compatible con ESC/POS. El tamaño final de letra, el corte, los caracteres y la apertura manual requieren una prueba física en ese modelo. Windows confirma la aceptación de los trabajos en su cola; esa confirmación no verifica que haya salido papel.

## Validación realizada

- 35 pruebas automatizadas aprobadas y compilación de producción correcta.
- Prueba de interfaz con servicios simulados a 390 px: borradores independientes, preparación, regalos, pago posterior, edición, reimpresión, pre-cuenta, botón del cajón, importación de WhatsApp, tarifa manual, reutilización de clientes, categorías y remuneraciones sin desborde ni errores de página.
- Pruebas transaccionales contra Supabase con rollback: correlativo por sesión, reinicio, caja cerrada, registro idempotente, impresión inmediata, clientes, edición de domicilio manual, regalos, cobros sin duplicados, conflictos de borradores, cálculo de horas, privacidad por trabajador, pagos registrados, impresión y permisos del cajón. No quedaron pedidos ni pagos de prueba.
- Revisión de permisos: tablas nuevas con RLS; clientes sin sesión no pueden ejecutar las nuevas operaciones. Los avisos del asesor sobre RPC con SECURITY DEFINER son esperados: cada operación comprueba la sesión y el perfil autorizado dentro del servidor, y las funciones internas no tienen permisos para clientes. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
