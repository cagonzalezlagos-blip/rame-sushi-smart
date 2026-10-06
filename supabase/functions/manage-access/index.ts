import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {accessHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const appUrl=Deno.env.get('APP_URL') || 'https://rame-sushi-smart.vercel.app';
const allowedOrigins=[new URL(appUrl).origin,'https://rame-sushi-smart-01.vercel.app'];
Deno.serve(accessHandler({appUrl,allowedOrigins,createClients:(authorization:string)=>({
 caller:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}}),
 admin:createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),
})}));
