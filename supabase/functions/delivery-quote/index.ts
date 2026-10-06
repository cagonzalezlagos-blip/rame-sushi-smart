import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {quoteHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const appUrl=Deno.env.get('APP_URL')||'https://rame-sushi-smart.vercel.app';
Deno.serve(quoteHandler({appUrl,allowedOrigins:[new URL(appUrl).origin,'https://rame-sushi-smart-01.vercel.app'],photonUrl:Deno.env.get('PHOTON_URL')||'https://photon.komoot.io/api/',osrmUrl:Deno.env.get('OSRM_URL')||'https://routing.openstreetmap.de/routed-car',createClients:(authorization:string)=>({caller:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}}),admin:createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})})}));
