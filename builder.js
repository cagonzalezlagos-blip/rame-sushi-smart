export const isIngredientChangeGroup=group=>/^cambios?\b/i.test(String(group.name||''))&&group.min_select===0;
// The catalogue is the single source of truth for prices and option limits.
export function configuredGroups(productId, groups, options) {
  return groups.filter(g => g.product_id === productId && g.active !== false).sort((a, b) => a.sort_order - b.sort_order)
    .map(g => ({...g, choices: options.filter(o => o.group_id === g.id && o.active).sort((a, b) => a.sort_order - b.sort_order)}));
}

export function validateSelection(group, ids) {
  return ids.length >= group.min_select && ids.length <= group.max_select &&
    new Set(ids).size === ids.length && ids.every(id => group.choices.some(o => o.id === id));
}

export function pricedUnit(product, configured, selected, notes = '') {
  let price = Number(product.base_price);
  const chosen = [];
  for (const group of configured) {
    const ids = selected[group.id] || [];
    if (!validateSelection(group, ids)) throw new Error(`Revisa ${group.name}`);
    for (const id of ids) {
      const option = group.choices.find(o => o.id === id);
      price += Number(option.price_delta);
      chosen.push({group_id: group.id, option_id: id, group: group.name, name: option.name, price_delta: Number(option.price_delta)});
    }
  }
  if (!Number.isSafeInteger(price) || price < 0) throw new Error('Precio inválido');
  return {product_id: product.id, name: product.name, price, options: chosen, quantity: 1, notes: String(notes).slice(0, 500)};
}

export function cartSubtotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function repriceCart(cart,products,categories,groups,options) {
  return cart.map(item=>{
    const product=products.find(p=>p.id===item.product_id&&p.active&&p.base_price>0);
    if(!product||!categories.some(c=>c.id===product.category_id&&c.active))throw Error(`${item.name} ya no está disponible en la carta. Revisa el pedido.`);
    const configured=configuredGroups(product.id,groups,options);
    const selected=Object.fromEntries(configured.map(g=>[g.id,item.options.filter(o=>o.group_id===g.id).map(o=>o.option_id)]));
    if(item.options.some(o=>!configured.some(g=>g.id===o.group_id)))throw Error(`Los cambios de ${item.name} se actualizaron. Edita ese producto en el pedido.`);
    const repriced=pricedUnit(product,configured,selected,item.notes);
    return {...repriced,quantity:item.quantity};
  });
}
