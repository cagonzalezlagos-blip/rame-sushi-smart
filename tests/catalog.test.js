import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {copyCatalog,catalogPatch,validateCatalog,mergeCatalogImport} from '../catalog-model.js';
import {exportCatalogExcel,importCatalogExcel} from '../catalog-excel.js';
import {configuredGroups,pricedUnit,repriceCart} from '../builder.js';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={project:'rame-test',businessName:'Ramé Sushi'};
function fixture(){return {
 categories:[{id:id(1),name:'Tablas',sort_order:0,active:true}],
 products:[{id:id(2),category_id:id(1),name:'20 HOT',description:'Pollo queso palta',base_price:11200,image_url:null,customizable:true,active:true,sort_order:0}],
 groups:[{id:id(3),product_id:id(2),name:'Cambios de proteína',min_select:0,max_select:1,required:false,sort_order:0,active:true}],
 options:[{id:id(4),group_id:id(3),name:'Cambiar pollo por salmón',price_delta:700,active:true,sort_order:0}],
};}
async function workbook(data=fixture()){const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportCatalogExcel(data,context));return wb;}
const imported=(wb,current=fixture())=>wb.xlsx.writeBuffer().then(buffer=>importCatalogExcel(buffer,current,context));

test('Excel round trip preserves identifiers, typed prices and has no changes',async()=>{
 const original=fixture(),wb=await workbook(original);
 assert.equal(wb.getWorksheet('Productos').getCell('E2').value,11200);
 assert.equal(wb.getWorksheet('Opciones').getCell('E2').value,700);
 assert.equal(wb.getWorksheet('Referencia').state,'veryHidden');
 assert.equal(catalogPatch(original,await imported(wb,original)).details.length,0);
});
test('Excel updates prices, creates linked product changes and preserves omitted rows',async()=>{
 const wb=await workbook();
 wb.getWorksheet('Productos').getCell('E2').value=12000;
 wb.getWorksheet('Opciones').getCell('E2').value=900;
 wb.getWorksheet('Categorias').addRow(['NUEVA-C','Rolls',1,'Sí']);
 wb.getWorksheet('Productos').addRow(['NUEVO-P','Rolls','Roll personalizable','10 piezas',6000,'Sí',1,'']);
 wb.getWorksheet('Cambios').addRow(['NUEVO-G','NUEVO-P','','Proteína',1,1,0,'Sí']);
 wb.getWorksheet('Opciones').addRow(['NUEVA-O','NUEVO-G','','Pollo',0,'Sí',0]);
 const result=await imported(wb),product=result.products.find(p=>p.name==='Roll personalizable'),group=result.groups.find(g=>g.name==='Proteína');
 assert.equal(result.products.find(p=>p.id===id(2)).base_price,12000);
 assert.equal(result.options.find(o=>o.id===id(4)).price_delta,900);
 assert.equal(group.product_id,product.id);assert.equal(product.customizable,true);
 assert.equal(result.options.find(o=>o.name==='Pollo').group_id,group.id);
 const smaller=await workbook();smaller.getWorksheet('Opciones').getRow(2).values=[];
 assert.equal((await imported(smaller)).options.length,1);
});
test('stale Excel preserves untouched newer fields and blocks conflicting edited prices',async()=>{
 const wb=await workbook(),current=fixture();current.products[0].base_price=13000;
 wb.getWorksheet('Productos').getCell('D2').value='Nueva descripción';
 const merged=await imported(wb,current);
 assert.equal(merged.products[0].base_price,13000);assert.equal(merged.products[0].description,'Nueva descripción');
 wb.getWorksheet('Productos').getCell('E2').value=12000;
 await assert.rejects(imported(wb,current),/cambió después de exportar/);
});
test('category renames retain product references and archived groups are skipped',async()=>{
 const wb=await workbook();wb.getWorksheet('Categorias').getCell('B2').value='Tablas calientes';
 wb.getWorksheet('Cambios').getCell('H2').value='No';
 const result=await imported(wb);
 assert.equal(result.products[0].category_id,id(1));assert.equal(result.products[0].customizable,false);
 assert.deepEqual(configuredGroups(id(2),result.groups,result.options),[]);
});
test('Excel rejects formulas, negative surcharges, wrong references and duplicate codes',async()=>{
 let wb=await workbook();wb.getWorksheet('Productos').getCell('E2').value={formula:'10000+1000',result:11000};
 await assert.rejects(imported(wb),/fórmula/);
 wb=await workbook();wb.getWorksheet('Opciones').getCell('E2').value=-1;
 await assert.rejects(imported(wb),/recargo/i);
 wb=await workbook();wb.getWorksheet('Cambios').getCell('B2').value='NO-EXISTE';
 await assert.rejects(imported(wb),/relacionado no encontrado/);
 wb=await workbook();wb.getWorksheet('Productos').addRow(wb.getWorksheet('Productos').getRow(2).values.slice(1));
 await assert.rejects(imported(wb),/código repetido/);
 wb=await workbook();wb.getWorksheet('Referencia').getCell('B1').value='otro-local';
 await assert.rejects(imported(wb),/este negocio/);
});
test('a required group must have enough configured choices and a zero-price product stays unpriced',()=>{
 const data=fixture();data.groups[0].min_select=2;data.groups[0].max_select=1;
 assert.throws(()=>validateCatalog(data),/máximo/);
 data.groups[0].max_select=2;assert.throws(()=>validateCatalog(data),/faltan opciones/);
 const base=fixture();base.products[0].base_price=0;assert.equal(validateCatalog(base).products[0].base_price,0);
 assert.throws(()=>repriceCart([{product_id:id(2),name:'20 HOT',options:[],quantity:1}],base.products,base.categories,base.groups,base.options),/no está disponible/);
});
test('customer changes are charged once and a pending cart is repriced after catalog edits',()=>{
 const data=fixture(),configured=configuredGroups(id(2),data.groups,data.options);
 const item=pricedUnit(data.products[0],configured,{[id(3)]:[id(4)]},'Sin salsa');item.quantity=2;
 assert.equal(item.price,11900);
 data.options[0].price_delta=1000;
 const refreshed=repriceCart([item],data.products,data.categories,data.groups,data.options);
 assert.equal(refreshed[0].price,12200);assert.equal(refreshed[0].quantity,2);assert.equal(refreshed[0].notes,'Sin salsa');
 data.groups[0].active=false;assert.throws(()=>repriceCart([item],data.products,data.categories,data.groups,data.options),/cambios/);
});
test('patches contain only changed rows and an expected snapshot for atomic saves',()=>{
 const original=fixture(),draft=copyCatalog(original);draft.options[0].price_delta=1200;
 const patch=catalogPatch(original,draft);
 assert.equal(patch.details.length,1);assert.equal(patch.changes.products.length,0);
 assert.equal(patch.expected.options[id(4)].price_delta,700);
 assert.equal(patch.changes.options[0].price_delta,1200);
 assert.deepEqual(mergeCatalogImport(original,original,original),original);
});
