import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Método no permitido'}),{status:405,headers});
 try{
  const bearer=req.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))throw new Error('Sesión requerida');
  const svc=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:userErr}=await svc.auth.getUser(bearer.slice(7));
  if(userErr||!user)throw new Error('Sesión inválida');
  const {data:me,error:profileErr}=await svc.from('termales_users').select('profile,active').eq('id',user.id).single();
  if(profileErr||!me||!me.active||me.profile!=='super')throw new Error('Solo un superusuario activo puede invitar');
  const body=await req.json();
  const email=String(body.email||'').trim().toLowerCase(),username=String(body.username||'').trim(),full_name=String(body.full_name||'').trim(),profile=String(body.profile||'operativo');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[A-Za-z0-9._-]{3,50}$/.test(username)||full_name.length<2||full_name.length>100||!['operativo','admin','super'].includes(profile))
   return new Response(JSON.stringify({error:'Revisá los datos del usuario'}),{status:400,headers});
  const {data:already}=await svc.from('termales_users').select('id').or('email.eq.'+email+',username.eq.'+username).limit(1);
  if(already?.length)return new Response(JSON.stringify({error:'Usuario o correo ya registrado en Termales'}),{status:409,headers});
  const {data:invite,error:inviteErr}=await svc.auth.admin.inviteUserByEmail(email,{data:{full_name}});
  if(inviteErr)return new Response(JSON.stringify({error:inviteErr.message}),{status:400,headers});
  if(!invite.user?.id)throw new Error('No se recibió cuenta nueva');
  const {error:insertErr}=await svc.from('termales_users').insert({id:invite.user.id,username,full_name,email,profile,active:true});
  if(insertErr)return new Response(JSON.stringify({error:'La invitación se creó, pero el perfil Termales no se pudo registrar: '+insertErr.message}),{status:500,headers});
  return new Response(JSON.stringify({success:true}),{status:200,headers});
 }catch(e){return new Response(JSON.stringify({error:e?.message||'Error'}),{status:401,headers});}
});