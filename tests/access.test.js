import {test} from 'node:test';import assert from 'node:assert/strict';
import {accessHandler} from '../supabase/functions/manage-access/handler.js';
import {accessLanding,passwordIssue} from '../account-model.js';
const origin='https://rame-sushi-smart.vercel.app';
function setup(role='owner',active=true) {
 const calls=[],state={lookup:[],saveError:null};
 const caller={auth:{getUser:async()=>({data:{user:{id:'actor'}}}),resetPasswordForEmail:async(email,options)=>{calls.push(['recover',email,options]);return {}; }},
  from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role,active}})})}),insert:async(row)=>{calls.push(['profile',row]);return {error:state.saveError};}}),
  rpc:async(name)=>{calls.push(['rpc',name]);return {data:name==='owner_account_for_email'?state.lookup:[{id:'target',email:'person@example.com',active:true}]};}};
 const admin={auth:{admin:{createUser:async(payload)=>{calls.push(['create',payload]);return {data:{user:{id:'new'}}};},inviteUserByEmail:async(email,options)=>{calls.push(['invite',email,options]);return {data:{user:{id:'new'}}};},deleteUser:async(id)=>{calls.push(['cleanup',id]);return {};}}}};
 const handler=accessHandler({appUrl:origin,allowedOrigins:[origin],createClients:()=>({caller,admin})});
 const request=(body,headers={authorization:'Bearer session',origin})=>handler(new Request(origin,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
 return {request,calls,state};
}
const invite={action:'invite',email:'Person@example.com',full_name:'Trabajador prueba',role:'worker',hourly_rate:1200};
test('invitation endpoints reject anonymous, cashier and disabled owner before admin actions',async()=>{
 const anon=setup();assert.equal((await anon.request(invite,{})).status,401);assert.equal(anon.calls.length,0);
 for(const [role,active] of [['cashier',true],['owner',false]]){const s=setup(role,active);assert.equal((await s.request(invite)).status,403);assert.equal(s.calls.length,0);}
 const s=setup();assert.equal((await s.request(invite,{authorization:'Bearer x',origin:'https://evil.test'})).status,403);assert.equal(s.calls.length,0);
});
test('owner invites by email with fixed server redirect and profile write as caller',async()=>{
 const s=setup();assert.equal((await s.request({...invite,redirectTo:'https://evil.test'})).status,200);
 assert.deepEqual(s.calls.find(c=>c[0]==='invite'),['invite','person@example.com',{redirectTo:origin}]);
 assert.deepEqual(s.calls.find(c=>c[0]==='profile')[1],{id:'new',full_name:invite.full_name,role:'worker',hourly_rate:1200,active:true});
});
test('invalid roles and negative rates never create an account',async()=>{
 for(const changes of [{role:'root'},{hourly_rate:-1},{email:'not-email'}]){const s=setup();assert.equal((await s.request({...invite,...changes})).status,400);assert.equal(s.calls.length,0);}
});
test('existing profiles cannot be silently overwritten and existing auth accounts retain password',async()=>{
 const s=setup();s.state.lookup=[{id:'existing',has_profile:true}];assert.equal((await s.request(invite)).status,409);assert.ok(!s.calls.some(c=>c[0]==='profile'||c[0]==='invite'));
 s.state.lookup=[{id:'existing',has_profile:false}];assert.equal((await s.request(invite)).status,200);assert.ok(!s.calls.some(c=>c[0]==='invite'));assert.equal(s.calls.find(c=>c[0]==='profile')[1].id,'existing');
});
test('failed profile write never deletes an auth account involved in a concurrent invitation',async()=>{
 const s=setup();s.state.saveError={message:'row-level security'};assert.equal((await s.request(invite)).status,403);assert.ok(!s.calls.some(c=>c[0]==='cleanup'));
 const existing=setup();existing.state.lookup=[{id:'existing',has_profile:false}];existing.state.saveError={message:'row-level security'};await existing.request(invite);assert.ok(!existing.calls.some(c=>c[0]==='cleanup'));
});
test('admin recovery uses the saved email instead of a caller-supplied recipient',async()=>{
 const s=setup();assert.equal((await s.request({action:'recover',id:'target',email:'attacker@example.com'})).status,200);assert.deepEqual(s.calls.find(c=>c[0]==='recover'),['recover','person@example.com',{redirectTo:origin}]);
});
test('password landing distinguishes invite/recovery from regular login and validates confirmation',()=>{
 assert.equal(accessLanding({hash:'#type=recovery&access_token=hidden'}),true);assert.equal(accessLanding({hash:'#type=invite'}),true);assert.equal(accessLanding({hash:'#type=magiclink'}),false);
 assert.ok(passwordIssue('short','short'));assert.ok(passwordIssue('long password','mismatch'));assert.equal(passwordIssue('long password','long password'),'');
});

test('owner can provision initial password without email and never overwrite an existing password',async()=>{
 const s=setup();assert.equal((await s.request({...invite,action:'create',password:'initial-test-password'})).status,200);assert.ok(s.calls.some(c=>c[0]==='create'));assert.ok(!s.calls.some(c=>c[0]==='invite'));assert.ok(!('password' in s.calls.find(c=>c[0]==='profile')[1]));
 const existing=setup();existing.state.lookup=[{id:'existing',has_profile:false}];assert.equal((await existing.request({...invite,action:'create',password:'initial-test-password'})).status,200);assert.ok(!existing.calls.some(c=>c[0]==='create'));
 const invalid=setup();assert.equal((await invalid.request({...invite,action:'create',password:'short'})).status,400);assert.equal(invalid.calls.length,0);
});
