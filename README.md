# Ramé Sushi Smart — fuente para implementación

Estado: **base funcional de desarrollo**, NO se debe usar aún con clientes reales. Proyecto Supabase independiente creado: `ngqyxevyrfkdyuatklnl` (São Paulo). Se aplicaron migraciones para catálogo, opciones, pedidos, reparto, caja, personal, cola de impresión y roles.

## Publicar frontend
1. Instala Node.js LTS; en esta carpeta ejecuta `npm install` y `npm run build`.
2. Copia `.env.example` a `.env` y añade la clave **publishable** de este proyecto (nunca service_role). Para Vercel define `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de entorno.
3. Importa el repositorio a Vercel; Framework Vite, Build Command `npm run build`, Output Directory `dist`. Aún no se ha desplegado porque la integración de Vercel no devuelve equipos.
4. En Supabase Authentication crea las cuentas de la dueña, cajero y repartidor. Inserta los `auth.users.id` correspondientes en `public.profiles` usando SQL Editor con roles `owner`, `cashier`, `courier`. **No habilites registro público de trabajadores**. Ejemplo: `insert into public.profiles(id,full_name,role) values ('UUID_REAL','Dueña','owner');`.
5. La carta PDF recibida el 25/09/2026 ya está cargada en Supabase: 72 productos, 12 categorías, 17 grupos y 90 opciones. Falta confirmar precios de extras no especificados y configurar `delivery_zones` con tarifas reales; no se han insertado tarifas ficticias.
6. Configura la impresora siguiendo `print-agent/INSTALAR-WINDOWS.txt` en Windows 10; la impresión automática no funciona sin este servicio local.

## Funcionalidad implementada en fuente
- Inicio de sesión con Supabase Auth y roles.
- POS y handrolls personalizables con precios calculados y validados en servidor mediante `staff_create_order`.
- Pedidos y asignación de repartidor; repartidor ve solo sus pedidos y puede cambiar el estado por RPC restringida.
- Registro de pago por RPC atómica en caja abierta; cierre de caja imprimible A4 desde navegador.
- Confirmación genera `print_jobs` una sola vez; agente Windows recoge trabajos y los envía al controlador de la POS-H806.
- Enlace manual WhatsApp; mensajes automáticos requieren WhatsApp Business Platform y plantillas autorizadas.

## Pendiente antes de operar
- Confirmar extras no especificados en la carta, tramos de delivery y usuarios autorizados.
- Revisión de políticas de acceso y auditoría de seguridad en entorno real, pruebas end-to-end de varias sesiones, pruebas con impresora USB.
- Integrar servicio de mapas para cálculo por ruta y validar direcciones. Por ahora la caja selecciona el tramo manualmente.
- Verificar el cierre de caja con el flujo completo de cobros, devoluciones, pagos mixtos y anulaciones; no son funciones completas aún.
- Implementar administración editable del catálogo y gestión laboral según contratos; el cálculo laboral mostrado es estimativo.
- Configurar dominio, respaldos, privacidad y WhatsApp oficial si se requieren mensajes automáticos sin clic.
