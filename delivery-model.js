export const DEFAULT_DELIVERY_CONFIG=Object.freeze({near_km:3,far_km:5,near_pay:1000,mid_pay:1500,far_pay:2000,near_fee:0,mid_fee:0,far_fee:0});
export function validateDeliveryConfig(c){
 if(!c||!Number.isFinite(c.near_km)||!Number.isFinite(c.far_km)||c.near_km<=0||c.far_km<=c.near_km||c.far_km>100)throw Error('Revisa los límites de kilómetros.');
 for(const key of ['near_pay','mid_pay','far_pay','near_fee','mid_fee','far_fee'])if(!Number.isSafeInteger(c[key])||c[key]<0||c[key]>1000000)throw Error('Los montos deben ser enteros entre $0 y $1.000.000.');return c;
}
export function deliveryBand(distance,c){
 validateDeliveryConfig(c);if(!Number.isFinite(distance)||distance<0||distance>100000)throw Error('Distancia inválida.');
 const tier=distance<c.near_km*1000?'near':distance<c.far_km*1000?'mid':'far';
 return {courier_pay:c[tier+'_pay'],customer_fee:c[tier+'_fee'],band_label:tier==='near'?`Menos de ${c.near_km} km`:tier==='mid'?`${c.near_km} a menos de ${c.far_km} km`:`${c.far_km} km o más`};
}
export function validPoint(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;}
export function pointFromText(text){const match=String(text).trim().match(/^(?:https:\/\/[^\s]*?@)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:,.*)?$/);if(!match)return null;const p={lat:Number(match[1]),lng:Number(match[2])};return validPoint(p)?p:null;}
export function courierPaySummary(rows){const byCourier=new Map();for(const r of rows){const x=byCourier.get(r.courier_id)||{id:r.courier_id,name:r.courier_name,count:0,pay:0,distance:0};x.count++;x.pay+=Number(r.courier_pay||0);x.distance+=Number(r.distance_m||0);byCourier.set(x.id,x);}return [...byCourier.values()];}
