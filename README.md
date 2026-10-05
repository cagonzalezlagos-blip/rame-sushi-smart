# Base gastronómica

Una sola aplicación para negocios gastronómicos con carta, productos armables, pedidos, caja, reparto, clientes, personal e impresión. Cada negocio tiene **su propia instalación y base Supabase**. Los componentes comunes reciben correcciones en esta base; nombre, colores, logo, carta, ingredientes y funciones se configuran por negocio.

Ramé Sushi usa esta base con su propia instalación. La carta se administra desde la pantalla **Carta** (perfil administrador), con grupos de selección, opciones y recargos configurables. Exportar/importar Excel permite modificaciones masivas con revisión previa y guardado transaccional.

## Configurar un negocio

1. Crear un proyecto Supabase exclusivo y una instalación Vercel exclusiva. No usar la base de otro cliente.
2. Instalar el esquema base de pedidos y catálogo que usa Ramé Sushi. Esta exportación de esquema todavía está pendiente para instalaciones nuevas; `migrations/20260928_operations.sql` es una ampliación y presupone que esas tablas ya existen.
3. Aplicar `migrations/20260928_operations.sql`, `migrations/20261005_business_config.sql` y `migrations/20261005_19_rame_management.sql` en ese orden al proyecto nuevo. Revisar políticas RLS y roles antes de abrir el acceso; Estas ampliaciones se validaron con el esquema real de Ramé. Aplicar también `migrations/20261005203321_catalog_editor_excel.sql`, que habilita el editor transaccional y permite desactivar grupos.
4. Configurar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y las variables `VITE_BUSINESS_*` en el despliegue. Ver `examples/`. La clave de servicio jamás pertenece al frontend.
5. Crear cuentas de empleados en Authentication y habilitar sus perfiles. En la pantalla **Configuración del negocio**, definir identidad, funciones y ubicación verificada. Cargar categorías, productos, grupos de opciones, ingredientes y tarifas propios.
6. Probar pedidos mixtos, adicionales, cobros, caja, despacho, impresora y asistencia en teléfonos reales antes de operar.

```bash
npm ci
npm run build
npm run demo:standalone
node --test tests/*.test.js
npm run dev
```

`dist/demo-standalone.html` se abre directamente en el navegador y muestra tres cartas de ejemplo sin cuenta ni conexión a la base. Los pedidos de esa demostración son locales y ficticios.

Sin URL y clave de Supabase, la app muestra una pantalla de configuración y no conecta con ningún negocio. El archivo `.env.production` anterior se retiró de esta rama para que una instalación nueva no quede conectada accidentalmente a Ramé.

## Qué se comparte y qué cambia

| Común en la base | Configuración por negocio |
| --- | --- |
| POS, carrito, reglas de opciones y cálculo | Carta, precios, ingredientes y grupos de selección |
| Pedidos, estados, caja, reportes, proveedores y reparto | Nombre, logo HTTPS, icono, color, contacto y funciones visibles |
| Roles, permisos, impresión y asistencia | Usuarios, tarifas, ubicación, impresora y base de datos |

Un handroll, hamburguesa o pizza se modelan con el mismo producto, grupos con mínimos y máximos, y opciones con costo adicional. Los precios se leen de la base y el servidor debe recalcular el total. Las funciones visibles se configuran en `settings.brand_config` o variables de entorno; **ocultar una pantalla no sustituye las políticas RLS**.

## Pendientes para ofrecer la plataforma a terceros

- Generar y validar el esquema inicial completo y datos de ejemplo vacíos de clientes para crear negocios nuevos sin copiar datos de Ramé.
- Automatizar alta de negocio, despliegue, respaldo y actualizaciones por instalación.
- Pruebas de extremo a extremo con sesiones de dueño, caja y repartidor, junto con pruebas en impresora y celulares.
- Gestionar pagos mixtos, devoluciones y mensajes automáticos solo si cada cliente los requiere y se integra el proveedor correspondiente.

La guía de operación específica de Ramé queda en [`docs/rame/README.md`](docs/rame/README.md).
