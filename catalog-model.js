export const CATALOG_FIELDS = {
  categories: ['id','name','sort_order','active'],
  products: ['id','category_id','name','description','base_price','image_url','customizable','active','sort_order'],
  groups: ['id','product_id','name','min_select','max_select','required','sort_order','active'],
  options: ['id','group_id','name','price_delta','active','sort_order'],
};
export const FIELD_NAMES = {name:'Nombre',category_id:'Categoría',description:'Descripción',base_price:'Precio base',image_url:'Imagen',active:'Disponible',sort_order:'Orden',product_id:'Producto',min_select:'Mínimo',max_select:'Máximo',price_delta:'Recargo',group_id:'Grupo',customizable:'Personalizable',required:'Obligatorio'};
export const KIND_NAMES = {categories:'Categoría',products:'Producto',groups:'Grupo de cambios',options:'Opción'};
export const newId = () => crypto.randomUUID();
export function catalogRow(kind, row) {
  return Object.fromEntries(CATALOG_FIELDS[kind].map(key => [key,
    key==='active' ? row[key]!==false : ['description','image_url','category_id'].includes(key) ? row[key] ?? null : row[key]]));
}
export function copyCatalog(data) {
  return Object.fromEntries(Object.keys(CATALOG_FIELDS).map(kind=>[kind,(data[kind]||[]).map(row=>catalogRow(kind,row))]));
}
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
export function catalogPatch(current,draft) {
  const changes={},expected={},details=[];
  for(const kind of Object.keys(CATALOG_FIELDS)) {
    changes[kind]=[]; expected[kind]={};
    const existing=new Map(current[kind].map(row=>[row.id,catalogRow(kind,row)]));
    for(const raw of draft[kind]) {
      const row=catalogRow(kind,raw),before=existing.get(row.id);
      if(!same(before,row)) {
        changes[kind].push(row);expected[kind][row.id]=before||null;
        const fields=CATALOG_FIELDS[kind].filter(key=>key!=='id'&&!same(before?.[key],row[key]));
        details.push({kind,id:row.id,name:row.name,isNew:!before,fields,before,after:row});
      }
    }
  }
  return {changes,expected,details};
}
function integer(value,label,max=1000000000) {
  if(!Number.isSafeInteger(value)||value<0||value>max)throw Error(`${label}: usa un número entero entre 0 y ${max}.`);
}
export function validateCatalog(data) {
  for(const kind of Object.keys(CATALOG_FIELDS)) {
    const ids=new Set();
    for(const row of data[kind]) {
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)||ids.has(row.id))throw Error(`${KIND_NAMES[kind]}: código inválido o repetido.`);
      ids.add(row.id);
      if(typeof row.name!=='string'||!row.name.trim()||row.name.length>150)throw Error(`${KIND_NAMES[kind]}: el nombre es obligatorio (máximo 150 caracteres).`);
      integer(row.sort_order,`${row.name}: orden`,100000);
      if(typeof row.active!=='boolean')throw Error(`${row.name}: disponibilidad inválida.`);
    }
  }
  const categories=new Set(data.categories.map(x=>x.id)),products=new Map(data.products.map(x=>[x.id,x])),groups=new Map(data.groups.map(x=>[x.id,x]));
  const names=new Set();
  for(const c of data.categories){const key=c.name.trim().toLocaleLowerCase('es');if(names.has(key))throw Error(`Categoría repetida: ${c.name}.`);names.add(key);}
  for(const p of data.products) {
    if(p.category_id&&!categories.has(p.category_id))throw Error(`${p.name}: categoría inexistente.`);
    if(p.active&&!p.category_id)throw Error(`${p.name}: elige una categoría para mostrarlo en la carta.`);
    integer(p.base_price,`${p.name}: precio`);
    if((p.description||'').length>2000)throw Error(`${p.name}: descripción demasiado larga.`);
    if(p.image_url){try{if(new URL(p.image_url).protocol!=='https:')throw Error();}catch{throw Error(`${p.name}: la imagen debe usar una URL HTTPS.`);}}
  }
  for(const g of data.groups) {
    if(!products.has(g.product_id))throw Error(`${g.name}: producto inexistente.`);
    integer(g.min_select,`${g.name}: mínimo`,100);integer(g.max_select,`${g.name}: máximo`,100);
    if(g.max_select<g.min_select||g.max_select<1)throw Error(`${g.name}: el máximo debe ser al menos 1 y no menor al mínimo.`);
    if(g.active&&products.get(g.product_id).active&&data.options.filter(o=>o.group_id===g.id).length<g.min_select)throw Error(`${g.name}: faltan opciones para el mínimo exigido.`);
  }
  for(const o of data.options){if(!groups.has(o.group_id))throw Error(`${o.name}: grupo inexistente.`);integer(o.price_delta,`${o.name}: recargo`);}
  return data;
}

// Merge only fields the user edited in Excel. Untouched cells never overwrite newer data.
export function mergeCatalogImport(current, baseline, imported) {
  const result=copyCatalog(current),conflicts=[];
  for(const kind of Object.keys(CATALOG_FIELDS)) {
    const originals=new Map(baseline[kind].map(row=>[row.id,catalogRow(kind,row)]));
    for(const raw of imported[kind]) {
      const row=catalogRow(kind,raw),base=originals.get(row.id),now=result[kind].find(x=>x.id===row.id);
      if(!base){if(now)throw Error(`${row.name}: código existente sin referencia original. Exporta otra vez.`);result[kind].push(row);continue;}
      if(!now)throw Error(`${row.name}: ya no existe. Exporta la carta actual.`);
      for(const field of CATALOG_FIELDS[kind].filter(k=>k!=='id')) {
        if(same(base[field],row[field]))continue;
        if(!same(now[field],base[field])&&!same(now[field],row[field]))conflicts.push(`${KIND_NAMES[kind]} ${row.name}: ${FIELD_NAMES[field]}`);
        else now[field]=row[field];
      }
    }
  }
  if(conflicts.length)throw Error(`La carta cambió después de exportar. Revisa estos campos y exporta de nuevo:\n${conflicts.slice(0,15).join('\n')}`);
  // These flags describe the configured groups; they are not independent editable prices.
  for(const g of result.groups)g.required=g.min_select>0;
  for(const p of result.products)p.customizable=result.groups.some(g=>g.product_id===p.id&&g.active);
  return validateCatalog(result);
}
