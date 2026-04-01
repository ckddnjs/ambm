/* ── 설정 페이지 렌더 ── */
async function renderSettingsPage(){
  // 글자 크기 UI 동기화
  applyFontScale(_fontStepIdx, false);

  // 아바타
  const avatarEl=document.getElementById('settings-avatar');
  if(avatarEl){
    if(ME.avatar_url){
      avatarEl.innerHTML=`<img src="${ME.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      avatarEl.textContent=ME.name?.[0]||'?';
    }
  }
  // 이름/이메일
  const nameEl=document.getElementById('settings-name');
  const emailEl=document.getElementById('settings-email');
  if(nameEl) nameEl.textContent=ME.name||'';
  const genderLabel=ME.gender==='female'?'여성':ME.gender==='male'?'남성':'';
  if(emailEl) emailEl.textContent=[ME.email,genderLabel].filter(Boolean).join(' · ');

  // 다크모드 버튼
  const dmBtn=document.getElementById('darkmode-settings-btn');
  if(dmBtn){
    const isLight=document.body.classList.contains('light-mode');
    dmBtn.textContent=isLight?'🌙 다크로 변경':'☀️ 라이트로 변경';
  }
}

/* ── 아바타 업로드 ── */
async function uploadAvatar(input){
  let file=input.files[0];
  if(!file) return;
  input.value='';

  if(file.size>2*1024*1024){
    toast('이미지 최적화 중...','info');
    file=await new Promise(resolve=>{
      const img=new Image();
      const url=URL.createObjectURL(file);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const MAX=1200;
        let w=img.width,h=img.height;
        if(w>h&&w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        else if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        canvas.toBlob(blob=>resolve(new File([blob],'avatar.jpg',{type:'image/jpeg'})),'image/jpeg',0.88);
      };
      img.src=url;
    });
  }

  toast('업로드 중...','info');
  try{
    const path=`${ME.id}/avatar.jpg`;
    // 항상 삭제 후 재업로드 (upsert 캐시 문제 방지)
    await sb.storage.from('avatars').remove([path]).catch(()=>{});
    const{error:upErr}=await sb.storage.from('avatars').upload(path,file,{
      contentType:'image/jpeg',
      cacheControl:'3600',
      upsert:false
    });
    if(upErr) throw upErr;

    const{data}=sb.storage.from('avatars').getPublicUrl(path);
    const url=data.publicUrl+'?t='+Date.now();

    // DB 업데이트
    const{error:dbErr}=await sb.from('profiles').update({avatar_url:url}).eq('id',ME.id);
    if(dbErr) throw dbErr;

    // 캐시 전체 갱신
    ME.avatar_url=url;
    if(window._profilesCache){
      const idx=window._profilesCache.findIndex(u=>u.id===ME.id);
      if(idx>=0) window._profilesCache[idx].avatar_url=url;
    }
    if(window._usersCache){
      const idx2=window._usersCache.findIndex(u=>u.id===ME.id);
      if(idx2>=0) window._usersCache[idx2].avatar_url=url;
    }

    const avatarEl=document.getElementById('settings-avatar');
    if(avatarEl) avatarEl.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    const hdrAvatar=document.getElementById('hdr-avatar');
    if(hdrAvatar) hdrAvatar.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    toast('✅ 프로필 사진이 업데이트됐어요!','success');
  }catch(e){
    console.error(e);
    const msg=e.message?.includes('row-level security')||e.message?.includes('policy')
      ?'저장 권한 오류 — Supabase Storage 버킷 RLS 정책을 확인해주세요'
      :'업로드 실패: '+e.message;
    toast(msg,'error');
  }
}
