import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFromEnvironment,withBusinessSettings,routesForRole,themeInk} from '../business.js';

test('two businesses use the same code with independent branding and features',()=>{
  const sushi=withBusinessSettings(businessFromEnvironment({VITE_BUSINESS_NAME:'Ramé Sushi'}),{business_name:'Ramé Sushi',brand_config:{icon:'🍣',features:{delivery:true,attendance:true}}});
  const cafe=withBusinessSettings(businessFromEnvironment({VITE_BUSINESS_NAME:'Café Plaza',VITE_BUSINESS_FEATURES:'pickup,cash,customers',VITE_BUSINESS_ACCENT_COLOR:'#6d442e'}),{business_name:'Café Plaza'});
  assert.equal(sushi.name,'Ramé Sushi');assert.equal(cafe.name,'Café Plaza');
  assert.deepEqual(routesForRole('courier',cafe.features),['Remuneraciones','Mi cuenta']);
  assert.deepEqual(routesForRole('owner',cafe.features),['Resumen','Carta','Caja','Pedidos','Clientes','Cierre','Disponibilidad','Proveedores','Personal','Remuneraciones','Usuarios','Configuración','Mi cuenta']);
  assert.ok(routesForRole('cashier',cafe.features).includes('Personal'));
  assert.ok(routesForRole('courier',sushi.features).includes('Repartos'));
});

test('unsafe branding is ignored and role menus stay scoped',()=>{
  const base=businessFromEnvironment({VITE_BUSINESS_LOGO_URL:'javascript:alert(1)',VITE_BUSINESS_ACCENT_COLOR:'red'});
  const business=withBusinessSettings(base,{brand_config:{logo_url:'http://example.com/logo.png',features:{delivery:'true',printing:false}}});
  assert.equal(business.logo_url,'');assert.equal(business.accent_color,'#20baa7');
  assert.equal(business.features.delivery,true);assert.equal(business.features.printing,false);
  assert.deepEqual(routesForRole('worker',business.features),['Asistencia','Remuneraciones','Mi cuenta']);
  assert.equal(themeInk('#000000'),'#ffffff');assert.equal(themeInk('#ffffff'),'#052222');
});

test('an owner can remove a previously configured logo',()=>{
  const base=businessFromEnvironment({VITE_BUSINESS_LOGO_URL:'https://example.com/logo.png'});
  assert.equal(withBusinessSettings(base,{brand_config:{logo_url:''}}).logo_url,'');
});
