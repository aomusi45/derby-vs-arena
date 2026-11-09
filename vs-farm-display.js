// Display-only scheduled switch; no Firebase writes, no race actions.
(() => {
  'use strict';
  const overlay = document.getElementById('vs-farm-display');
  const frame = document.getElementById('vs-farm-display-frame');
  const status = document.getElementById('vs-farm-display-status');
  let schedule = null, started = false;
  function startFarm() {
    if (started) return;
    started = true;
    overlay.classList.add('is-active');
    document.documentElement.style.overflow = 'hidden';
    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      const startedAt = Date.now();
      const timer = setInterval(() => {
        try {
          if (w.__df47BootError) throw Error(w.__df47BootError);
          if (typeof w.__vsBootFarmDirect === 'function') {
            w.__df46OpeningRequested = true;
            w.__vsBootFarmDirect();
            if (typeof w.__df47Start3D === 'function') w.__df47Start3D();
          }
          const farm = w.document.body?.dataset.gameScreen === 'farm';
          const farmFrame = w.document.getElementById('standaloneFarmV62Frame');
          const farmImage = farmFrame?.contentDocument?.getElementById('exactSceneImage');
          const visible = !!(farmImage?.complete && farmImage.naturalWidth > 0 && !w.document.body.classList.contains('df-v2-opening-fade') && w.document.getElementById('derbyOpening')?.hidden);
          if (farm && w.__raceReady3D === true && visible) {
            status.textContent = '牧場画面';
            clearInterval(timer);
          } else if (Date.now() - startedAt > 120000) {
            status.textContent = '起動を確認できません。画面を確認してください';
            clearInterval(timer);
          }
        } catch (error) {
          status.textContent = '起動エラー: ' + String(error.message || error).slice(0, 90);
          clearInterval(timer);
        }
      }, 300);
    }, {once:true});
    frame.src = './engine_source.html';
  }
  function tick() {
    if (!schedule || started) return;
    if (Date.now() >= schedule.at) startFarm();
  }
  async function loadSchedule() {
    try {
      const response = await fetch('./vs-farm-schedule.json', {cache:'no-store'});
      if (!response.ok) throw Error('HTTP ' + response.status);
      const config = await response.json();
      const input = config.scheduled_at;
      if (config.enabled !== true || typeof input !== 'string') {schedule = null; return;}
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(input)) throw Error('日時形式が違います');
      const at = Date.parse(input);
      if (!Number.isFinite(at)) throw Error('日時が不正です');
      // Prevent an old schedule from switching the site indefinitely.
      schedule = Date.now() <= at + 30 * 60 * 1000 ? {at} : null;
      tick();
    } catch (error) { console.error('[VS farm schedule]', error); }
  }
  loadSchedule();
  setInterval(tick, 500);
  setInterval(() => { if (!started) loadSchedule(); }, 15000);
})();
