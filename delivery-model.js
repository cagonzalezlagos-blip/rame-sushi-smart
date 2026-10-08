export const DEFAULT_DELIVERY_CONFIG=Object.freeze({near_km:3,far_km:5,near_pay:1000,mid_pay:1500,far_pay:2000,near_fee:0,mid_fee:0,far_fee:0});
export const RAME_DELIVERY_CONFIG=Object.freeze({bands:[3,4,5,6,7,8,9].map((max_km,i)=>({max_km,courier_pay:1000+i*500,customer_fee:1000+i*500}))});
export function deliveryTiers(c){
 if(Array.isArray(c?.bands))return c.bands.map(b=>({...b}));
 return [{max_km:c?.near_km,courier_pay:c?.near_pay,customer_fee:c?.near_fee},{max_km:c?.far_km,courier_pay:c?.mid_pay,customer_fee:c?.mid_fee},{max_km:null,courier_pay:c?.far_pay,customer_fee:c?.far_fee}];
}
export function validateDeliveryConfig(c){
 const bands=deliveryTiers(c);if(!c||bands.length<1||bands.length>30)throw Error('Configura entre 1 y 30 tramos.');
 let previous=0;
 for(const [index,b] of bands.entries()){
  if(b.max_km===null){if(index!==bands.length-1)throw Error('Solo el último tramo puede quedar sin límite.');}
  else if(!Number.isFinite(b.max_km)||b.max_km<=previous||b.max_km>100)throw Error('Los límites deben aumentar y no superar 100 km.');
  for(const key of ['courier_pay','customer_fee'])if(!Number.isSafeInteger(b[key])||b[key]<0||b[key]>1000000)throw Error('Los montos deben ser enteros entre $0 y $1.000.000.');
  previous=b.max_km;
 }
 return c;
}
export function deliveryBand(distance,c){
 validateDeliveryConfig(c);if(!Number.isFinite(distance)||distance<0||distance>100000)throw Error('Distancia inválida.');
 const bands=deliveryTiers(c);let from=0;
 for(const [i,b] of bands.entries()){
  if(b.max_km===null||distance<b.max_km*1000||(i===bands.length-1&&distance===b.max_km*1000))return {courier_pay:b.courier_pay,customer_fee:b.customer_fee,band_label:b.max_km===null?`${from} km o más`:`${from} a ${b.max_km} km`};
  from=b.max_km;
 }
 const error=Error('La distancia supera los tramos configurados. Ingresa una tarifa manual.');error.code='DELIVERY_OUTSIDE_BANDS';throw error;
}
export function validPoint(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;}
export function pointFromText(text){
 const input=String(text??'').trim();let value=input;
 if(/^https?:\/\//i.test(input)){
  let url;try{url=new URL(input);}catch{return null;}
  if(!/^(?:www\.)?(?:google\.[a-z.]+|maps\.google\.[a-z.]+)$/.test(url.hostname))return null;
  let decoded;try{decoded=decodeURIComponent(url.href);}catch{return null;}const pairs=[...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if(pairs.length===1)value=pairs[0][1]+','+pairs[0][2];
  else if(pairs.length>1)return null;
  else value=url.searchParams.get('query')||url.searchParams.get('q')||'';
 }
 const match=value.match(/^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/);if(!match)return null;const p={lat:Number(match[1]),lng:Number(match[2])};return validPoint(p)?p:null;
}

export function courierPaySummary(rows){const byCourier=new Map();for(const r of rows){const x=byCourier.get(r.courier_id)||{id:r.courier_id,name:r.courier_name,count:0,pay:0,distance:0};x.count++;x.pay+=Number(r.courier_pay||0);x.distance+=Number(r.distance_m||0);byCourier.set(x.id,x);}return [...byCourier.values()];}
