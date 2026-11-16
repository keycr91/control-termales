import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Content-Type':'application/json'
};
function reply(status:number,payload:Record<string,unknown>){return new Response(JSON.stringify(payload),{status,headers});}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply(405,{error:'Método no permitido'});
 try{
  const bearer=req.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))return reply(401,{error:'Sesión requerida'});
  const svc=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await svc.auth.getUser(bearer.slice(7));
  if(userError||!user)return reply(401,{error:'Sesión inválida'});
  const {data:me,error:meError}=await svc.from('termales_users').select('profile,active').eq('id',user.id).maybeSingle();
  if(meError||!me||!me.active||me.profile!=='super')return reply(403,{error:'Solo un superusuario activo puede eliminar usuarios'});
  const body=await req.json().catch(()=>({}));
  const targetId=String(body.user_id||'');
  const action=String(body.action||'check');
  if(!['check','delete'].includes(action))return reply(400,{error:'Acción inválida'});
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(targetId))return reply(400,{error:'Identificador de usuario inválido'});
  if(targetId===user.id)return reply(409,{eligible:false,error:'No podés eliminar tu propia cuenta.'});
  const {data:target,error:targetError}=await svc.from('termales_users').select('id,username,full_name,email').eq('id',targetId).maybeSingle();
  if(targetError)return reply(500,{error:'No fue posible validar el registro de usuario'});
  if(!target)return reply(404,{error:'El usuario ya no existe en Control Termales'});
  // Bloquear eliminación de cuentas compartidas con Marchamos.
  const checks=[
   ['Control de Marchamos',svc.from('app_users').select('id',{head:true,count:'exact'}).eq('id',targetId)],
   ['Incidencias creadas',svc.from('termales_incidencias').select('id',{head:true,count:'exact'}).eq('created_by',targetId)],
   ['Incidencias finalizadas',svc.from('termales_incidencias').select('id',{head:true,count:'exact'}).eq('cerrado_por',targetId)],
   ['Comentarios',svc.from('termales_comentarios').select('id',{head:true,count:'exact'}).eq('autor_id',targetId)],
   ['Cambios de responsable',svc.from('termales_cambios').select('id',{head:true,count:'exact'}).eq('actor_id',targetId)]
  ] as const;
  const results=await Promise.all(checks.map(async ([label,query])=>({label,...await query})));
  if(results.some(x=>x.error))return reply(500,{error:'No fue posible comprobar todos los registros asociados. No se eliminó el usuario.'});
  const linked=results.filter(x=>(x.count||0)>0).map(x=>x.label);
  if(linked.length)return reply(409,{eligible:false,error:'No se puede eliminar este usuario porque tiene registros o accesos asociados: '+linked.join(', ')+'.'});
  if(action==='check')return reply(200,{eligible:true,username:target.username,full_name:target.full_name,email:target.email});
  // La eliminación del usuario de Auth elimina en cascada su perfil Termales.
  // Las llaves foráneas restringen también eliminaciones concurrentes con historial.
  const {data:authRecord,error:authLookupError}=await svc.auth.admin.getUserById(targetId);
  if(authLookupError||!authRecord?.user||authRecord.user.email?.toLowerCase()!==target.email?.toLowerCase())
   return reply(409,{error:'La cuenta de autenticación no coincide con el registro. No se eliminó el usuario.'});
  const {error:deleteError}=await svc.auth.admin.deleteUser(targetId);
  if(deleteError)return reply(409,{error:'No se pudo eliminar la cuenta de autenticación: '+deleteError.message});
  const {data:remaining,error:remainingError}=await svc.from('termales_users').select('id').eq('id',targetId).maybeSingle();
  if(remainingError||remaining)return reply(500,{error:'La cuenta fue procesada, pero no se pudo verificar la eliminación del perfil.'});
  return reply(200,{success:true,message:'Usuario eliminado correctamente.'});
 }catch(e){return reply(500,{error:'No fue posible procesar la solicitud de eliminación.'});}
});