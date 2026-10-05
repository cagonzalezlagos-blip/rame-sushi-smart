// The catalogue is the single source of truth for prices and option limits.
export function configuredGroups(productId, groups, options) {
  return groups.filter(g => g.product_id === productId).sort((a, b) => a.sort_order - b.sort_order)
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
