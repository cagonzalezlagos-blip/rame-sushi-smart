export const isIngredientChangeGroup=group=>/^cambios?\b/i.test(String(group.name||''))&&group.min_select===0;
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const isChange=g=>/cambio/i.test(g.name||'');
const isPromo=p=>/tabla|promoci[oó]n|promo/i.test(p.name||'');
const wrap=g=>/envoltura|cobertura/i.test(g.name||'');
const fill=g=>/relleno|prote[ií]na/i.test(g.name||'');
const tariffs={palta:1500,queso:1500,salmon:2000,panko:1300,'jamon serrano':1300,sesamo:1300,nori:1300};
const fillings={pollo:1200,'camaron furay':1200,vegetal:1200,'pollo furay':1400,salmon:1500,mechada:1500,queso:1000};
function changePrice(g,o){const n=norm(o.name).replace(/^.*?\b(?:a|por|→)\s+/,'').trim();const map=wrap(g)?tariffs:fill(g)?fillings:null;if(!map)return Number(o.price_delta);const found=Object.keys(map).sort((a,b)=>b.length-a.length).find(k=>n===k||n.endsWith(' '+k));return found?map[found]:Number(o.price_delta);}
export function configuredGroups(productId,groups,options){return groups.filter(g=>g.product_id===productId&&g.active!==false).sort((a,b)=>a.sort_order-b.sort_order).map(g=>({...g,choices:options.filter(o=>o.group_id===g.id&&o.active).sort((a,b)=>a.sort_order-b.sort_order)}));}
export function validateSelection(group,ids){return ids.length>=group.min_select&&ids.length<=group.max_select&&new Set(ids).size===ids.length&&ids.every(id=>group.choices.some(o=>o.id===id));}
export function changeCount(configured,selected){return configured.filter(isChange).reduce((n,g)=>n+(selected[g.id]||[]).length,0);}
export function pricedUnit(product,configured,selected,notes=''){
 let price=Number(product.base_price);const chosen=[];
 if(isPromo(product)&&changeCount(configured,selected)>3)throw Error('Máximo 3 cambios combinados de envoltura y relleno por tabla o promoción.');
 for(const group of configured){const ids=selected[group.id]||[];if(!validateSelection(group,ids))throw Error(`Revisa ${group.name}`);
  for(const id of ids){const option=group.choices.find(o=>o.id===id);const delta=isPromo(product)&&isChange(group)?changePrice(group,option):Number(option.price_delta);price+=delta;chosen.push({group_id:group.id,option_id:id,group:group.name,name:option.name,price_delta:delta});}
 }
 if(!Number.isSafeInteger(price)||price<=0)throw Error('Precio inválido');return {product_id:product.id,name:product.name,price,options:chosen,quantity:1,notes:String(notes).slice(0,500)};
}
export function cartSubtotal(cart){return cart.reduce((sum,item)=>sum+item.price*item.quantity,0);}
export function repriceCart(cart,products,categories,groups,options){return cart.map(item=>{const product=products.find(p=>p.id===item.product_id&&p.active&&canSellProduct(p,groups,options));if(!product||!categories.some(c=>c.id===product.category_id&&c.active))throw Error(`${item.name} ya no está disponible en la carta. Revisa el pedido.`);const configured=configuredGroups(product.id,groups,options);const selected=Object.fromEntries(configured.map(g=>[g.id,item.options.filter(o=>o.group_id===g.id).map(o=>o.option_id)]));if(item.options.some(o=>!configured.some(g=>g.id===o.group_id)))throw Error(`Los cambios de ${item.name} se actualizaron. Edita ese producto en el pedido.`);const repriced=pricedUnit(product,configured,selected,item.notes);return {...repriced,quantity:item.quantity};});}
export function minimumProductPrice(product,groups,options){if(!product||!Number.isSafeInteger(Number(product.base_price))||Number(product.base_price)<0)return null;let price=Number(product.base_price);for(const g of configuredGroups(product.id,groups,options)){const costs=g.choices.map(o=>Number(o.price_delta)).sort((a,b)=>a-b);if(costs.length<g.min_select)return null;price+=costs.slice(0,g.min_select).reduce((a,b)=>a+b,0);}return Number.isSafeInteger(price)&&price>0?price:null;}
export const canSellProduct=(p,g,o)=>minimumProductPrice(p,g,o)!==null;
