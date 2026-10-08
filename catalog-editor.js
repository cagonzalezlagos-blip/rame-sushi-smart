import {copyCatalog,catalogPatch,validateCatalog,newId,KIND_NAMES,FIELD_NAMES} from './catalog-model.js';

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v);
const ordered=rows=>[...rows].sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name,'es'));

export async function renderCatalogEditor({client,getCatalog,reload,businessName,project,onChanged,isCurrent=()=>true}) {
  const view=document.querySelector('#view');
  const status=message=>{const target=view.querySelector('#catalogStatus');if(target)target.textContent=message;};
  try{await reload();}catch(e){view.innerHTML='<p role="alert">No se pudo cargar la carta.</p>';return;}
  if(!view.isConnected||!isCurrent())return;
  const render=()=>{
    const current=copyCatalog(getCatalog());
    view.innerHTML=`<h1>Carta y personalización</h1><p>Edita tablas y productos y sus opciones habituales. Los cambios ocasionales se anotan directamente en cada pedido. Recargo 0 significa incluido; los demás se suman al precio base.</p><div class="actions"><button id="newProduct">Agregar producto o tabla</button><button id="editCategories" class="quiet">Categorías</button><button id="exportCatalog" class="quiet">Exportar Excel</button><button id="importCatalog" class="quiet">Importar Excel</button><input id="catalogFile" type="file" accept=".xlsx" hidden></div><p id="catalogStatus" role="status" aria-live="polite"></p><div class="catalog-filters"><label>Buscar<input id="catalogSearch" type="search" placeholder="Producto, tabla o ingrediente"></label><label>Categoría<select id="catalogCategory"><option value="">Todas</option>${ordered(current.categories).map(c=>`<option value="${c.id}">${escape(c.name)}</option>`).join('')}</select></label></div><div id="catalogList" class="catalog-list"></div><dialog id="catalogDialog" class="catalog-dialog"></dialog>`;
    const list=()=>{
      const q=view.querySelector('#catalogSearch').value.trim().toLocaleLowerCase('es'),category=view.querySelector('#catalogCategory').value;
      const filtered=ordered(current.products).filter(p=>(!category||p.category_id===category)&&`${p.name} ${p.description||''}`.toLocaleLowerCase('es').includes(q));
      view.querySelector('#catalogList').innerHTML=filtered.map(p=>`<article class="panel catalog-card"><h2>${escape(p.name)}</h2><small>${escape(current.categories.find(c=>c.id===p.category_id)?.name||'Sin categoría')} · ${p.active?'Disponible':'Oculto'}</small><p>${escape(p.description||'Sin descripción')}</p><b>${p.base_price?money(p.base_price):'Precio pendiente'}</b><p class="muted">${current.groups.filter(g=>g.product_id===p.id&&g.active).length} grupos de cambios o extras</p><div class="actions"><button data-edit-product="${p.id}">Editar</button><button class="quiet" data-copy-product="${p.id}">Duplicar</button></div></article>`).join('')||'<p>No hay productos para este filtro.</p>';
      view.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(current,b.dataset.editProduct));
      view.querySelectorAll('[data-copy-product]').forEach(b=>b.onclick=()=>editProduct(current,b.dataset.copyProduct,true));
    };
    view.querySelector('#catalogSearch').oninput=list;view.querySelector('#catalogCategory').onchange=list;list();
    view.querySelector('#newProduct').onclick=()=>editProduct(current);
    view.querySelector('#editCategories').onclick=()=>editCategories(current);
    view.querySelector('#exportCatalog').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;status('Preparando Excel…');
      try{await reload();const {exportCatalogExcel,downloadExcel}=await import('./catalog-excel.js');const buffer=await exportCatalogExcel(getCatalog(),{project,businessName});downloadExcel(buffer,'Carta-'+businessName.replace(/[^a-z0-9áéíóúñ]+/gi,'-')+'.xlsx');status('Excel descargado. Edita sus hojas y vuelve a importarlo para actualizar la carta.');}catch(e){status(e.message);}finally{button.disabled=false;}
    };
    view.querySelector('#importCatalog').onclick=()=>view.querySelector('#catalogFile').click();
    view.querySelector('#catalogFile').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      const importButton=view.querySelector('#importCatalog');importButton.disabled=true;
      try{
        if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>5*1024*1024)throw Error('Selecciona un archivo .xlsx de hasta 5 MB.');
        status('Leyendo y revisando Excel…');await reload();const fresh=copyCatalog(getCatalog());
        const {importCatalogExcel}=await import('./catalog-excel.js');
        const draft=await importCatalogExcel(await file.arrayBuffer(),fresh,{project});
        if(!isCurrent())return;
        const patch=catalogPatch(fresh,draft);status('');
        if(!patch.details.length){status('El Excel no contiene cambios.');return;}
        previewImport(patch);
      }catch(e){status(e.message);}finally{e.target.value='';importButton.disabled=false;}
    };
  };
  async function apply(patch,button,errorNode,dialog){
    if(!patch.details.length){dialog.close();return;}
    button.disabled=true;errorNode.textContent='Guardando…';
    const {error}=await client.rpc('owner_apply_catalog',{p_changes:patch.changes,p_expected:patch.expected});
    if(error){errorNode.textContent=error.message;button.disabled=false;return;}
    try{await reload();onChanged?.();dialog.close();if(isCurrent()){render();status('Carta actualizada. Los cambios se aplican a pedidos nuevos.');}}
    catch(e){errorNode.textContent='Los cambios se guardaron, pero no se pudo recargar. Vuelve a abrir Carta.';button.disabled=false;}
  }
  const input=(kind,id,field,value,type='text',extra='')=>`<input data-kind="${kind}" data-id="${id}" data-field="${field}" type="${type}" ${type==='checkbox'?(value?'checked':''):`value="${escape(value)}"`} ${extra}>`;
  function bindFields(dialog,draft){
    dialog.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{
      const row=draft[el.dataset.kind].find(r=>r.id===el.dataset.id);
      row[el.dataset.field]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?NaN:Number(el.value)):el.value;
    });
  }
  function editProduct(current,id=null,duplicate=false) {
    const draft=copyCatalog(current);let p=draft.products.find(p=>p.id===id);
    if(duplicate&&p){
      const source=p;p={...p,id:newId(),name:p.name+' (copia)',active:false};draft.products.push(p);
      for(const g of current.groups.filter(g=>g.product_id===source.id)){
        const copy={...g,id:newId(),product_id:p.id};draft.groups.push(copy);
        for(const o of current.options.filter(o=>o.group_id===g.id))draft.options.push({...o,id:newId(),group_id:copy.id});
      }
    }
    if(!p){p={id:newId(),name:'',category_id:ordered(current.categories).find(c=>c.active)?.id||null,description:null,base_price:0,image_url:null,customizable:false,active:true,sort_order:Math.max(0,...current.products.map(x=>x.sort_order))+1};draft.products.push(p);}
    const dialog=view.querySelector('#catalogDialog');
    const promoLines=[];
    const isPromo=()=>draft.categories.find(c=>c.id===p.category_id)?.name?.toLowerCase().includes('promo');
    const draw=()=>{
      dialog.innerHTML=`<div class="wizard-head"><h2>${id&&!duplicate?'Editar producto o tabla':'Nuevo producto o tabla'}</h2><button id="closeCatalog" type="button" class="quiet" aria-label="Cerrar">✕</button></div><form id="productForm"><div class="catalog-fields"><label>Nombre${input('products',p.id,'name',p.name,'text','required maxlength="150"')}</label><label>Categoría<select data-kind="products" data-id="${p.id}" data-field="category_id"><option value="">Sin categoría</option>${ordered(draft.categories).map(c=>`<option value="${c.id}" ${p.category_id===c.id?'selected':''}>${escape(c.name)}</option>`).join('')}</select></label><label>Precio base (CLP)${input('products',p.id,'base_price',p.base_price,'number','required min="0" max="1000000000" step="1"')}</label><label>Orden en la carta${input('products',p.id,'sort_order',p.sort_order,'number','required min="0" max="100000" step="1"')}</label></div><label>Descripción y composición<textarea data-kind="products" data-id="${p.id}" data-field="description" maxlength="2000" placeholder="Ej.: 20 piezas, pollo queso cebollín y kanikama queso palta">${escape(p.description)}</textarea></label><label>URL de imagen (HTTPS, opcional)${input('products',p.id,'image_url',p.image_url,'url','maxlength="2000"')}</label><label class="checkline">${input('products',p.id,'active',p.active,'checkbox')}Mostrar disponible en la carta</label>${draft.categories.find(c=>c.id===p.category_id)?.name?.toLowerCase().includes('promo')?`<div class="promo-guide"><strong>Configura tu promoción en 3 pasos</strong><p>1. Agrega los productos y cantidades. 2. Define el precio manual. 3. Crea las opciones y guarda.</p><button type="button" class="quiet" id="jumpToPromo">Armar promoción ↓</button></div>`:''}<section class="panel promo-config" id="promoConfigSection" ${isPromo()?'':'hidden'}><h3>Arma tu promoción</h3><p class="muted">Elige los productos y cantidades. El precio final es el que escribes arriba; los ingredientes permitidos comienzan sin recargo. Puedes ajustar recargos especiales después.</p><div class="promo-builder-row"><label>Producto de la carta<select id="promoSource"><option value="">Seleccionar producto</option>${ordered(current.products.filter(x=>x.id!==p.id&&x.active&&!draft.categories.find(c=>c.id===x.category_id)?.name?.toLowerCase().includes('promo'))).map(x=>`<option value="${x.id}">${escape(x.name)}</option>`).join('')}</select></label><label>Unidades<input id="promoCount" type="number" min="1" max="20" value="1"></label><button type="button" id="promoAddLine" class="quiet">+ Agregar a promoción</button></div><div id="promoLines">${promoLines.map((line,i)=>`<div class="promo-line"><strong>${escape(current.products.find(x=>x.id===line.id)?.name||'Producto')}</strong><span>${line.count} unidad(es)</span><button type="button" class="quiet" data-remove-promo="${i}">Quitar</button></div>`).join('')||'<p class="muted">Agrega uno o más productos para crear tu promoción.</p>'}</div><label class="checkline"><input id="promoKeepGroups" type="checkbox">Conservar los grupos anteriores (avanzado)</label><button type="button" id="promoGenerate">Crear opciones de esta promoción</button><p class="muted">Se creará una selección independiente por unidad. No se sumarán los precios individuales. Revisa el precio manual antes de guardar.</p></section><details id="promoAdvanced" ${isPromo()?'':'open'}><summary>${isPromo()?'Ajustar ingredientes y recargos (opcional)':'Cambios y extras para el pedido'}</summary><h3>Cambios y extras para el pedido</h3><p class="muted">Los cambios ocasionales, como pollo por palta, se ingresan en la preparación del producto al tomar el pedido. Usa estos grupos solo para opciones habituales. Mínimo 0 = opcional. Las opciones con recargo se suman al precio base.</p><div id="catalogGroups">${ordered(draft.groups.filter(g=>g.product_id===p.id&&(!isPromo()||g.active))).map(g=>`<section class="catalog-group ${g.active?'':'catalog-inactive'}"><div class="catalog-fields"><label>Grupo${input('groups',g.id,'name',g.name,'text','required maxlength="150"')}</label><label>Mínimo a elegir${input('groups',g.id,'min_select',g.min_select,'number','required min="0" max="100" step="1"')}</label><label>Máximo a elegir${input('groups',g.id,'max_select',g.max_select,'number','required min="1" max="100" step="1"')}</label><label>Orden${input('groups',g.id,'sort_order',g.sort_order,'number','required min="0" max="100000" step="1"')}</label></div><label class="checkline">${input('groups',g.id,'active',g.active,'checkbox')}Habilitar este grupo</label><div class="option-head"><b>Opción o cambio</b><b>Recargo (CLP)</b><b>Disponible</b><b>Orden</b></div>${ordered(draft.options.filter(o=>o.group_id===g.id)).map(o=>`<div class="catalog-option"><label class="option-field"><span class="mobile-label">Opción o cambio</span>${input('options',o.id,'name',o.name,'text','required maxlength="150" aria-label="Nombre de opción" placeholder="Ej.: cambiar pollo por salmón"')}</label><label class="option-field"><span class="mobile-label">Recargo (CLP)</span>${input('options',o.id,'price_delta',o.price_delta,'number','required min="0" max="1000000000" step="1" aria-label="Recargo en pesos"')}</label><label class="checkline">${input('options',o.id,'active',o.active,'checkbox')}<span class="mobile-label">Disponible</span></label><label class="option-field"><span class="mobile-label">Orden</span>${input('options',o.id,'sort_order',o.sort_order,'number','required min="0" max="100000" step="1" aria-label="Orden de opción"')}</label></div>`).join('')}<button type="button" class="quiet" data-new-option="${g.id}">Agregar opción</button></section>`).join('')||'<p>Este producto usa su preparación original. Agrega grupos para ofrecer cambios o extras.</p>'}</div><div class="actions"><button type="button" id="addGroup" class="quiet">Agregar grupo de cambios</button><label>Copiar grupos de otro producto<select id="copyGroups"><option value="">Seleccionar producto</option>${ordered(current.products.filter(x=>x.id!==p.id&&current.groups.some(g=>g.product_id===x.id&&g.active))).map(x=>`<option value="${x.id}">${escape(x.name)}</option>`).join('')}</select></label><button type="button" class="quiet" id="copyGroupsButton">Copiar</button></div></details><p id="catalogFormError" role="alert" class="catalog-error"></p><div class="wizard-actions"><button type="button" id="cancelCatalog" class="quiet">Cancelar</button><button id="saveProduct" type="submit">Guardar producto y cambios</button></div></form>`;
      bindFields(dialog,draft);
      dialog.querySelector('[data-kind="products"][data-field="category_id"]')?.addEventListener('change',()=>draw());
      dialog.querySelector('#jumpToPromo')?.addEventListener('click',()=>dialog.querySelector('#promoConfigSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
      dialog.querySelector('#closeCatalog').onclick=dialog.querySelector('#cancelCatalog').onclick=()=>dialog.close();
      dialog.querySelector('#addGroup').onclick=()=>{const g={id:newId(),product_id:p.id,name:'Cambios de ingredientes',min_select:0,max_select:1,required:false,sort_order:draft.groups.filter(x=>x.product_id===p.id).length,active:true};draft.groups.push(g);draft.options.push({id:newId(),group_id:g.id,name:'',price_delta:0,active:true,sort_order:0});draw();};
      dialog.querySelectorAll('[data-new-option]').forEach(b=>b.onclick=()=>{draft.options.push({id:newId(),group_id:b.dataset.newOption,name:'',price_delta:0,active:true,sort_order:draft.options.filter(o=>o.group_id===b.dataset.newOption).length});draw();});
      dialog.querySelector('#promoAddLine').onclick=()=>{
        const id=dialog.querySelector('#promoSource').value;
        const count=Number(dialog.querySelector('#promoCount').value);
        const error=dialog.querySelector('#catalogFormError');
        if(!id){error.textContent='Elige un producto de la carta.';return;}
        if(!Number.isInteger(count)||count<1||count>20){error.textContent='La cantidad debe estar entre 1 y 20.';return;}
        const existing=promoLines.find(x=>x.id===id);
        if(existing){if(existing.count+count>20){error.textContent='Máximo 20 unidades de cada producto.';return;}existing.count+=count;}
        else promoLines.push({id,count});
        draw();dialog.querySelector('#promoConfigSection')?.scrollIntoView({block:'start'});
      };
      dialog.querySelectorAll('[data-remove-promo]').forEach(b=>b.onclick=()=>{promoLines.splice(Number(b.dataset.removePromo),1);draw();dialog.querySelector('#promoConfigSection')?.scrollIntoView({block:'start'});});
      dialog.querySelector('#promoGenerate').onclick=()=>{
        const error=dialog.querySelector('#catalogFormError');
        if(!promoLines.length){error.textContent='Agrega al menos un producto a la promoción.';return;}
        const countGroups=promoLines.reduce((sum,line)=>sum+line.count*Math.max(1,current.groups.filter(g=>g.product_id===line.id&&g.active).length),0);
        if(countGroups>80){error.textContent='Demasiados grupos. Reduce las cantidades.';return;}
        const keep=dialog.querySelector('#promoKeepGroups').checked;
        if(!confirm(`Crear ${countGroups} grupo(s) para esta promoción? ${keep?'Se conservarán':'Se reemplazarán'} los grupos anteriores de este producto. Los recargos nuevos serán $0.`))return;
        if(!keep){
          for(const old of draft.groups.filter(g=>g.product_id===p.id))old.active=false;
        }
        for(const line of promoLines){
          const source=current.products.find(x=>x.id===line.id);
          if(!source)continue;
          const templates=current.groups.filter(g=>g.product_id===line.id&&g.active);
          for(let unit=1;unit<=line.count;unit++){
            const label=`${source.name} ${unit}`;
            if(!templates.length){
              const g={id:newId(),product_id:p.id,name:`${label} · Incluido`.slice(0,150),min_select:1,max_select:1,required:true,sort_order:draft.groups.filter(x=>x.product_id===p.id).length,active:true};
              draft.groups.push(g);
              draft.options.push({id:newId(),group_id:g.id,name:`${label}: ${source.name}`.slice(0,150),price_delta:0,active:true,sort_order:0});
            }else for(const g of templates){
              const copy={...g,id:newId(),product_id:p.id,name:`${label} · ${g.name}`.slice(0,150),sort_order:draft.groups.filter(x=>x.product_id===p.id).length};
              draft.groups.push(copy);
              for(const o of current.options.filter(o=>o.group_id===g.id&&o.active))draft.options.push({...o,id:newId(),group_id:copy.id,name:`${label}: ${o.name}`.slice(0,150),price_delta:0});
            }
          }
        }
        promoLines.length=0;
        draw();const advanced=dialog.querySelector('#promoAdvanced');if(advanced)advanced.open=true;advanced?.scrollIntoView({block:'start'});
      };
      dialog.querySelector('#copyGroupsButton').onclick=()=>{
        const source=dialog.querySelector('#copyGroups').value;if(!source)return;
        for(const g of current.groups.filter(g=>g.product_id===source&&g.active)){
          const copy={...g,id:newId(),product_id:p.id,sort_order:draft.groups.filter(x=>x.product_id===p.id).length};draft.groups.push(copy);
          for(const o of current.options.filter(o=>o.group_id===g.id))draft.options.push({...o,id:newId(),group_id:copy.id});
        }draw();
      };
      dialog.querySelector('#productForm').onsubmit=async e=>{
        e.preventDefault();const errorNode=dialog.querySelector('#catalogFormError');
        try{p.name=p.name.trim();p.category_id=p.category_id||null;p.description=p.description?.trim()||null;p.image_url=p.image_url?.trim()||null;for(const g of draft.groups){g.required=g.min_select>0;}p.customizable=draft.groups.some(g=>g.product_id===p.id&&g.active);validateCatalog(draft);await apply(catalogPatch(current,draft),e.submitter,errorNode,dialog);}catch(e){errorNode.textContent=e.message;}
      };
    };
    draw();dialog.showModal();
  }
  function editCategories(current){
    const draft=copyCatalog(current),dialog=view.querySelector('#catalogDialog');
    const draw=()=>{
      dialog.innerHTML=`<div class="wizard-head"><h2>Categorías de la carta</h2><button id="closeCatalog" type="button" class="quiet">Cerrar</button></div><form id="categoriesForm">${ordered(draft.categories).map(c=>`<div class="catalog-category"><label>Nombre${input('categories',c.id,'name',c.name,'text','required maxlength="150"')}</label><label>Orden${input('categories',c.id,'sort_order',c.sort_order,'number','required min="0" max="100000" step="1"')}</label><label class="checkline">${input('categories',c.id,'active',c.active,'checkbox')}Mostrar</label><button type="button" class="quiet" data-remove-category="${c.id}">${c.active?'Eliminar de la carta':'Recuperar categoría'}</button>${!c.active?'<small>Categoría retirada de la carta</small>':''}</div>`).join('')}<button type="button" id="addCategory" class="quiet">Agregar categoría</button><p id="catalogFormError" role="alert" class="catalog-error"></p><button id="saveCategories">Guardar categorías</button></form>`;
      bindFields(dialog,draft);dialog.querySelectorAll('[data-remove-category]').forEach(b=>b.onclick=()=>{const c=draft.categories.find(c=>c.id===b.dataset.removeCategory);if(c.active&&!confirm('¿Eliminar esta categoría de la carta? Sus productos dejarán de ofrecerse. Los pedidos anteriores se conservan.'))return;c.active=!c.active;draw();});dialog.querySelector('#closeCatalog').onclick=()=>dialog.close();
      dialog.querySelector('#addCategory').onclick=()=>{draft.categories.push({id:newId(),name:'',sort_order:Math.max(0,...draft.categories.map(c=>c.sort_order))+1,active:true});draw();};
      dialog.querySelector('#categoriesForm').onsubmit=async e=>{e.preventDefault();const error=dialog.querySelector('#catalogFormError');try{draft.categories.forEach(c=>c.name=c.name.trim());validateCatalog(draft);await apply(catalogPatch(current,draft),e.submitter,error,dialog);}catch(e){error.textContent=e.message;}};
    };draw();dialog.showModal();
  }
  function previewImport(patch){
    const dialog=view.querySelector('#catalogDialog');
    const before=copyCatalog(getCatalog()),after=copyCatalog(before);
    for(const [kind,rows] of Object.entries(patch.changes))for(const row of rows){const index=after[kind].findIndex(x=>x.id===row.id);if(index<0)after[kind].push(row);else after[kind][index]=row;}
    const show=(field,value,catalog)=>{
      const relation={category_id:'categories',product_id:'products',group_id:'groups'}[field];
      if(relation)return catalog[relation].find(x=>x.id===value)?.name||'Sin asignar';
      return field==='active'?(value?'Sí':'No'):typeof value==='boolean'?(value?'Sí':'No'):value??'—';
    };
    dialog.innerHTML=`<div class="wizard-head"><h2>Revisar importación de Excel</h2><button id="cancelImport" class="quiet">Cancelar</button></div><p>${patch.details.length} registros cambiarán. No se eliminarán filas ausentes del archivo.</p><div class="catalog-preview">${patch.details.map(d=>`<section class="catalog-group"><h3>${escape(KIND_NAMES[d.kind])}: ${escape(d.name)} ${d.isNew?'<span class="tag">Nuevo</span>':''}</h3>${d.fields.filter(f=>!['customizable','required'].includes(f)).map(f=>`<p><b>${escape(FIELD_NAMES[f])}:</b> ${d.isNew?'':`${escape(show(f,d.before[f],before))} → `}${escape(show(f,d.after[f],after))}</p>`).join('')}</section>`).join('')}</div><p id="importError" role="alert" class="catalog-error"></p><button id="confirmImport">Confirmar y guardar cambios</button>`;
    dialog.querySelector('#cancelImport').onclick=()=>dialog.close();
    dialog.querySelector('#confirmImport').onclick=e=>apply(patch,e.currentTarget,dialog.querySelector('#importError'),dialog);
    dialog.showModal();
  }
  render();
}
