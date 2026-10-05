export const FEATURES = Object.freeze(['pickup', 'delivery', 'cash', 'customers', 'attendance', 'whatsapp', 'printing']);

const clean = (value, fallback, max = 100) => String(value ?? '').trim().slice(0, max) || fallback;
const color = value => /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? value : '#20baa7';
const logo = value => {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
};

export function businessFromEnvironment(env = {}) {
  const selected = String(env.VITE_BUSINESS_FEATURES ?? FEATURES.join(',')).split(',').map(x => x.trim());
  return {
    name: clean(env.VITE_BUSINESS_NAME, 'Mi negocio gastronómico'),
    icon: clean(env.VITE_BUSINESS_ICON, '🍽️', 8),
    logo_url: logo(env.VITE_BUSINESS_LOGO_URL),
    accent_color: color(env.VITE_BUSINESS_ACCENT_COLOR),
    locale: clean(env.VITE_BUSINESS_LOCALE, 'es-CL', 20),
    currency: clean(env.VITE_BUSINESS_CURRENCY, 'CLP', 3).toUpperCase(),
    country_code: clean(env.VITE_BUSINESS_COUNTRY_CODE, '56', 4).replace(/\D/g, '') || '56',
    address: '',
    phone: '',
    features: Object.fromEntries(FEATURES.map(key => [key, selected.includes(key)])),
  };
}

export function withBusinessSettings(base, settings = {}) {
  const brand = settings.brand_config && typeof settings.brand_config === 'object' && !Array.isArray(settings.brand_config)
    ? settings.brand_config : {};
  return {
    ...base,
    name: clean(settings.business_name, base.name),
    address: clean(settings.address, base.address, 250),
    phone: clean(settings.phone, base.phone, 30),
    currency: clean(settings.currency, base.currency, 3).toUpperCase(),
    icon: clean(brand.icon, base.icon, 8),
    logo_url: logo(brand.logo_url ?? base.logo_url),
    accent_color: color(brand.accent_color || base.accent_color),
    features: {...base.features, ...Object.fromEntries(FEATURES.filter(key => typeof brand.features?.[key] === 'boolean').map(key => [key, brand.features[key]]))},
  };
}

export function routesForRole(role, features) {
  const staff = ['Caja', 'Pedidos', ...(features.customers ? ['Clientes'] : []), ...(features.cash ? ['Cierre'] : []), 'Disponibilidad'];
  if (role === 'owner') return ['Resumen', ...staff, 'Proveedores', 'Personal', ...(features.delivery ? ['Repartidores'] : []), 'Configuración', ...(features.attendance ? ['Asistencia'] : [])];
  if (role === 'cashier') return [...staff, 'Personal', ...(features.attendance ? ['Asistencia'] : [])];
  if (role === 'courier') return [...(features.delivery ? ['Repartos'] : []), ...(features.attendance ? ['Asistencia'] : [])];
  return features.attendance ? ['Asistencia'] : [];
}

export function themeInk(hex) {
  const channel = n => { const x = n / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; };
  const rgb = /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16))) : [0, 0, 0];
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? '#052222' : '#ffffff';
}
