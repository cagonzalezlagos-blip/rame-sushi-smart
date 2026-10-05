import './style.css';
import {businessFromEnvironment,withBusinessSettings,themeInk} from './business.js';
import {configuredGroups,pricedUnit,validateSelection,cartSubtotal} from './builder.js';

const presets={
  sushi:{name:'Ramé Sushi',icon:'🍣',color:'#20baa7',items:[
    {id:'handroll',name:'Handroll armable',base_price:5800,groups:[{name:'Proteína',min:1,max:1,choices:[['Pollo',0],['Salmón',700],['Camarón',900]]},{name:'Vegetal',min:1,max:1,choices:[['Palta',0],['Cebollín',0],['Pepino',0]]},{name:'Proteína adicional',min:0,max:1,choices:[['Pollo',1300],['Camarón',1300]]}]},
    {id:'gohan',name:'Gohan',base_price:7900,groups:[]} ]},
  rapida:{name:'Comida Rápida',icon:'🍔',color:'#ee9b3b',items:[
    {id:'burger',name:'Hamburguesa armable',base_price:6500,groups:[{name:'Proteína',min:1,max:1,choices:[['Vacuno',0],['Pollo',0],['Vegetariana',0]]},{name:'Extras',min:0,max:2,choices:[['Queso',700],['Tocino',900],['Palta',800]]}]},
    {id:'papas',name:'Papas fritas',base_price:2900,groups:[]} ]},
  cafeteria:{name:'Café Plaza',icon:'☕',color:'#a46c42',items:[
    {id:'latte',name:'Latte',base_price:3500,groups:[{name:'Tamaño',min:1,max:1,choices:[['Mediano',0],['Grande',500]]},{name:'Leche',min:1,max:1,choices:[['Tradicional',0],['Sin lactosa',0],['Avena',500]]}]},
    {id:'sandwich',name:'Sándwich del día',base_price:4500,groups:[]} ]}
};
const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const app=document.querySelector('#demo');let current='sushi',cart=[];
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
function model(item){return {product:{id:item.id,name:item.name,base_price:item.base_price},groups:item.groups.map((g,i)=>({id:`${item.id}-${i}`,product_id:item.id,name:g.name,min_select:g.min,max_select:g.max,sort_order:i})),options:item.groups.flatMap((g,i)=>g.choices.map(([name,price_delta],j)=>({id:`${item.id}-${i}-${j}`,group_id:`${item.id}-${i}`,name,price_delta,active:true,sort_order:j})))}}
function render(){const p=presets[current],brand=withBusinessSettings(businessFromEnvironment({}),{business_name:p.name,brand_config:{icon:p.icon,accent_color:p.color}});document.documentElement.style.setProperty('--accent',brand.accent_color);document.documentElement.style.setProperty('--accent-ink',themeInk(brand.accent_color));document.title=p.name+' · Demostración';
  app.innerHTML=`<header><strong>${esc(brand.icon)} ${esc(brand.name)}</strong><span>Demostración · Datos de ejemplo</span></header><main><h1>Una base para distintos negocios</h1><p>Elige un rubro, arma un producto y revisa el pedido. Aquí no se envían pedidos reales.</p><nav class="demo-nav">${Object.entries(presets).map(([key,value])=>`<button data-preset="${key}" class="${key===current?'selected':''}">${esc(value.icon)} ${esc(value.name)}</button>`).join('')}</nav><div class="cols"><section class="panel"><h2>Carta de ejemplo</h2>${p.items.map(item=>`<button class="product demo-product" data-item="${item.id}"><b>${esc(item.name)}</b><span>${money(item.base_price)}</span><small>${item.groups.length?'Personalizable paso a paso':'Listo para agregar'}</small></button>`).join('')}</section><section class="panel"><h2>Pedido</h2><div id="demoCart">${cart.map((item,i)=>`<div class="cart-item"><b>${esc(item.name)}</b><span>${money(item.price)}</span><small>${item.options.map(x=>esc(x.name)).join(', ')||'Sin modificaciones'}</small><button class="quiet" data-remove="${i}">Quitar</button></div>`).join('')||'<p>Elige un producto para comenzar.</p>'}</div><h2>Total ${money(cartSubtotal(cart))}</h2><button id="demoConfirm" ${cart.length?'':'disabled'}>Ver resumen del pedido</button><p id="demoResult" role="status"></p></section></div><dialog id="demoBuilder"></dialog></main>`;
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{current=b.dataset.preset;cart=[];render()});
  document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>addItem(p.items.find(x=>x.id===b.dataset.item)));
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);render()});
  document.querySelector('#demoConfirm').onclick=()=>{document.querySelector('#demoResult').textContent=`Pedido de ejemplo: ${cart.length} producto(s), total ${money(cartSubtotal(cart))}.`};
}
function addItem(item){const m=model(item),groups=configuredGroups(item.id,m.groups,m.options);if(!groups.length){cart.push(pricedUnit(m.product,groups,{}));render();return}
 const dialog=document.querySelector('#demoBuilder'),selected=Object.fromEntries(groups.map(g=>[g.id,[]]));let step=0;
 function draw(){const group=groups[step],last=step===groups.length;
  dialog.innerHTML=`<div class="wizard-head"><b>${esc(item.name)}</b><button class="quiet" id="demoClose">✕</button></div><p>Paso ${step+1} de ${groups.length+1}</p><div class="progress"><span style="width:${(step+1)/(groups.length+1)*100}%"></span></div>${last?`<h2>Revisa tu producto</h2>${groups.map(g=>`<p><b>${esc(g.name)}:</b> ${selected[g.id].map(id=>esc(g.choices.find(x=>x.id===id)?.name)).join(', ')||'Sin adicional'}</p>`).join('')}<h2>${money(pricedUnit(m.product,groups,selected).price)}</h2>`:`<h2>${esc(group.name)}</h2><p>Elige ${group.min_select===group.max_select?group.min_select:`entre ${group.min_select} y ${group.max_select}`}${group.min_select===0?' (opcional)':''}</p><div class="choices">${group.choices.map(o=>`<button class="choice ${selected[group.id].includes(o.id)?'chosen':''}" data-choice="${o.id}" aria-pressed="${selected[group.id].includes(o.id)}"><span>${esc(o.name)}</span><b>${o.price_delta?'+'+money(o.price_delta):'Incluido'}</b></button>`).join('')}</div>`}<div class="wizard-actions"><button class="quiet" id="demoBack" ${step===0?'disabled':''}>Atrás</button><button id="demoNext">${last?'Agregar al pedido':'Siguiente'}</button></div>`;
  dialog.querySelector('#demoClose').onclick=()=>dialog.close();dialog.querySelector('#demoBack').onclick=()=>{step--;draw()};
  dialog.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{const ids=selected[group.id],index=ids.indexOf(b.dataset.choice);if(index>=0)ids.splice(index,1);else if(group.max_select===1)selected[group.id]=[b.dataset.choice];else if(ids.length<group.max_select)ids.push(b.dataset.choice);draw()});
  dialog.querySelector('#demoNext').onclick=()=>{if(last){cart.push(pricedUnit(m.product,groups,selected));dialog.close();render();return}if(!validateSelection(group,selected[group.id]))return alert('Completa '+group.name);step++;draw()};
 }
 dialog.showModal();draw();
}
render();
