import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredGroups, pricedUnit, cartSubtotal} from '../builder.js';
const product={id:'handroll',name:'Handroll XL',base_price:5800};
const groups=[{id:'protein',product_id:'handroll',name:'Proteína',min_select:1,max_select:1,sort_order:0},{id:'extra',product_id:'handroll',name:'Extra',min_select:0,max_select:1,sort_order:1}];
const options=[{id:'salmon',group_id:'protein',name:'Salmón',price_delta:700,active:true,sort_order:0},{id:'pollo',group_id:'protein',name:'Pollo',price_delta:0,active:false,sort_order:1},{id:'shrimp',group_id:'extra',name:'Camarón',price_delta:1300,active:true,sort_order:0}];
const configured=configuredGroups(product.id,groups,options);
test('a mixed cart keeps distinct handroll choices and computes extras',()=>{
 const salmon=pricedUnit(product,configured,{protein:['salmon'],extra:['shrimp']},'sin salsa');
 const plain=pricedUnit(product,configured,{protein:['salmon'],extra:[]});
 assert.equal(salmon.price,7800);assert.equal(plain.price,6500);assert.equal(cartSubtotal([salmon,plain]),14300);
 assert.deepEqual(salmon.options.map(x=>x.option_id),['salmon','shrimp']);
});
test('required, duplicate and unavailable choices cannot be charged',()=>{
 assert.throws(()=>pricedUnit(product,configured,{protein:[],extra:[]}),/Revisa Proteína/);
 assert.throws(()=>pricedUnit(product,configured,{protein:['salmon','salmon'],extra:[]}),/Revisa Proteína/);
 assert.throws(()=>pricedUnit(product,configured,{protein:['pollo'],extra:[]}),/Revisa Proteína/);
});
