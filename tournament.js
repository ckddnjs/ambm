function balDeleteFromDetail(btId){
  showConfirm({icon:'🗑',title:'밸런스 내역 삭제',msg:'이 내역을 삭제하시겠습니까?',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    const{error}=await sb.from('bracket_tournaments').delete().eq('id',btId);
    if(error){toast('삭제 실패','error');return;}
    closeModal('modal-bracket-detail');
    toast('삭제되었습니다','success');
    _balRenderHistory();
  }});
}

// ── 대회 상세 모달 ──
async function openBracketDetail(id){
  _bdId=id;
  const{data:bt}=await sb.from('bracket_tournaments').select('*').eq('id',id).single();
  if(!bt){toast('대회 정보를 불러올 수 없습니다','error');return;}
  // ── 밸런스 타입은 별도 모달 ──
  if(bt.status==='balance'){_openBalanceDetail(bt);return;}
  _bdData=bt;
  const titleEl=document.getElementById('bd-title');
  const contentEl=document.getElementById('bd-content');
  const actionsEl=document.getElementById('bd-actions');
  if(titleEl) titleEl.textContent='🎯 '+bt.name;
  if(!contentEl) return;
  const isAdmin=ME?.role==='admin';
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};
  const statusLabel={plan:'배분중',active:'진행중',league:'진행중',done:'완료',balance:'⚖️ 밸런스'};
  // groups 컬럼에 {groups,knockout,rounds,teams} 통합 저장 (일괄입력) 또는 순수 배열 (기존방식)
  const rawG=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG)?{groups:rawG}:rawG;
  const groups=data.groups||[];
  const knockout=data.knockout||[];
  const rawRounds=data.rounds?.length?data.rounds:(bt.rounds?(typeof bt.rounds==='string'?JSON.parse(bt.rounds||'[]'):bt.rounds):[]);
  const teamRounds=rawRounds||[];
  const teamsList=data.teams||[];
  const tType=bt.tournament_type||'individual';
  const isIndividual=tType==='individual';
  let html=`<div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px;">📅 ${fmtMatchDate(bt.match_date)} · ${typeLabel[tType]||'대회'} · <span style="color:${bt.status==='done'?'var(--primary)':bt.status==='plan'?'var(--warn)':'var(--info)'};">${statusLabel[bt.status]||bt.status}</span></div>`;
  if(bt.winner_name) html+=`<div style="background:rgba(255,215,0,.1);border:1px solid rgba(255,215,0,.3);border-radius:10px;padding:10px 14px;margin-bottom:12px;text-align:center;"><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px;">🏆 우승</div><div style="font-size:1.1rem;font-weight:700;color:#FFD700;">${bt.winner_name}</div></div>`;
  if(groups.length){
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px;">📋 조별 리그</div>`;
    groups.forEach((g,gi)=>{
      const gMatches=g.matches||[];
      bdCalcStandings([g],isIndividual);
      const standings=g.standings||[];
      html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;"><div style="font-weight:700;font-size:.88rem;color:var(--primary);margin-bottom:8px;">${g.name}</div>`;
      if(standings.length){
        html+=`<table style="width:100%;font-size:.76rem;border-collapse:collapse;margin-bottom:8px;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="padding:4px 2px;text-align:left;color:var(--text-muted);">순위</th><th style="padding:4px 2px;text-align:left;color:var(--text-muted);">선수</th><th style="padding:4px 2px;text-align:center;color:var(--text-muted);">승</th><th style="padding:4px 2px;text-align:center;color:var(--text-muted);">패</th><th style="padding:4px 2px;text-align:center;color:var(--text-muted);">득실</th></tr></thead><tbody>`;
        standings.forEach((s,si)=>{
          const nm=isIndividual?s.team.name:(s.team.p2_name?`${s.team.p1_name}/${s.team.p2_name}`:s.team.p1_name);
          const medal=si===0?'🥇':si===1?'🥈':si===2?'🥉':'';
          html+=`<tr style="border-bottom:1px solid var(--border);${si<2?'color:var(--primary);font-weight:600;':''}"><td style="padding:4px 2px;">${medal||si+1}</td><td style="padding:4px 2px;">${nm}</td><td style="padding:4px 2px;text-align:center;">${s.wins}</td><td style="padding:4px 2px;text-align:center;">${s.losses}</td><td style="padding:4px 2px;text-align:center;">${s.diff>0?'+':''}${s.diff}</td></tr>`;
        });
        html+=`</tbody></table>`;
      }
      const doneMatches=gMatches.filter(m=>m.done);
      if(doneMatches.length){
        html+=`<div style="font-size:.74rem;color:var(--text-muted);margin-bottom:4px;">경기 결과 (${doneMatches.length}/${gMatches.length})</div>`;
        doneMatches.forEach(m=>{
          const n1=isIndividual?m.p1.name:(m.t1.p2_name?`${m.t1.p1_name}/${m.t1.p2_name}`:m.t1.p1_name);
          const n2=isIndividual?m.p2.name:(m.t2.p2_name?`${m.t2.p1_name}/${m.t2.p2_name}`:m.t2.p1_name);
          const w1=parseInt(m.s1)>parseInt(m.s2);
          html+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 4px;font-size:.74rem;border-bottom:1px solid var(--border);"><span style="${w1?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n1}</span><span style="padding:0 8px;font-weight:700;color:var(--primary);">${m.s1}:${m.s2}</span><span style="${!w1?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n2}</span></div>`;
        });
      }
      if(isAdmin){
        const pendingMatches=gMatches.filter(m=>!m.done);
        if(pendingMatches.length){
          html+=`<div style="font-size:.74rem;color:var(--accent);margin-top:6px;margin-bottom:4px;">⏳ 미완료 (${pendingMatches.length}경기)</div>`;
          pendingMatches.forEach(m=>{
            const n1=isIndividual?m.p1.name:(m.t1.p2_name?`${m.t1.p1_name}/${m.t1.p2_name}`:m.t1.p1_name);
            const n2=isIndividual?m.p2.name:(m.t2.p2_name?`${m.t2.p1_name}/${m.t2.p2_name}`:m.t2.p1_name);
            const realMi=gMatches.indexOf(m);
            html+=`<div style="display:flex;align-items:center;gap:4px;padding:4px 0;font-size:.78rem;border-bottom:1px solid var(--border);"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n1}</span><input type="number" placeholder="0" min="0" max="30" id="bd-s1-${gi}-${realMi}" style="width:42px;text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px;font-size:.78rem;color:var(--text);"><span style="color:var(--text-muted);">:</span><input type="number" placeholder="0" min="0" max="30" id="bd-s2-${gi}-${realMi}" style="width:42px;text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px;font-size:.78rem;color:var(--text);"><span style="flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n2}</span><button onclick="bdSaveMatchScore('${id}',${gi},${realMi})" style="background:var(--primary);border:none;color:#fff;border-radius:6px;padding:3px 8px;font-size:.72rem;cursor:pointer;flex-shrink:0;">저장</button></div>`;
          });
        }
      }
      html+=`</div>`;
    });
  }
  if(knockout.length){
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px;margin-top:4px;">🏆 본선 토너먼트</div>`;
    html+=_renderKnockoutBracket(knockout);
  }
  if(teamsList.length||teamRounds.length){
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px;margin-top:4px;">🚩 팀전</div>`;
    // 팀 구성원 카드 (팀장 지정 포함)
    if(teamsList.length){
      html+=`<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">`;
      teamsList.forEach((team,ti)=>{
        const captain=team.captain||'(미지정)';
        const captainSet=!!team.captain;
        html+=`<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:6px;">${team.name}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:6px;">
            🚩 팀장: <span style="color:${captainSet?'var(--primary)':'var(--warn)'};font-weight:700;">${captain}</span>
            ${isAdmin?`<button onclick="bdEditTeamCaptain('${id}',${ti})" style="margin-left:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:.68rem;cursor:pointer;color:var(--text-muted);">수정</button>`:''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${(team.members||[]).map(m=>`<span style="font-size:.74rem;background:var(--bg3);border-radius:12px;padding:2px 8px;">${m}</span>`).join('')}
          </div>
        </div>`;
      });
      html+=`</div>`;
    }
    if(teamRounds.length){
      html+=_renderTeamRounds(teamRounds);
    }
  }
  if(!groups.length&&!knockout.length&&!teamsList.length&&!teamRounds.length){
    if(bt.status==='balance'){
      html+=_renderBalanceSavedView(bt, data);
    } else {
      html+=`<div class="empty-state"><div class="empty-icon">📋</div><div>아직 대회 데이터가 없습니다</div></div>`;
    }
  }
  contentEl.innerHTML=html;
  if(actionsEl) actionsEl.innerHTML=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
  openModal('modal-bracket-detail');
}



// ── 저장된 밸런스 상세 뷰 ──
function _renderBalanceSavedView(bt, data){
  const tType=bt.tournament_type||'individual';
  const isTeam=tType==='team';
  const isDuo=tType==='duo';
  const pal=['#5B9CF6','#F59E0B','#10B981','#F472B6','#A78BFA','#34D399'];

  // score 보완: 저장된 score가 없으면 _balUserPool에서 찾음
  const _scoreByName=(name,savedScore)=>{
    if(savedScore) return savedScore;
    const u=(window._balUserPool||[]).find(x=>x.name===name);
    return u?.score||0;
  };

  let groups=[], scores=[];
  if(isTeam){
    (data.teams||[]).forEach(t=>{
      // players 배열(score 포함) 우선, 없으면 members 이름만
      const rawPlayers=t.players||(t.members||[]).map(n=>({name:n,score:0}));
      const players=rawPlayers.map(p=>({...p,score:_scoreByName(p.name,p.score)}));
      const avg=players.length?Math.round(players.reduce((s,p)=>s+(p.score||0),0)/players.length):0;
      groups.push({name:t.name,players,captain:t.captain,isTeam:true});
      scores.push(avg);
    });
  } else {
    (data.groups||[]).forEach(g=>{
      if(isDuo){
        const pairs=(g.teams||[]).map(t=>({
          ...t,
          p1_score:_scoreByName(t.p1_name,t.p1_score),
          p2_score:t.p2_name?_scoreByName(t.p2_name,t.p2_score):0,
        }));
        const avg=pairs.length?Math.round(pairs.reduce((s,t)=>{
          const s1=t.p1_score||0, s2=t.p2_score||0;
          return s+(s1+(t.p2_name?s2:0))/(t.p2_name?2:1);
        },0)/pairs.length):0;
        groups.push({name:g.name,pairs,isDuo:true});
        scores.push(avg);
      } else {
        const players=(g.players||[]).map(p=>({...p,score:_scoreByName(p.name,p.score)}));
        const avg=players.length?Math.round(players.reduce((s,p)=>s+(p.score||0),0)/players.length):0;
        groups.push({name:g.name,players,isDuo:false});
        scores.push(avg);
      }
    });
  }

  const grade=_calcBalanceGrade(scores);
  const maxSc=Math.max(...scores,1);

  let html=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">`;
  html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <div style="font-size:.88rem;font-weight:700;">밸런스 평가</div>
    <div style="font-size:.86rem;font-weight:700;color:${grade.color};">${grade.label} <span style="font-weight:400;color:var(--text-muted);">(${grade.pct}점)</span></div>
  </div>
  <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:14px;">
    <div style="height:100%;width:${grade.pct}%;background:${grade.color};border-radius:3px;"></div>
  </div>`;

  groups.forEach((g,gi)=>{
    const color=pal[gi%pal.length];
    const pct=maxSc>0?Math.round(scores[gi]/maxSc*100):0;
    html+=`<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:.92rem;font-weight:700;color:${color};">${g.name}</div>
        <div style="font-size:.84rem;font-weight:700;color:${color};">평균 ${rpDisp(scores[gi])}</div>
      </div>
      <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    if(g.isTeam){
      (g.players||[]).forEach(p=>{
        html+=`<div style="display:flex;align-items:center;gap:5px;background:var(--bg3);border-radius:8px;padding:6px 12px;">
          <span style="font-size:.92rem;font-weight:600;">${p.name}${p.name===g.captain?'⭐':''}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(p.score||0)}</span>
        </div>`;
      });
    } else if(g.isDuo){
      (g.pairs||[]).forEach(t=>{
        html+=`<div style="background:var(--bg3);border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
          <span style="font-size:.92rem;font-weight:600;">${t.p1_name}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(t.p1_score||0)}</span>
          ${t.p2_name?`<span style="font-size:.78rem;color:var(--text-dim);">/</span>
          <span style="font-size:.92rem;font-weight:600;">${t.p2_name}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(t.p2_score||0)}</span>`:''}
        </div>`;
      });
    } else {
      (g.players||[]).forEach(p=>{
        html+=`<div style="display:flex;align-items:center;gap:5px;background:var(--bg3);border-radius:8px;padding:6px 12px;">
          <span style="font-size:.92rem;font-weight:600;">${p.name}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(p.score||0)}</span>
        </div>`;
      });
    }
    html+=`</div></div>`;
  });
  html+=`</div>`;
  return html;
}

// ── 팀장 수정 ──
async function bdEditTeamCaptain(btId, teamIdx){
  const{data:bt}=await sb.from('bracket_tournaments').select('groups').eq('id',btId).single();
  if(!bt){toast('대회 정보 없음','error');return;}
  const rawG2=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG2)?{}:rawG2;
  const teams=data.teams||[];
  const team=teams[teamIdx];
  if(!team){toast('팀 정보 없음','error');return;}
  const members=team.members||[];
  if(!members.length){toast('팀원이 없습니다','error');return;}

  // 팝업: 팀원 목록에서 팀장 선택
  const btIdSafe=btId.replace(/[^a-zA-Z0-9_-]/g,'');
  const modalHtml=`
    <div style="background:var(--modal-bg,var(--surface));border-radius:16px;padding:20px;max-width:320px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.4);">
      <div style="font-weight:700;font-size:.95rem;margin-bottom:4px;">🚩 팀장 지정 — ${team.name}</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:14px;">현재: ${team.captain||'미지정'}</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
        ${members.map(m=>`
          <button onclick="bdSetTeamCaptain('${btId}',${teamIdx},'${m}')" style="background:${team.captain===m?'var(--primary)':'var(--bg2)'};color:${team.captain===m?'#fff':'var(--text)'};border:1.5px solid ${team.captain===m?'var(--primary)':'var(--border)'};border-radius:8px;padding:9px 14px;font-size:.88rem;font-weight:600;cursor:pointer;text-align:left;font-family:inherit;">
            ${team.captain===m?'✅ ':''}${m}
          </button>`).join('')}
      </div>
      <button onclick="document.getElementById('captain-pick-modal').remove()" class="btn btn-ghost" style="width:100%;">닫기</button>
    </div>`;
  let overlay=document.getElementById('captain-pick-modal');
  if(overlay) overlay.remove();
  overlay=document.createElement('div');
  overlay.id='captain-pick-modal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML=modalHtml;
  overlay.addEventListener('click',e=>{if(e.target===overlay) overlay.remove();});
  document.body.appendChild(overlay);
}

async function bdSetTeamCaptain(btId, teamIdx, captainName){
  document.getElementById('captain-pick-modal')?.remove();
  const{data:bt}=await sb.from('bracket_tournaments').select('groups').eq('id',btId).single();
  if(!bt) return;
  const rawG3=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG3)?{}:rawG3;
  const teams=data.teams||[];
  if(!teams[teamIdx]) return;
  teams[teamIdx].captain=captainName;
  data.teams=teams;
  const{error}=await sb.from('bracket_tournaments').update({groups:JSON.stringify(data)}).eq('id',btId);
  if(error){toast('저장 실패','error');return;}
  toast(`✅ ${teams[teamIdx].name} 팀장: ${captainName}`,'success');
  openBracketDetail(btId);
}

// ── 본선 토너먼트 시각화 ──
function _renderKnockoutBracket(knockout){
  // 라운드별 카드 레이아웃
  let html=`<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">`;
  knockout.forEach(round=>{
    const label=round.label||'라운드';
    const stageColor={'8강':'var(--info)','4강':'var(--warn)','결승':'#FFD700'}[label]||'var(--primary)';
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">`;
    html+=`<div style="font-weight:700;font-size:.82rem;color:${stageColor};margin-bottom:8px;display:flex;align-items:center;gap:6px;">`;
    html+=`<span style="background:${stageColor};color:#fff;border-radius:4px;padding:1px 8px;font-size:.72rem;">${label}</span></div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:6px;">`;
    (round.matches||[]).forEach(m=>{
      const n1=_tl(m.t1)||'TBD', n2=_tl(m.t2)||'TBD';
      const isBye=m.bye||(n2==='BYE');
      const done=m.done&&!isBye;
      const w1=done&&parseInt(m.s1)>parseInt(m.s2);
      const w2=done&&!w1;
      if(isBye){
        html+=`<div style="display:flex;align-items:center;gap:8px;background:var(--surface);border-radius:8px;padding:8px 10px;border:1px dashed var(--border);">
          <span style="font-size:.8rem;font-weight:700;flex:1;">${n1}</span>
          <span style="font-size:.72rem;background:rgba(255,152,0,.15);color:var(--warn);border-radius:12px;padding:2px 8px;">부전승 🟡</span>
        </div>`;
      } else {
        const slotBadge=m.slot?`<span style="font-size:.68rem;color:var(--text-muted);background:var(--bg3);border-radius:4px;padding:1px 5px;margin-left:4px;">${m.slot}</span>`:'';
        html+=`<div style="background:var(--surface);border-radius:8px;border:1px solid var(--border);overflow:hidden;">
          <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--border);${w1?'background:rgba(41,121,255,.06);':''}">
            <span style="font-size:.8rem;flex:1;${w1?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n1}${slotBadge}</span>
            <span style="font-size:.9rem;font-weight:900;color:${done?'var(--primary)':'var(--text-muted)'};min-width:28px;text-align:right;">${done?m.s1:'—'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;${w2?'background:rgba(41,121,255,.06);':''}">
            <span style="font-size:.8rem;flex:1;${w2?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n2}</span>
            <span style="font-size:.9rem;font-weight:900;color:${done?'var(--primary)':'var(--text-muted)'};min-width:28px;text-align:right;">${done?m.s2:'—'}</span>
          </div>
        </div>`;
      }
    });
    html+=`</div></div>`;
  });
  html+=`</div>`;
  return html;
}

// ── 팀전 라운드 시각화 ──
function _renderTeamRounds(rounds){
  // 팀 색상: A팀 파랑, B팀 주황 — 강조는 최소화
  const CA={c:'#5B9CF6',dim:'rgba(91,156,246,.15)'};
  const CB={c:'#F59E0B',dim:'rgba(245,158,11,.15)'};

  // 선수별 스탯 수집
  const playerSide={}, playerStats={};
  rounds.forEach(r=>{
    (r.matches||[]).forEach(m=>{
      const p1s=[m.t1?.p1_name,m.t1?.p2_name].filter(Boolean);
      const p2s=[m.t2?.p1_name,m.t2?.p2_name].filter(Boolean);
      p1s.forEach(n=>{if(!playerSide[n])playerSide[n]='A';});
      p2s.forEach(n=>{if(!playerSide[n])playerSide[n]='B';});
      if(m.done&&m.s1!==null){
        const s1=parseInt(m.s1),s2=parseInt(m.s2),aWin=s1>s2;
        [...p1s,...p2s].forEach(n=>{if(!playerStats[n])playerStats[n]={wins:0,losses:0,pf:0,pa:0,team:playerSide[n]||'A'};});
        p1s.forEach(n=>{if(!playerStats[n])return;playerStats[n].pf+=s1;playerStats[n].pa+=s2;if(aWin)playerStats[n].wins++;else playerStats[n].losses++;});
        p2s.forEach(n=>{if(!playerStats[n])return;playerStats[n].pf+=s2;playerStats[n].pa+=s1;if(!aWin)playerStats[n].wins++;else playerStats[n].losses++;});
      }
    });
  });

  // 라운드별 승패
  const roundSummary=rounds.map(r=>{
    let aW=0,bW=0;
    (r.matches||[]).forEach(m=>{if(!m.done||m.s1===null)return;parseInt(m.s1)>parseInt(m.s2)?aW++:bW++;});
    return {label:r.label||'R?',aWins:aW,bWins:bW};
  });
  const totalA=roundSummary.reduce((s,r)=>s+r.aWins,0);
  const totalB=roundSummary.reduce((s,r)=>s+r.bWins,0);
  const winner=totalA>totalB?'A':totalA<totalB?'B':null;
  let diffA=0,diffB=0;
  rounds.forEach(r=>{(r.matches||[]).forEach(m=>{if(!m.done||m.s1===null)return;diffA+=parseInt(m.s1)-parseInt(m.s2);diffB+=parseInt(m.s2)-parseInt(m.s1);});});

  let html=`<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">`;

  // ── 스코어보드 ──
  const winnerBorder=winner?`border:1.5px solid ${winner==='A'?CA.c:CB.c};`:'border:1px solid var(--border);';
  html+=`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0;background:var(--bg2);border-radius:12px;overflow:hidden;${winnerBorder}">
    <div style="text-align:center;padding:14px 10px;background:${totalA>totalB?CA.dim:'transparent'};">
      <div style="font-size:.7rem;font-weight:700;color:${CA.c};letter-spacing:.08em;margin-bottom:4px;">A팀</div>
      <div style="font-size:2rem;font-weight:900;color:${totalA>totalB?CA.c:'var(--text)'};line-height:1;">${totalA}</div>
      <div style="font-size:.68rem;color:var(--text-muted);margin-top:3px;">${diffA>=0?'+':''}${diffA} 득실</div>
    </div>
    <div style="padding:0 14px;font-size:.72rem;color:var(--text-muted);font-weight:600;">vs</div>
    <div style="text-align:center;padding:14px 10px;background:${totalB>totalA?CB.dim:'transparent'};">
      <div style="font-size:.7rem;font-weight:700;color:${CB.c};letter-spacing:.08em;margin-bottom:4px;">B팀</div>
      <div style="font-size:2rem;font-weight:900;color:${totalB>totalA?CB.c:'var(--text)'};line-height:1;">${totalB}</div>
      <div style="font-size:.68rem;color:var(--text-muted);margin-top:3px;">${diffB>=0?'+':''}${diffB} 득실</div>
    </div>
  </div>`;

  // ── 라운드별 카드 ──
  rounds.forEach((round,ri)=>{
    const rs=roundSummary[ri];
    const rAW=rs.aWins>rs.bWins, rBW=rs.bWins>rs.aWins;
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;">`;
    // 라운드 헤더
    html+=`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:6px 12px;border-bottom:1px solid var(--border);">
      <div style="font-size:.78rem;font-weight:700;color:${rAW?CA.c:'var(--text-muted)'};">${rs.aWins}승</div>
      <div style="font-size:.74rem;color:var(--text-muted);font-weight:600;padding:0 10px;">${rs.label}</div>
      <div style="font-size:.78rem;font-weight:700;color:${rBW?CB.c:'var(--text-muted)'};text-align:right;">${rs.bWins}승</div>
    </div>`;
    // 개별 경기
    (round.matches||[]).forEach((m,mi)=>{
      const n1=_tl(m.t1)||'TBD', n2=_tl(m.t2)||'TBD';
      const done=m.done&&m.s1!==null;
      const w1=done&&parseInt(m.s1)>parseInt(m.s2), w2=done&&!w1;
      const sep=mi>0?'border-top:1px solid var(--border);':'';
      html+=`<div style="display:grid;grid-template-columns:1fr 52px 1fr;align-items:center;${sep}">
        <div style="padding:9px 12px;display:flex;align-items:center;gap:6px;">
          <div style="width:2px;height:18px;background:${w1?CA.c:'var(--border)'};border-radius:1px;flex-shrink:0;"></div>
          <span style="font-size:.8rem;${w1?`font-weight:700;color:var(--text);`:'color:var(--text-muted);'}">${n1}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:3px;border-left:1px solid var(--border);border-right:1px solid var(--border);height:100%;padding:6px 0;">
          <span style="font-size:.9rem;font-weight:800;color:${w1?CA.c:done?'var(--text-muted)':'var(--text-muted)'};">${done?m.s1:'—'}</span>
          <span style="font-size:.65rem;color:var(--text-dim);">:</span>
          <span style="font-size:.9rem;font-weight:800;color:${w2?CB.c:done?'var(--text-muted)':'var(--text-muted)'};">${done?m.s2:'—'}</span>
        </div>
        <div style="padding:9px 12px;display:flex;align-items:center;justify-content:flex-end;gap:6px;">
          <span style="font-size:.8rem;${w2?`font-weight:700;color:var(--text);`:'color:var(--text-muted);'}">${n2}</span>
          <div style="width:2px;height:18px;background:${w2?CB.c:'var(--border)'};border-radius:1px;flex-shrink:0;"></div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  });

  // ── 개인별 전적 ──
  const players=Object.entries(playerStats).sort((a,b)=>a[1].team!==b[1].team?(a[1].team==='A'?-1:1):b[1].wins-a[1].wins);
  if(players.length){
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
      <div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">📋 개인별 전적</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
    ['A','B'].forEach(side=>{
      const T=side==='A'?CA:CB;
      const sp=players.filter(([,s])=>s.team===side);
      html+=`<div>
        <div style="font-size:.7rem;font-weight:700;color:${T.c};margin-bottom:5px;padding-bottom:4px;border-bottom:1.5px solid ${T.c}40;">${side}팀</div>`;
      sp.forEach(([name,s])=>{
        const total=s.wins+s.losses, diff=s.pf-s.pa;
        html+=`<div style="display:flex;align-items:center;gap:4px;padding:4px 0;border-bottom:1px solid var(--border);">
          <span style="flex:1;font-size:.76rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
          <span style="font-size:.68rem;color:var(--text-muted);">${total}전</span>
          <span style="font-size:.7rem;font-weight:700;color:${T.c};">${s.wins}승</span>
          <span style="font-size:.68rem;color:var(--text-muted);">${s.losses}패</span>
          <span style="font-size:.67rem;color:${diff>=0?T.c:'var(--danger)'};">${diff>=0?'+':''}${diff}</span>
        </div>`;
      });
      html+=`</div>`;
    });
    html+=`</div></div>`;
  }

  // ── 우승 배너 ──
  if(winner){
    const T=winner==='A'?CA:CB;
    html+=`<div style="text-align:center;background:${T.dim};border:1.5px solid ${T.c}60;border-radius:10px;padding:10px;">
      <span style="font-size:.88rem;font-weight:800;color:${T.c};">🏆 ${winner}팀 우승 &nbsp;${winner==='A'?totalA:totalB} : ${winner==='A'?totalB:totalA}</span>
    </div>`;
  } else if(totalA+totalB>0){
    html+=`<div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
      <span style="font-size:.82rem;font-weight:700;color:var(--text-muted);">🤝 무승부 &nbsp;${totalA} : ${totalB}</span>
    </div>`;
  }

  html+=`</div>`;
  return html;
}


async function bdSaveMatchScore(btId,gi,mi){
  const s1=parseInt(document.getElementById(`bd-s1-${gi}-${mi}`)?.value);
  const s2=parseInt(document.getElementById(`bd-s2-${gi}-${mi}`)?.value);
  if(isNaN(s1)||isNaN(s2)){toast('점수를 입력하세요','error');return;}
  if(s1===s2){toast('동점은 불가','error');return;}
  const{data:bt}=await sb.from('bracket_tournaments').select('groups').eq('id',btId).single();
  if(!bt){toast('대회 정보 없음','error');return;}
  const rawG4=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG4)?{groups:rawG4}:rawG4;
  if(!data.groups?.[gi]?.matches?.[mi]){toast('경기 정보 없음','error');return;}
  data.groups[gi].matches[mi].s1=s1;data.groups[gi].matches[mi].s2=s2;data.groups[gi].matches[mi].done=true;
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(data)}).eq('id',btId);
  toast('✅ 저장 완료','success');openBracketDetail(btId);
}

// ── 목록 렌더 ──
async function renderBracketPage(){
  // btn-add-bracket 미사용 (대회만들기 비활성)
  const importBtn=document.getElementById('btn-bulk-import');
  if(importBtn) importBtn.style.display=ME?.role==='admin'?'block':'none';
  // btn-balance 미사용 (별도 탭으로 이동)
  const el=document.getElementById('bracket-list');
  if(!el) return;
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);
  const{data:list}=await sb.from('bracket_tournaments').select('*').neq('status','balance').order('created_at',{ascending:false});
  if(!list||!list.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🎯</div><div>등록된 대회가 없어요</div></div>`;
    return;
  }
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};
  el.innerHTML=list.map(bt=>{
    const isDone=bt.status==='done';
    const isLeague=bt.status==='league'||bt.status==='active';
    const isPlan=bt.status==='plan';
    const isBalance=bt.status==='balance';
    const isAdmin=ME?.role==='admin';
    const tLabel=typeLabel[bt.tournament_type]||'대회';
    return `<div class="card" style="margin-bottom:12px;cursor:pointer;${isBalance?'border-left:3px solid #00C896;':''}" onclick="openBracketDetail('${bt.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:.95rem;margin-bottom:3px;">${bt.name}</div>
          <div style="font-size:.78rem;color:var(--text-muted);">📅 ${fmtMatchDate(bt.match_date)} · ${tLabel}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:.75rem;padding:3px 10px;border-radius:12px;font-weight:700;
            background:${isBalance?'rgba(0,200,150,.12)':isDone?'rgba(41,121,255,.12)':isLeague?'rgba(41,121,255,.15)':'rgba(255,152,0,.12)'};
            color:${isBalance?'#00C896':isDone?'var(--primary)':isLeague?'var(--info)':'var(--warn)'};">
            ${isBalance?'⚖️':isDone?'완료':isLeague?'진행중':isPlan?'배분중':'준비중'}
          </span>
          ${isAdmin?`<button onclick="event.stopPropagation();deleteBracket('${bt.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.8rem;padding:2px 6px;">✕</button>`:''}
        </div>
      </div>
      ${isDone&&bt.winner_name?`<div style="font-size:.8rem;color:var(--primary);margin-top:6px;">🏆 ${bt.winner_name}</div>`:''}
    </div>`;
  }).join('');
}

async function deleteBracket(id){
  // 연관 경기 수 미리 확인
  const{data:bt}=await sb.from('bracket_tournaments').select('name,match_date,groups').eq('id',id).single();
  if(!bt) return;
  // 대회 날짜로 경기 추정 (match_date 동일 건)
  const{data:relMatches}=await sb.from('matches').select('id').eq('match_date',bt.match_date).eq('status','approved');
  const relCount=relMatches?.length||0;
  const msg=relCount>0
    ?`"${bt.name}" 대회와 같은 날짜의 경기내역 ${relCount}건도 함께 삭제됩니다.\n삭제하면 복구할 수 없습니다.`
    :`"${bt.name}" 대회를 삭제합니다. 복구할 수 없습니다.`;
  showConfirm({icon:'🗑️',title:'대회 삭제',msg,okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    // 1. 연관 경기 삭제
    if(relCount>0){
      const ids=(relMatches||[]).map(m=>m.id);
      await sb.from('matches').delete().in('id',ids);
    }
    // 2. 대회 삭제
    await sb.from('bracket_tournaments').delete().eq('id',id);
    addLog(`대회 삭제: ${bt.name} (경기 ${relCount}건 포함)`,ME.id);
    toast(`삭제 완료 (경기 ${relCount}건 포함)`,'warning');
    renderBracketPage();
  }});
}

// ══════════════════
//  STEP 1: 폼 토글 & 참석자 선택
// ══════════════════

// ══════════════════════════════════════════════════════════
//  ⚖️  밸런스 비교  (관리자 전용 · 대회 탭)
// ══════════════════════════════════════════════════════════

let _balType      = 'individual';
let _balAttendees = [];   // [{id,name,score(=CI),ci,wins,losses,games,diff,...}]
let _balResult    = null; // 배분 결과
let _balDuoPairs  = [];   // [{p1,p2}] 듀오 페어 (수동 구성)

// ── 밸런스 페이지 진입 ──
let _balCurrentTab='compare';
