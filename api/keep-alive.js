import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://wkclmrbdsinvliaaqjol.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2xtcmJkc2ludmxpYWFxam9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjA1MzcsImV4cCI6MjA4ODQzNjUzN30.442P3qAs4NahcXEqZ0tMAlco9bb6qnj2CsREIH21Ltc';

export default async function handler(req, res) {
  // Vercel Cron 요청인지 확인 — CRON_SECRET이 설정된 경우에만 검사.
  // (미설정이면 크론이 Authorization 헤더를 보내지 않아 항상 401이 된다. 공개 anon 키로 1행 읽기뿐이라 열려 있어도 무해)
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 가벼운 쿼리로 Supabase 활성화 유지
    const { error } = await sb
      .from('profiles')
      .select('id')
      .limit(1);

    if (error) throw error;

    const now = new Date().toISOString();
    console.log(`[keep-alive] ✅ ${now} - Supabase ping 성공`);

    return res.status(200).json({
      success: true,
      timestamp: now,
      message: 'Supabase keep-alive ping 완료',
    });

  } catch (err) {
    console.error('[keep-alive] ❌ 오류:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
