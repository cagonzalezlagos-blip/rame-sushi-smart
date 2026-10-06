import {deliveryBand,validPoint} from './model.js';
const crowDistance=(a,b)=>{const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r,v=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v));};
export function quoteHandler({createClients,fetchImpl=fetch,appUrl,photonUrl,osrmUrl,allowedOrigins}){
 const json=(body,status,origin)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins.includes(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}});
 return async request=>{
  const origin=request.headers.get('origin')||'';
  if(origin&&!allowedOrigins.includes(origin))return json({error:'Origen no autorizado'},403,origin);
  if(request.method==='OPTIONS')return json({},200,origin);
  if(request.method!=='POST')return json({error:'Método no permitido'},405,origin);
  const authorization=request.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(authorization))return json({error:'Inicia sesión nuevamente'},401,origin);
  try{
   const {caller,admin}=createClients(authorization),{data:auth,error:authError}=await caller.auth.getUser();if(authError||!auth.user)return json({error:'Sesión vencida'},401,origin);
   const actor=await caller.from('profiles').select('role,active').eq('id',auth.user.id).single();if(actor.error||!actor.data?.active||!['owner','cashier'].includes(actor.data.role))return json({error:'Solo caja o administración puede calcular repartos'},403,origin);
   const {data:s,error:settingsError}=await caller.from('settings').select('delivery_config,delivery_origin_lat,delivery_origin_lng').eq('id',1).single();if(settingsError)throw settingsError;
   const start={lat:Number(s.delivery_origin_lat),lng:Number(s.delivery_origin_lng)};if(s.delivery_origin_lat===null||s.delivery_origin_lng===null||!validPoint(start))return json({error:'Administración debe confirmar el punto de salida en Configuración → Reparto y tarifas'},400,origin);
   const body=await request.json();
   async function cached(provider,url){
    const key=provider+':'+url.toString();const saved=await admin.from('delivery_lookup_cache').select('data,expires_at').eq('cache_key',key).maybeSingle();
    if(saved.error)throw saved.error;if(saved.data&&Date.parse(saved.data.expires_at)>Date.now())return saved.data.data;
    const slot=await admin.rpc('delivery_claim_provider_slot',{p_provider:provider});if(slot.error)throw slot.error;if(!slot.data){const error=Error('Espera dos segundos y vuelve a calcular.');error.status=429;throw error;}
    const response=await fetchImpl(url,{headers:{'User-Agent':'RameSushi/1.0 (+'+appUrl+')','Referer':appUrl},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('El proveedor de mapas no respondió. Intenta nuevamente.');const data=await response.json();
    const write=await admin.from('delivery_lookup_cache').upsert({cache_key:key,data,expires_at:new Date(Date.now()+7*86400000).toISOString()});if(write.error)throw write.error;return data;
   }
   if(body.action==='geocode'){
    const address=String(body.address||'').trim();if(address.length<6||address.length>250)return json({error:'Escribe calle, número y comuna, o ubica el domicilio en el mapa'},400,origin);
    const url=new URL(photonUrl);url.searchParams.set('q',address);url.searchParams.set('limit','5');url.searchParams.set('lat',String(start.lat));url.searchParams.set('lon',String(start.lng));
    const data=await cached('photon',url);
    const candidates=(data.features||[]).map(f=>{const p=f.properties||{},point={lat:Number(f.geometry?.coordinates?.[1]),lng:Number(f.geometry?.coordinates?.[0])};return {...point,label:[p.street||p.name,p.housenumber,p.city||p.district,p.state,p.country].filter(Boolean).join(', '),precise:!!p.housenumber};}).filter(p=>validPoint(p)&&crowDistance(start,p)<=100000);
    return json({candidates,origin:start},200,origin);
   }
   if(body.action!=='quote')return json({error:'Acción inválida'},400,origin);
   const end=body.point,address=String(body.address||'').trim();
   if(!validPoint(end)||address.length<6||address.length>250||body.confirmed!==true)return json({error:'Confirma el domicilio exacto en el mapa antes de calcular'},400,origin);
   if(crowDistance(start,end)>100000)return json({error:'El domicilio está a más de 100 km del local. Revisa el punto.'},400,origin);
   const coords=p=>Number(p.lng).toFixed(6)+','+Number(p.lat).toFixed(6);
   const url=new URL(osrmUrl.replace(/\/$/,'')+'/route/v1/driving/'+coords(start)+';'+coords(end));url.searchParams.set('overview','false');url.searchParams.set('steps','false');
   const data=await cached('osrm',url),route=data.routes?.[0];
   if(data.code!=='Ok'||!Number.isFinite(route?.distance)||route.distance>100000||data.waypoints?.some(w=>Number(w.distance)>250))return json({error:'No se encontró una ruta cercana al punto. Ajusta el domicilio en el mapa.'},400,origin);
   const distance=Math.round(route.distance),band=deliveryBand(distance,s.delivery_config);
   const quote={user_id:auth.user.id,address,lat:end.lat,lng:end.lng,origin_lat:start.lat,origin_lng:start.lng,distance_m:distance,...band,config_snapshot:s.delivery_config,provider:'OSRM / OpenStreetMap'};
   const saved=await admin.from('delivery_quotes').insert(quote).select('id,expires_at').single();if(saved.error)throw saved.error;
   return json({id:saved.data.id,expires_at:saved.data.expires_at,address,point:end,origin:start,distance_m:distance,...band,provider:quote.provider},200,origin);
  }catch(error){return json({error:error?.status===429?error.message:'No se pudo calcular el reparto. Revisa internet y vuelve a intentar; no se asignó una distancia ficticia.'},error?.status||400,origin);}
 };
}
