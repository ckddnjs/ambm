const OAUTH_SUPABASE_URL='https://wkclmrbdsinvliaaqjol.supabase.co';
const OAUTH_SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2xtcmJkc2ludmxpYWFxam9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjA1MzcsImV4cCI6MjA4ODQzNjUzN30.442P3qAs4NahcXEqZ0tMAlco9bb6qnj2CsREIH21Ltc';
const OAUTH_KCW_ID='0b8e3098-b0be-43ee-9729-07702141b005';
const oauthSb=supabase.createClient(OAUTH_SUPABASE_URL,OAUTH_SUPABASE_ANON,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'ambm-auth-token'}});
const byId=id=>document.getElementById(id);
const authorizationId=new URLSearchParams(location.search).get('authorization_id');
let oauthDetails=null;

function oauthError(message){byId('oauth-loading').hidden=true;byId('oauth-login').hidden=true;byId('oauth-consent').hidden=true;byId('oauth-error').textContent=message;byId('oauth-error').hidden=false;}
function setBusy(busy){['oauth-approve','oauth-deny'].forEach(id=>{const el=byId(id);if(el)el.disabled=busy;});}

async function loadOAuthConsent(){
  if(!authorizationId){oauthError('유효한 OAuth 연결 요청이 없습니다. ChatGPT에서 새벽민턴 연결을 다시 시작해 주세요.');return;}
  const{data:{session}}=await oauthSb.auth.getSession();
  if(!session?.user){byId('oauth-loading').hidden=true;byId('oauth-error').hidden=true;byId('oauth-login').hidden=false;return;}
  if(session.user.id!==OAUTH_KCW_ID){oauthError('현재 시험 연결은 강창원 회원에게만 허용되어 있습니다.');return;}
  const{data:profile,error:profileError}=await oauthSb.from('profiles').select('id,name,status,role').eq('id',session.user.id).single();
  if(profileError||profile?.name!=='강창원'||profile?.status!=='approved'){oauthError('승인된 강창원 회원 프로필을 확인할 수 없습니다.');return;}
  const{data,error}=await oauthSb.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error||!data){oauthError(error?.message||'OAuth 연결 요청을 확인할 수 없습니다.');return;}
  if(!('authorization_id' in data)&&data.redirect_url){location.replace(data.redirect_url);return;}
  oauthDetails=data;
  byId('oauth-client-name').textContent=data.client?.name||'ChatGPT';
  byId('oauth-client-uri').textContent=data.redirect_uri||'';
  byId('oauth-loading').hidden=true;byId('oauth-error').hidden=true;byId('oauth-login').hidden=true;byId('oauth-consent').hidden=false;
}

byId('oauth-login').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.submitter;button.disabled=true;
  const{error}=await oauthSb.auth.signInWithPassword({email:byId('oauth-email').value.trim(),password:byId('oauth-password').value});
  button.disabled=false;
  if(error){oauthError(error.message.includes('Invalid')?'이메일 또는 비밀번호가 올바르지 않습니다.':error.message);byId('oauth-login').hidden=false;return;}
  byId('oauth-error').hidden=true;byId('oauth-loading').hidden=false;await loadOAuthConsent();
});
byId('oauth-kakao').addEventListener('click',async()=>{
  const{error}=await oauthSb.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:location.href,scopes:'profile_nickname,account_email',queryParams:{prompt:'select_account'}}});
  if(error)oauthError('카카오 로그인 오류: '+error.message);
});
byId('oauth-approve').addEventListener('click',async()=>{
  if(!oauthDetails)return;setBusy(true);
  const{data,error}=await oauthSb.auth.oauth.approveAuthorization(authorizationId);
  if(error){setBusy(false);oauthError(error.message);return;}
  location.assign(data.redirect_url);
});
byId('oauth-deny').addEventListener('click',async()=>{
  setBusy(true);const{data,error}=await oauthSb.auth.oauth.denyAuthorization(authorizationId);
  if(error){setBusy(false);oauthError(error.message);return;}
  location.assign(data.redirect_url);
});

window.addEventListener('DOMContentLoaded',loadOAuthConsent);
