import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Content-Type':'application/json'
};
function response(status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers});
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return response(405,{error:'Método no permitido'});
 try{
  const bearer=req.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))return response(401,{error:'Sesión requerida'});
  const svc=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:userError}=await svc.auth.getUser(bearer.slice(7));
  if(userError||!user)return response(401,{error:'Sesión inválida'});
  const {data:me,error:meError}=await svc.from('termales_users').select('profile,active').eq('id',user.id).maybeSingle();
  if(meError||!me||!me.active||me.profile!=='super')return response(403,{error:'Solo un superusuario activo puede reenviar invitaciones'});
  const body=await req.json().catch(()=>({}));
  const id=String(body.user_id||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return response(400,{error:'Usuario inválido'});
  const {data:target,error:targetError}=await svc.from('termales_users').select('id,email,full_name,active').eq('id',id).maybeSingle();
  if(targetError||!target)return response(404,{error:'Usuario no encontrado'});
  if(!target.active)return response(409,{error:'El usuario está inactivo. Activá la cuenta antes de reenviar el acceso.'});
  const {data:authRecord,error:authError}=await svc.auth.admin.getUserById(id);
  if(authError||!authRecord?.user||authRecord.user.email?.toLowerCase()!==target.email?.toLowerCase())return response(409,{error:'La cuenta de autenticación no coincide con el usuario registrado'});
  // La invitación original funciona para usuarios todavía no confirmados.
  // Para cuentas ya confirmadas, Supabase envía un correo de recuperación.
  let mode='invite';
  if(!authRecord.user.email_confirmed_at){
   const {error:inviteError}=await svc.auth.admin.inviteUserByEmail(target.email,{data:{full_name:target.full_name}});
   if(inviteError){
    if(inviteError.status===429||inviteError.code==='over_email_send_rate_limit')return response(429,{error:'Supabase alcanzó el límite temporal de correos de autenticación. Intentá de nuevo más tarde. Si ocurre con frecuencia, se debe configurar un servicio SMTP propio.'});
    if(!/already|registered|exists|confirmed/i.test(inviteError.message))return response(400,{error:'No se pudo reenviar la invitación: '+inviteError.message});
    mode='recovery';
   }
  }else mode='recovery';
  if(mode==='recovery'){
   const {error:resetError}=await svc.auth.resetPasswordForEmail(target.email);
   if(resetError){if(resetError.status===429||resetError.code==='over_email_send_rate_limit')return response(429,{error:'Supabase alcanzó el límite temporal de correos de autenticación. Intentá de nuevo más tarde. Si ocurre con frecuencia, se debe configurar un servicio SMTP propio.'});return response(400,{error:'No se pudo enviar el correo de acceso: '+resetError.message});}
  }
  return response(200,{success:true,mode,message:mode==='invite'?'Invitación reenviada correctamente.':'Correo para establecer o recuperar la contraseña enviado correctamente.'});
 }catch(e){return response(500,{error:e instanceof Error?e.message:'Error al reenviar la invitación'});}
});