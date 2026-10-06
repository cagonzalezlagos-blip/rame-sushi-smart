export function accessHandler({createClients, appUrl, allowedOrigins}) {
  const json = (body, status, origin) => new Response(JSON.stringify(body), {status, headers: {
    'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin',
    ...(allowedOrigins.includes(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  }});
  return async request => {
    const origin = request.headers.get('origin') || '';
    if (origin && !allowedOrigins.includes(origin)) return json({error:'Origen no autorizado'},403,origin);
    if (request.method === 'OPTIONS') return json({},200,origin);
    if (request.method !== 'POST') return json({error:'Método no permitido'},405,origin);
    const authorization=request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/.test(authorization)) return json({error:'Inicia sesión nuevamente'},401,origin);
    try {
      const {caller,admin}=createClients(authorization);
      const {data:auth,error:authError}=await caller.auth.getUser();
      if(authError||!auth.user) return json({error:'Sesión vencida. Ingresa nuevamente'},401,origin);
      const {data:actor,error:actorError}=await caller.from('profiles').select('role,active').eq('id',auth.user.id).single();
      if(actorError||actor?.role!=='owner'||!actor.active) return json({error:'Solo administración puede gestionar cuentas'},403,origin);
      const body=await request.json();
      if(body.action==='recover') {
        if(typeof body.id!=='string') return json({error:'Cuenta inválida'},400,origin);
        const {data:list,error}=await caller.rpc('owner_list_access');
        if(error) throw error;
        const target=list.find(x=>x.id===body.id);
        if(!target||!target.active) return json({error:'La cuenta debe estar activa para enviar un enlace'},400,origin);
        const sent=await caller.auth.resetPasswordForEmail(target.email,{redirectTo:appUrl});
        if(sent.error) throw sent.error;
        return json({message:'Solicitud aceptada. Revisa el correo y Spam.'},200,origin);
      }
      if(!['invite','create'].includes(body.action)) return json({error:'Acción inválida'},400,origin);
      const email=String(body.email||'').trim().toLowerCase(),name=String(body.full_name||'').trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length<2||name.length>120||
         !['owner','cashier','worker','courier'].includes(body.role)||!Number.isSafeInteger(body.hourly_rate)||body.hourly_rate<0||body.hourly_rate>2147483647)
        return json({error:'Revisa el correo, nombre, perfil y tarifa'},400,origin);
      if(body.action==='create'&&(typeof body.password!=='string'||body.password.length<10||body.password.length>128))
        return json({error:'La contraseña inicial debe tener entre 10 y 128 caracteres'},400,origin);
      const found=await caller.rpc('owner_account_for_email',{p_email:email});
      if(found.error) throw found.error;
      if(found.data?.[0]?.has_profile) return json({error:'Este correo ya tiene un perfil. Edítalo en la lista.'},409,origin);
      let id=found.data?.[0]?.id,created=false;
      if(!id) {
        const invited=body.action==='create'
          ? await admin.auth.admin.createUser({email,password:body.password,email_confirm:true})
          : await admin.auth.admin.inviteUserByEmail(email,{redirectTo:appUrl});
        if(invited.error) throw invited.error;
        id=invited.data.user?.id;
        if(!id) throw Error('No se pudo crear la cuenta');
        created=true;
      }
      // Profile write runs as the caller: ownership is checked again by RLS.
      const saved=await caller.from('profiles').insert({id,full_name:name,role:body.role,hourly_rate:body.hourly_rate,active:true});
      if(saved.error) {
        // No deletion: concurrent invitations may refer to the same pending account.
        // An account without an active profile has no business access. Retrying by
        // email attaches it through the existing-account path without replacing secrets.
        throw saved.error;
      }
      return json({message:created?(body.action==='create'?'Cuenta creada con contraseña inicial. Entrégala de forma privada; la persona puede cambiarla en Mi cuenta.':'Cuenta creada. Se solicitó el envío de la invitación por correo.'):'Cuenta existente habilitada. Conserva su contraseña.',invited:created&&body.action==='invite'},200,origin);
    } catch(error) {
      const message=String(error?.message||'No se pudo completar la solicitud');
      if(/rate.limit|too many|security purposes/i.test(message)) return json({error:'Límite de correos alcanzado. Espera unos minutos y vuelve a intentarlo.'},429,origin);
      if(/email.*not.*allowed|not.*authorized/i.test(message)) return json({error:'El servicio de correo no permite este destinatario. Configura SMTP en Supabase para invitar personal.'},400,origin);
      if(/already.*registered|already.*exists/i.test(message)) return json({error:'Este correo ya existe. Actualiza la lista antes de continuar.'},409,origin);
      if(/Solo administración|permission denied|row-level security/i.test(message)) return json({error:'Tu perfil ya no permite esta acción. Ingresa nuevamente.'},403,origin);
      return json({error:'No se pudo completar la solicitud. Revisa la cuenta y la configuración del correo.'},400,origin);
    }
  };
}
