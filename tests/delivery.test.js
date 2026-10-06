import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {DEFAULT_DELIVERY_CONFIG,deliveryBand,validPoint,pointFromText,courierPaySummary} from '../delivery-model.js';
import {quoteHandler} from '../supabase/functions/delivery-quote/handler.js';
test('delivery bands use exact boundaries and separate customer fees from courier pay',()=>{
 for(const [m,pay] of [[0,1000],[2999,1000],[3000,1500],[4999,1500],[5000,2000],[8000,2000]]){const b=deliveryBand(m,DEFAULT_DELIVERY_CONFIG);assert.equal(b.courier_pay,pay);assert.equal(b.customer_fee,0);}
 assert.equal(deliveryBand(4000,{...DEFAULT_DELIVERY_CONFIG,mid_pay:1800,mid_fee:600}).customer_fee,600);
 assert.throws(()=>deliveryBand(0,{...DEFAULT_DELIVERY_CONFIG,far_km:2}));assert.throws(()=>deliveryBand(-1,DEFAULT_DELIVERY_CONFIG));
});
test('points validate coordinates and completed delivery totals group by courier without cash assumptions',()=>{
 assert.equal(validPoint({lat:100,lng:0}),false);assert.deepEqual(pointFromText('-33.0, -71.0'),{lat:-33,lng:-71});assert.equal(pointFromText('calle sin número'),null);
 assert.deepEqual(courierPaySummary([{courier_id:'a',courier_name:'A',courier_pay:1000,distance_m:2000},{courier_id:'a',courier_name:'A',courier_pay:1500,distance_m:4000}]),[{id:'a',name:'A',count:2,pay:2500,distance:6000}]);
 assert.equal(readFileSync(new URL('../delivery-model.js',import.meta.url),'utf8'),readFileSync(new URL('../supabase/functions/delivery-quote/model.js',import.meta.url),'utf8'));
});
function setup({role='cashier',slot=true}={}){
 const calls=[],cache=new Map(),quotes=[];
 const caller={auth:{getUser:async()=>({data:{user:{id:'staff'}}})},from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='profiles'?{role,active:true}:{delivery_origin_lat:0,delivery_origin_lng:0,delivery_config:DEFAULT_DELIVERY_CONFIG}})})})})};
 const admin={rpc:async()=>({data:slot}),from:table=>({select:()=>({eq:(_,key)=>({maybeSingle:async()=>({data:cache.get(key)||null})})}),upsert:async row=>{cache.set(row.cache_key,row);return {};},insert:row=>({select:()=>({single:async()=>{quotes.push(row);return {data:{id:'quote-id',expires_at:new Date(Date.now()+1200000).toISOString()}};}})})})};
 const handler=quoteHandler({appUrl:'https://app.test',allowedOrigins:['https://app.test'],photonUrl:'https://geocoder.test/api/',osrmUrl:'https://router.test/car',createClients:()=>({caller,admin}),fetchImpl:async url=>{calls.push(url.toString());return {ok:true,json:async()=>url.hostname==='geocoder.test'?{features:[{properties:{street:'Calle de prueba',housenumber:'123',city:'Ciudad de prueba'},geometry:{coordinates:[0.01,0.01]}}]}:{code:'Ok',routes:[{distance:4000}],waypoints:[{distance:0},{distance:2}]}};}});
 const request=(body,headers={authorization:'Bearer staff',origin:'https://app.test'})=>handler(new Request('https://app.test',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));return {request,calls,quotes};
}
const body={action:'quote',address:'DOMICILIO_SIMULADO_123',point:{lat:.01,lng:.01},confirmed:true};
test('route quote uses server origin and prices; omits customer identity from external lookup',async()=>{
 const s=setup();const r=await s.request({...body,customer_name:'NEVER-SEND',phone:'NEVER-SEND',distance_m:1,courier_pay:1});assert.equal(r.status,200);const q=await r.json();assert.equal(q.distance_m,4000);assert.equal(q.courier_pay,1500);assert.equal(q.customer_fee,0);assert.equal(s.quotes[0].user_id,'staff');assert.ok(!s.calls.join('').includes('NEVER-SEND'));assert.ok(!s.calls.join('').includes(body.address));assert.ok(s.calls[0].includes('0.000000,0.000000;0.010000,0.010000'));
});
test('geocoding is user-triggered and cached, while route quotes remain distinct and single-use server records',async()=>{
 const s=setup();for(let i=0;i<2;i++){const r=await s.request({action:'geocode',address:'DOMICILIO_SIMULADO_123'});assert.equal(r.status,200);assert.equal((await r.json()).candidates[0].precise,true);}assert.equal(s.calls.length,1);
 await s.request(body);await s.request(body);assert.equal(s.calls.length,2);assert.equal(s.quotes.length,2);
});
test('anonymous, workers, unconfirmed points and rate-limited lookups never get a quote',async()=>{
 const anon=setup();assert.equal((await anon.request(body,{})).status,401);assert.equal(anon.calls.length,0);
 const worker=setup({role:'worker'});assert.equal((await worker.request(body)).status,403);assert.equal(worker.calls.length,0);
 const unconfirmed=setup();assert.equal((await unconfirmed.request({...body,confirmed:false})).status,400);assert.equal(unconfirmed.calls.length,0);
 const limit=setup({slot:false});assert.equal((await limit.request(body)).status,429);assert.equal(limit.calls.length,0);
});
