import {copyCatalog,mergeCatalogImport,newId} from './catalog-model.js';

const SPECS={
  categories:{sheet:'Categorias',headers:['Codigo','Categoria','Orden','Disponible'],widths:[38,30,12,15]},
  products:{sheet:'Productos',headers:['Codigo','Categoria','Producto','Descripcion','Precio base','Disponible','Orden','Imagen URL'],widths:[38,30,38,65,18,15,12,45]},
  groups:{sheet:'Cambios',headers:['Codigo grupo','Codigo producto','Producto (referencia)','Grupo de cambios','Minimo','Maximo','Orden','Habilitado'],widths:[38,38,38,35,12,12,12,15]},
  options:{sheet:'Opciones',headers:['Codigo opcion','Codigo grupo','Grupo (referencia)','Opcion','Recargo','Disponible','Orden'],widths:[38,38,35,38,18,15,12]},
};
const yes=v=>v?'Sí':'No';
async function Excel(){const module=await import('exceljs');return module.default;}
export async function exportCatalogExcel(catalog,{project,businessName='Mi negocio'}) {
  const ExcelJS=await Excel(),wb=new ExcelJS.Workbook(),data=copyCatalog(catalog);
  wb.creator=businessName;wb.created=new Date();
  const instructions=wb.addWorksheet('Instrucciones');
  instructions.columns=[{width:28},{width:105}];
  instructions.addRows([
    ['Carta editable',businessName],['Uso','Edita las hojas y guarda como .xlsx. En Carta → Importar Excel, revisa los cambios y confirma.'],
    ['Precios y recargos','Usa pesos enteros, sin símbolos ni separadores. Recargo 0 = incluido; un número mayor a 0 se suma al precio base.'],
    ['Productos y tablas','Puedes cambiar nombre, descripción/composición, categoría, precio, disponibilidad, orden e imagen HTTPS.'],
    ['Cambios','Cada grupo pertenece a un producto. Mínimo 0 = opcional; mínimo 1 o más = obligatorio. Máximo limita la cantidad de opciones distintas.'],
    ['Opciones','Escribe cambios explícitos, por ejemplo: Cambiar pollo por salmón. Configura su recargo y grupo.'],
    ['Nuevos registros','Agrega una fila. Para enlazar un producto nuevo con cambios, usa un código propio como NUEVO-P1 y un grupo como NUEVO-G1; repítelos en las hojas relacionadas.'],
    ['Codigos existentes','Conserva los códigos de registros existentes. En Productos, la categoría se elige escribiendo su nombre.'],
    ['Retirar de la carta','Usa Disponible = No o Habilitado = No. Borrar una fila del Excel no elimina datos de la app.'],
    ['Referencia','La hoja oculta Referencia permite detectar ediciones hechas después de exportar. Consérvala. Las fórmulas no se importan; pega sus resultados como valores.'],
    ['Pedidos anteriores','Los cambios afectan pedidos nuevos. Los pedidos registrados conservan sus precios y opciones.'],
  ]);
  instructions.getRow(1).font={bold:true,size:16,color:{argb:'FF123E43'}};
  instructions.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};row.height=44;});
  for(const [kind,spec] of Object.entries(SPECS)) {
    const ws=wb.addWorksheet(spec.sheet,{views:[{state:'frozen',ySplit:1}]});
    ws.columns=spec.headers.map((header,i)=>({header,width:spec.widths[i]}));
    for(const row of data[kind]) {
      let values;
      if(kind==='categories')values=[row.id,row.name,row.sort_order,yes(row.active)];
      if(kind==='products')values=[row.id,data.categories.find(c=>c.id===row.category_id)?.name||'',row.name,row.description||'',row.base_price,yes(row.active),row.sort_order,row.image_url||''];
      if(kind==='groups')values=[row.id,row.product_id,data.products.find(p=>p.id===row.product_id)?.name||'',row.name,row.min_select,row.max_select,row.sort_order,yes(row.active)];
      if(kind==='options')values=[row.id,row.group_id,data.groups.find(g=>g.id===row.group_id)?.name||'',row.name,row.price_delta,yes(row.active),row.sort_order];
      ws.addRow(values);
    }
    ws.autoFilter={from:'A1',to:{row:Math.max(1,ws.rowCount),column:spec.headers.length}};
    ws.getRow(1).height=32;ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF174E53'}};
    ws.eachRow((row,n)=>{row.alignment={vertical:'top',wrapText:true};if(n>1){row.height=42;row.getCell(1).font={color:{argb:'FF657477'},size:10};}});
    const statusColumn={categories:4,products:6,groups:8,options:6}[kind];
    const validationLastRow=Math.max(ws.rowCount+100,200);
    for(let n=2;n<=validationLastRow;n++)ws.getCell(n,statusColumn).dataValidation={type:'list',allowBlank:true,formulae:['"Sí,No"']};
    if(kind==='products')ws.getColumn(5).numFmt='"$"#,##0';
    if(kind==='options')ws.getColumn(5).numFmt='"$"#,##0';
  }
  const reference=wb.addWorksheet('Referencia',{state:'veryHidden'});
  reference.addRow(['rame-carta-v1',project]);
  for(const kind of Object.keys(SPECS))for(const row of data[kind])reference.addRow([kind,row.id,JSON.stringify(row)]);
  return wb.xlsx.writeBuffer();
}
function cellValue(cell,label) {
  const v=cell.value;
  if(v&&typeof v==='object') {
    if('formula' in v||'sharedFormula' in v)throw Error(`${label}: pega el resultado de la fórmula como valor.`);
    if(v.richText)return v.richText.map(x=>x.text).join('');
    if('text' in v)return v.text;
    throw Error(`${label}: tipo de celda no admitido.`);
  }
  return v??'';
}
const text=v=>String(v??'').trim();
function num(v,label,defaultValue) {
  if(v===''&&defaultValue!==undefined)return defaultValue;
  if((typeof v!=='number'&&!/^\d+$/.test(text(v)))||!Number.isSafeInteger(Number(v)))throw Error(`${label}: escribe pesos o cantidades enteras, sin símbolos ni separadores.`);
  return Number(v);
}
function bool(v,label) {
  if(v==='')return true;
  if(typeof v==='boolean')return v;
  const t=text(v).toLocaleLowerCase('es');
  if(['sí','si','true','1'].includes(t))return true;
  if(['no','false','0'].includes(t))return false;
  throw Error(`${label}: usa Sí o No.`);
}
export async function importCatalogExcel(buffer,current,{project}) {
  if(buffer.byteLength>5*1024*1024)throw Error('El archivo supera 5 MB. Exporta la carta desde la aplicación.');
  const ExcelJS=await Excel(),wb=new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ref=wb.getWorksheet('Referencia');
  if(!ref||ref.getCell('A1').value!=='rame-carta-v1'||ref.getCell('B1').value!==project)throw Error('Usa un Excel exportado desde la carta de este negocio y conserva la hoja Referencia.');
  if(ref.rowCount>3001)throw Error('La referencia supera el límite de registros.');
  const baseline={categories:[],products:[],groups:[],options:[]};
  ref.eachRow((row,n)=>{if(n===1)return;const kind=row.getCell(1).value;if(!baseline[kind])throw Error('Referencia inválida.');const item=JSON.parse(row.getCell(3).value);if(item.id!==row.getCell(2).value)throw Error('Referencia inválida.');baseline[kind].push(item);});
  const rows={},maps={},imported={};let count=0;
  for(const [kind,spec] of Object.entries(SPECS)) {
    const ws=wb.getWorksheet(spec.sheet);if(!ws)throw Error(`Falta la hoja ${spec.sheet}.`);
    spec.headers.forEach((header,i)=>{if(ws.getRow(1).getCell(i+1).value!==header)throw Error(`${spec.sheet}: conserva los encabezados de la exportación.`);});
    if(ws.rowCount>3001)throw Error(`${spec.sheet}: demasiadas filas.`);
    rows[kind]=[];maps[kind]=new Map(current[kind].map(r=>[r.id,r.id]));const seen=new Set();
    ws.eachRow((row,n)=>{
      if(n===1)return;
      const values=spec.headers.map((h,i)=>cellValue(row.getCell(i+1),`${spec.sheet}, fila ${n}, ${h}`));
      if(values.every(v=>v===''))return;
      if(++count>3000)throw Error('El archivo supera 3000 registros.');
      const code=text(values[0]);if(code&&seen.has(code))throw Error(`${spec.sheet}, fila ${n}: código repetido.`);if(code)seen.add(code);
      if(code&&baseline[kind].some(r=>r.id===code)&&!maps[kind].has(code))throw Error(`${spec.sheet}, fila ${n}: el registro ya no existe. Exporta de nuevo.`);
      const id=maps[kind].get(code)||newId();if(code)maps[kind].set(code,id);
      rows[kind].push({values,id,label:`${spec.sheet}, fila ${n}`});
    });
  }
  imported.categories=rows.categories.map(({values:v,id,label:l})=>({id,name:text(v[1]),sort_order:num(v[2],l,0),active:bool(v[3],l)}));
  const categoryNames=new Map();
  for(const c of [...current.categories,...baseline.categories,...imported.categories]) {
    const key=c.name.trim().toLocaleLowerCase('es'),existing=categoryNames.get(key);
    if(existing&&existing!==c.id)throw Error(`Nombre de categoría ambiguo: ${c.name}. Usa nombres diferentes.`);
    categoryNames.set(key,c.id);
  }
  const resolve=(kind,code,label)=>{const id=maps[kind].get(text(code));if(!id)throw Error(`${label}: código relacionado no encontrado (${text(code)}).`);return id;};
  imported.products=rows.products.map(({values:v,id,label:l})=>{
    const category=text(v[1]),category_id=category?categoryNames.get(category.toLocaleLowerCase('es')):null;
    if(category&&!category_id)throw Error(`${l}: categoría no encontrada (${category}). Agrégala en Categorias.`);
    return {id,category_id,name:text(v[2]),description:text(v[3])||null,base_price:num(v[4],l),active:bool(v[5],l),sort_order:num(v[6],l,0),image_url:text(v[7])||null,customizable:baseline.products.find(p=>p.id===id)?.customizable||false};
  });
  imported.groups=rows.groups.map(({values:v,id,label:l})=>({id,product_id:resolve('products',v[1],l),name:text(v[3]),min_select:num(v[4],l),max_select:num(v[5],l),sort_order:num(v[6],l,0),active:bool(v[7],l),required:num(v[4],l)>0}));
  imported.options=rows.options.map(({values:v,id,label:l})=>({id,group_id:resolve('groups',v[1],l),name:text(v[3]),price_delta:num(v[4],l),active:bool(v[5],l),sort_order:num(v[6],l,0)}));
  return mergeCatalogImport(current,copyCatalog(baseline),imported);
}

export function downloadExcel(buffer,name) {
  const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
