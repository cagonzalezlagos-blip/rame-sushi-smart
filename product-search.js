const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function bindProductSearch(input,container){
 const categories=Array.from(container.querySelectorAll('[data-product-category]'));
 let previousOpen=null;
 input.addEventListener('input',()=>{
  const term=normalize(input.value);
  if(term&&previousOpen===null)previousOpen=categories.map(c=>c.open);
  for(const [index,category] of categories.entries()){
   let matches=0;
   for(const product of category.querySelectorAll('[data-add]')){product.hidden=!!term&&!normalize(product.textContent).includes(term);if(!product.hidden)matches++;}
   category.hidden=!!term&&!matches;
   category.open=term?matches>0:previousOpen?.[index]??category.open;
   container.append(category);
  }
  if(!term)previousOpen=null;
 });
}
