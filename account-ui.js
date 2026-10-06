import {ACCESS_ROLES,passwordIssue,authErrorMessage} from './account-model.js';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderLogin({target,client,title,onLogin,initialMessage=''}) {
 target.innerHTML=`<main class="login panel"><h1>${title}</h1><p>Ingreso del personal</p><form id="login"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button>Ingresar</button></form><button id="forgotPassword" class="secondary">Olvidé mi contraseña</button><section id="recoveryBox" hidden><h2>Recuperar acceso</h2><p>Te enviaremos un enlace para elegir una nueva contraseña.</p><form id="recover"><label>Correo de tu cuenta<input name="email" type="email" autocomplete="email" required></label><button>Enviar enlace de recuperación</button></form></section><p id="notice" role="status">${safe(initialMessage)}</p></main>`;
 const message=target.querySelector('#notice'),form=target.querySelector('#login');
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;message.textContent='Ingresando…';try{
  const f=new FormData(form),{error}=await client.auth.signInWithPassword({email:f.get('email').trim(),password:f.get('password')});
  if(error) throw error;await onLogin();
 }catch(error){message.textContent=authErrorMessage(error);}finally{button.disabled=false;}};
 target.querySelector('#forgotPassword').onclick=()=>{target.querySelector('#recoveryBox').hidden=false;target.querySelector('#recover [name="email"]').value=form.elements.email.value;target.querySelector('#recover [name="email"]').focus();};
 const recover=target.querySelector('#recover');
 recover.onsubmit=async e=>{e.preventDefault();const button=recover.querySelector('button');button.disabled=true;message.textContent='Solicitando enlace…';try{
  const {error}=await client.auth.resetPasswordForEmail(recover.elements.email.value.trim(),{redirectTo:window.location.origin+'/'});
  if(error) throw error;message.textContent='Si el correo está registrado, recibirás un enlace. Revisa también Spam. Usa el mensaje más reciente.';
 }catch(error){message.textContent=authErrorMessage(error);}finally{button.disabled=false;}};
}
export function renderAccount({target,client,user,profile,recovery=false,onDone,onSignOut}) {
 target.innerHTML=`${recovery?'<main class="login panel">':''}<h1>${recovery?'Crear nueva contraseña':'Mi cuenta'}</h1><p>${safe(user.email)}</p>${!recovery?`<p>Perfil: <b>${safe(ACCESS_ROLES[profile?.role]?.name||'Personal')}</b></p>`:''}<section class="panel"><h2>${recovery?'Elige tu contraseña de acceso':'Cambiar contraseña'}</h2><form id="changePassword">${!recovery?'<label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label>':''}<label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="10" required></label><label>Repetir nueva contraseña<input name="confirmation" type="password" autocomplete="new-password" minlength="10" required></label><p>Usa al menos 10 caracteres. Combina palabras, números o símbolos.</p><button>Guardar contraseña</button></form><p id="passwordNotice" role="status"></p><button id="passwordContinue" hidden>Continuar a la app</button><button id="accountExit" class="secondary">Cerrar sesión</button></section>${recovery?'</main>':''}`;
 const form=target.querySelector('#changePassword'),notice=target.querySelector('#passwordNotice');
 form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),issue=passwordIssue(f.get('password'),f.get('confirmation'));if(issue){notice.textContent=issue;return;}
  const button=form.querySelector('button');button.disabled=true;notice.textContent='Guardando…';let saved=false;
  try{
   if(!recovery){const signed=await client.auth.signInWithPassword({email:user.email,password:f.get('current')});if(signed.error) throw signed.error;if(signed.data.user?.id!==user.id) throw Error('Sesión inválida. Ingresa nuevamente.');}
   const {error}=await client.auth.updateUser({password:f.get('password')});if(error) throw error;saved=true;
   form.reset();form.hidden=true;notice.textContent='Contraseña actualizada. Ya puedes usarla para ingresar.';
   target.querySelector('#passwordContinue').hidden=false;
   // Revokes other refresh sessions while keeping the current device signed in.
   const signedOut=await client.auth.signOut({scope:'others'});
   if(signedOut.error) notice.textContent+=' No se pudo cerrar la sesión en otros dispositivos.';
  }catch(error){notice.textContent=saved?'Contraseña actualizada. Continúa o ingresa nuevamente.':authErrorMessage(error);}
  finally{button.disabled=false;}
 };
 target.querySelector('#passwordContinue').onclick=onDone;
 target.querySelector('#accountExit').onclick=onSignOut;
}
