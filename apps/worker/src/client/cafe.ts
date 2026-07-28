type LiffLike = {
  getIDToken(): string | null;
  getProfile?(): Promise<{ displayName: string; pictureUrl?: string }>;
  closeWindow(): void;
};

type Space = {
  id: string;
  name: string;
  description?: string | null;
  bookingMode: 'capacity_pool' | 'assigned_unit';
  capacityTotal: number;
  minimumDurationMinutes: number;
  slotIntervalMinutes: number;
  basePrice: number;
  currency: string;
};

type Availability = {
  capacityTotal: number;
  remainingQuantity: number;
  occupancyRate: number;
  available: boolean;
  statusLabel: string;
};

type Booking = {
  id: string;
  booking_code: string;
  space_name: string;
  starts_at: string;
  ends_at: string;
  quantity: number;
  status: string;
};

type BookingDraft = {
  date: string;
  spaceId: string;
  startTime: string;
  durationMinutes: number;
  quantity: number;
  customerName: string;
  customerPhone: string;
};

const TAIPEI = 'Asia/Taipei';
const icons = {
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"/><path d="M4 18.5A3.5 3.5 0 0 1 7.5 15H20"/></svg>',
};

function taipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return { year: value('year'), month: value('month'), day: value('day'), weekday: value('weekday'), hour: value('hour'), minute: value('minute') };
}

function dateValue(offsetDays = 0) {
  const taipeiNow = new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000);
  return taipeiNow.toISOString().slice(0, 10);
}

function roundedStartTime() {
  const now = new Date(Date.now() + 8 * 3_600_000 + 60 * 60_000);
  const minutes = Math.ceil(now.getUTCMinutes() / 30) * 30;
  now.setUTCMinutes(minutes, 0, 0);
  return now.toISOString().slice(11, 16);
}

function money(amount: number, currency = 'TWD') {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function escapeHtml(value: string) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

export async function initCafe(liff: LiffLike, liffId: string) {
  const root = document.getElementById('app')!;
  root.classList.add('cafe-root');
  root.innerHTML = '<div class="cafe-loading"><div class="loading-spinner"></div><strong>Enjoy Read</strong><p>正在準備你的閱讀空間…</p></div>';

  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('cafePreview') === '1';
  const idToken = preview ? 'local-preview-token' : liff.getIDToken();
  if (!idToken) throw new Error('無法取得 LINE 登入資訊');

  const [session, profile] = await Promise.all([
    preview ? Promise.resolve({ success: true, data: { sessionToken: 'local-preview-session' } }) : fetch('/api/liff/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, liffId }),
    }).then((response) => response.json()) as Promise<any>,
    preview ? Promise.resolve({ displayName: '小閱' }) : liff.getProfile?.().catch(() => ({ displayName: '閱讀者' })) ?? Promise.resolve({ displayName: '閱讀者' }),
  ]);
  if (!session.success) throw new Error(session.error.message);

  const token = session.data.sessionToken;
  const api = async (path: string, options?: RequestInit) => {
    if (preview) {
      const mockSpaces: Space[] = [
        { id: 'quiet', name: '安靜閱讀區', description: '適合深度閱讀與安靜工作的共享座位。', bookingMode: 'capacity_pool', capacityTotal: 20, minimumDurationMinutes: 60, slotIntervalMinutes: 30, basePrice: 80, currency: 'TWD' },
        { id: 'focus', name: '個人專注座位', description: '擁有獨立桌面與閱讀燈的指定座位。', bookingMode: 'assigned_unit', capacityTotal: 10, minimumDurationMinutes: 60, slotIntervalMinutes: 30, basePrice: 100, currency: 'TWD' },
        { id: 'room', name: '小型討論室', description: '適合小組共讀與安靜討論。', bookingMode: 'assigned_unit', capacityTotal: 2, minimumDurationMinutes: 60, slotIntervalMinutes: 60, basePrice: 240, currency: 'TWD' },
      ];
      if (path === '/api/cafe/venues') return { success: true, data: [{ id: 'preview', name: 'Enjoy Read 新店示範店', address: '新北市新店區閱讀路 1 號' }] };
      if (path.startsWith('/api/cafe/spaces')) return { success: true, data: mockSpaces };
      if (path.startsWith('/api/cafe/availability')) {
        const id = new URL(path, location.origin).searchParams.get('spaceId');
        const space = mockSpaces.find((item) => item.id === id) ?? mockSpaces[0];
        const remaining = id === 'room' ? 1 : id === 'focus' ? 4 : 13;
        return { success: true, data: { capacityTotal: space.capacityTotal, remainingQuantity: remaining, occupancyRate: Math.round((1 - remaining / space.capacityTotal) * 100), available: true, statusLabel: remaining / space.capacityTotal < 0.3 ? '即將額滿' : '充足' } };
      }
      if (path === '/api/cafe/me/bookings') return { success: true, data: [] };
      if (path === '/api/cafe/bookings' && options?.method === 'POST') return { success: true, data: { bookingCode: 'ER-PREVIEW', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), quantity: 1, status: 'confirmed' } };
    }
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Cafe-Session': token, ...options?.headers },
    });
    return response.json();
  };

  const venues = await api('/api/cafe/venues');
  const venue = venues.data?.[0];
  const spacesResponse = venue ? await api(`/api/cafe/spaces?venueId=${venue.id}`) : { data: [] };
  const spaces: Space[] = spacesResponse.data ?? [];
  let availabilityCache = new Map<string, Availability>();
  let draft: BookingDraft = {
    date: dateValue(),
    spaceId: spaces[0]?.id ?? '',
    startTime: roundedStartTime(),
    durationMinutes: 60,
    quantity: 1,
    customerName: profile.displayName ?? '',
    customerPhone: '',
  };

  const availability = async (space: Space, date: string, time: string, duration = 60, quantity = 1) =>
    api(`/api/cafe/availability?venueId=${venue.id}&spaceId=${space.id}&date=${date}&startTime=${time}&durationMinutes=${duration}&quantity=${quantity}`);

  function bindNavigation() {
    root.querySelectorAll<HTMLElement>('[data-page]').forEach((element) => {
      element.addEventListener('click', () => void render(element.dataset.page ?? 'home'));
    });
    root.querySelector('[data-account]')?.addEventListener('click', openAccountDrawer);
  }

  function appShell(content: string, active = 'home', options: { dark?: boolean; back?: string } = {}) {
    root.innerHTML = `<main class="cafe-app ${options.dark ? 'is-dark' : ''}">
      <header class="cafe-topbar">
        ${options.back ? `<button class="icon-button" data-page="${options.back}" aria-label="返回"><span class="back-icon">‹</span></button>` : '<div class="brand-mark" aria-hidden="true"></div>'}
        <button class="cafe-brand" data-page="home"><span>ENJOY</span> READ</button>
        <button class="icon-button" data-account aria-label="開啟我的帳戶">${icons.user}</button>
      </header>
      <section class="cafe-screen">${content}</section>
      <nav class="cafe-bottom-nav" aria-label="主要選單">
        <button data-page="home" class="${active === 'home' ? 'active' : ''}">${icons.book}<span>空間</span></button>
        <button data-page="availability" class="${active === 'availability' ? 'active' : ''}"><span class="nav-dot"></span><span>即時空位</span></button>
        <button data-page="book" class="reserve-nav ${active === 'book' ? 'active' : ''}"><span>＋</span><b>預約</b></button>
        <button data-page="mine" class="${active === 'mine' ? 'active' : ''}">${icons.clock}<span>我的預約</span></button>
      </nav>
    </main>`;
    bindNavigation();
  }

  function openAccountDrawer() {
    const overlay = document.createElement('div');
    overlay.className = 'account-overlay';
    overlay.innerHTML = `<button class="drawer-scrim" aria-label="關閉"></button>
      <aside class="account-drawer" aria-label="我的帳戶">
        <button class="drawer-close" aria-label="關閉">×</button>
        <div class="account-profile">
          ${profile.pictureUrl ? `<img src="${escapeHtml(profile.pictureUrl)}" alt="">` : `<span>${escapeHtml((profile.displayName ?? '閱').slice(0, 1))}</span>`}
          <div><small>歡迎回來</small><strong>${escapeHtml(profile.displayName ?? '閱讀者')}</strong></div>
        </div>
        <h2>我的帳戶</h2>
        <button class="drawer-link" data-drawer-page="book">${icons.user}<span>聯絡資料</span>${icons.chevron}</button>
        <button class="drawer-link" data-drawer-page="mine">${icons.clock}<span>目前預約</span>${icons.chevron}</button>
        <button class="drawer-link" data-drawer-page="mine">${icons.book}<span>預約紀錄</span>${icons.chevron}</button>
        <div class="drawer-help"><strong>需要協助嗎？</strong><p>請透過 LINE 聊天聯絡 Enjoy Read 客服。</p></div>
      </aside>`;
    root.append(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.drawer-scrim')?.addEventListener('click', close);
    overlay.querySelector('.drawer-close')?.addEventListener('click', close);
    overlay.querySelectorAll<HTMLElement>('[data-drawer-page]').forEach((button) => button.addEventListener('click', () => {
      close();
      void render(button.dataset.drawerPage ?? 'home');
    }));
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  async function loadLiveAvailability() {
    const time = roundedStartTime();
    const results = await Promise.all(spaces.map(async (space) => ({ space, response: await availability(space, dateValue(), time) })));
    availabilityCache = new Map(results.filter(({ response }) => response.success).map(({ space, response }) => [space.id, response.data]));
    return results;
  }

  async function renderHome() {
    const today = taipeiParts();
    const tomorrow = taipeiParts(new Date(Date.now() + 86_400_000));
    const results = await loadLiveAvailability();
    const total = results.reduce((sum, item) => sum + (item.response.success ? item.response.data.capacityTotal : 0), 0);
    const remaining = results.reduce((sum, item) => sum + (item.response.success ? item.response.data.remainingQuantity : 0), 0);
    const greeting = Number(today.hour) < 12 ? '早安' : Number(today.hour) < 18 ? '午安' : '晚安';

    appShell(`<section class="home-hero">
        <div><p>${greeting}，${escapeHtml(profile.displayName ?? '閱讀者')}</p><h1>今天想在哪裡<br>好好讀一本書？</h1></div>
        <div class="hero-art" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="live-summary"><span><b>${remaining}</b><small>目前剩餘座位</small></span><span><b>${total - remaining}</b><small>目前使用人數</small></span><span class="live-pulse">營業中</span></div>
      </section>
      <section class="space-browser">
        <div class="date-tabs">
          <button class="active"><strong>${today.month}.${today.day}</strong><span>今天・${today.weekday}</span></button>
          <button data-page="book"><strong>${tomorrow.month}.${tomorrow.day}</strong><span>明天・${tomorrow.weekday}</span></button>
        </div>
        <div class="section-heading"><div><span>SPACE</span><h2>選擇閱讀空間</h2></div><button data-page="availability">查看即時空位 →</button></div>
        <div class="home-space-list">
          ${results.map(({ space, response }, index) => {
            const info: Availability | undefined = response.success ? response.data : undefined;
            const tone = info?.remainingQuantity === 0 ? 'full' : index % 3 === 0 ? 'coral' : index % 3 === 1 ? 'amber' : 'blue';
            return `<button class="home-space-card ${tone}" data-space="${space.id}">
              <span class="space-number">0${index + 1}</span>
              <span class="space-main"><small>${space.bookingMode === 'capacity_pool' ? '共享閱讀區' : '指定座位區'}</small><strong>${escapeHtml(space.name)}</strong><em class="${info?.remainingQuantity ? 'available' : 'unavailable'}">${info ? `${info.statusLabel}・剩 ${info.remainingQuantity} 席` : '暫無空位資料'}</em></span>
              <span class="space-arrow">↗</span>
            </button>`;
          }).join('') || '<div class="empty-state">目前尚未建立可預約空間。</div>'}
        </div>
      </section>`, 'home', { dark: true });

    root.querySelectorAll<HTMLElement>('[data-space]').forEach((card) => card.addEventListener('click', () => {
      draft.spaceId = card.dataset.space ?? draft.spaceId;
      void renderSpaceDetail(draft.spaceId);
    }));
  }

  async function renderSpaceDetail(spaceId: string) {
    const space = spaces.find((item) => item.id === spaceId);
    if (!space) return renderHome();
    const info = availabilityCache.get(space.id);
    appShell(`<article class="space-detail">
        <div class="space-visual"><span>${icons.book}</span><p>Enjoy Read</p><strong>${escapeHtml(space.name)}</strong></div>
        <div class="detail-copy">
          <p class="kicker">ENJOY READ SPACE</p><h1>${escapeHtml(space.name)}</h1>
          <p class="detail-description">${escapeHtml(space.description ?? '安靜、舒適且明亮的閱讀環境，讓你在自己的節奏裡專注。')}</p>
          <ul class="venue-facts"><li>${icons.pin}<span>${escapeHtml(venue?.address ?? 'Enjoy Read 新店示範店')}</span></li><li>${icons.clock}<span>每日 08:00–23:00</span></li></ul>
          <div class="availability-banner"><span class="live-pulse"></span><div><small>現在</small><strong>${info?.remainingQuantity ?? space.capacityTotal} 席可預約</strong></div><em>${info?.statusLabel ?? '充足'}</em></div>
          <details open><summary>方案價目表 <span>−</span></summary><div class="price-list"><p><span>1 小時</span><strong>${space.basePrice ? money(space.basePrice, space.currency) : '免費'}</strong></p><p><span>2 小時</span><strong>${space.basePrice ? money(space.basePrice * 2, space.currency) : '免費'}</strong></p><p><span>3 小時以上</span><strong>${space.basePrice ? `${money(space.basePrice, space.currency)}／時` : '免費'}</strong></p></div></details>
          <details><summary>設備與服務 <span>＋</span></summary><p>高速 Wi-Fi、充電插座、閱讀燈與飲水設備。</p></details>
          <details><summary>使用規範 <span>＋</span></summary><p>保持安靜、離場前恢復座位原狀，並請依預約時間準時離場。</p></details>
          <button class="button secondary" data-page="availability">查看即時空位</button>
          <button class="button primary" id="detail-book">預約入場</button>
        </div>
      </article>`, 'home', { back: 'home' });
    root.querySelector('#detail-book')?.addEventListener('click', () => {
      draft.spaceId = space.id;
      void render('book');
    });
  }

  async function renderAvailability() {
    appShell(`<section class="page-intro"><span>LIVE STATUS</span><h1>即時空位</h1><p>每 30 秒更新一次，讓你出門前就能掌握座位。</p></section><div id="live-spaces" class="live-space-list"><div class="skeleton-card"></div><div class="skeleton-card"></div></div>`, 'availability', { back: 'home' });
    const refresh = async () => {
      const results = await loadLiveAvailability();
      const container = document.getElementById('live-spaces');
      if (!container) return;
      container.innerHTML = results.map(({ space, response }, index) => {
        const info: Availability | undefined = response.success ? response.data : undefined;
        return `<article class="live-card tone-${index % 3}"><div class="live-card-top"><span>0${index + 1}</span><button data-open-space="${space.id}">↗</button></div><h2>${escapeHtml(space.name)}</h2><p>${space.bookingMode === 'capacity_pool' ? '共享座位・自由入座' : '指定座位・安靜專注'}</p><div class="capacity-row"><strong>${info?.remainingQuantity ?? '—'}</strong><span>／ ${info?.capacityTotal ?? space.capacityTotal} 席可用</span><em>${info?.statusLabel ?? '更新中'}</em></div><div class="capacity-track"><i style="width:${info ? 100 - info.occupancyRate : 0}%"></i></div></article>`;
      }).join('');
      container.querySelectorAll<HTMLElement>('[data-open-space]').forEach((button) => button.addEventListener('click', () => void renderSpaceDetail(button.dataset.openSpace ?? '')));
    };
    await refresh();
    const timer = window.setInterval(refresh, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.setTimeout(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); }, 300_000);
  }

  function renderBookingForm() {
    const selected = spaces.find((space) => space.id === draft.spaceId) ?? spaces[0];
    appShell(`<section class="booking-flow">
        <div class="stepper"><span class="active"><b>1</b><small>選擇時段</small></span><i></i><span><b>2</b><small>確認資料</small></span><i></i><span><b>3</b><small>完成預約</small></span></div>
        <div class="booking-heading"><span>RESERVATION</span><h1>安排你的閱讀時間</h1><p>先選擇日期與時段，送出前還可以再次確認。</p></div>
        <form id="booking-form" class="booking-form">
          <fieldset><legend><b>01</b> 選擇日期</legend><div class="quick-dates">${[0, 1, 2, 3].map((offset) => { const part = taipeiParts(new Date(Date.now() + offset * 86_400_000)); const value = dateValue(offset); return `<label><input type="radio" name="date" value="${value}" ${draft.date === value ? 'checked' : ''}><span><small>${offset === 0 ? '今天' : part.weekday}</small><strong>${part.month}.${part.day}</strong></span></label>`; }).join('')}</div></fieldset>
          <fieldset><legend><b>02</b> 選擇空間</legend><div class="space-options">${spaces.map((space) => `<label><input type="radio" name="spaceId" value="${space.id}" ${selected?.id === space.id ? 'checked' : ''}><span><small>${space.bookingMode === 'capacity_pool' ? '共享座位' : '指定座位'}</small><strong>${escapeHtml(space.name)}</strong><em>${space.capacityTotal} 席</em></span></label>`).join('')}</div></fieldset>
          <fieldset><legend><b>03</b> 時間與人數</legend><div class="field-grid"><label>開始時間<input name="startTime" type="time" step="1800" value="${draft.startTime}" required></label><label>使用時間<select name="durationMinutes"><option value="60">1 小時</option><option value="120">2 小時</option><option value="180">3 小時</option></select></label><label>使用人數<input name="quantity" type="number" min="1" max="${selected?.capacityTotal ?? 1}" value="${draft.quantity}" required></label></div><div id="quote" class="booking-quote">選擇完成後，這裡會顯示剩餘座位。</div></fieldset>
          <button type="submit" class="button primary">下一步・確認資料</button>
        </form>
      </section>`, 'book', { back: 'home' });

    const form = document.getElementById('booking-form') as HTMLFormElement;
    const duration = form.elements.namedItem('durationMinutes') as HTMLSelectElement;
    duration.value = String(draft.durationMinutes);
    const refreshQuote = async () => {
      const data = new FormData(form);
      const space = spaces.find((item) => item.id === data.get('spaceId'));
      if (!space) return;
      const response = await availability(space, String(data.get('date')), String(data.get('startTime')), Number(data.get('durationMinutes')), Number(data.get('quantity')));
      const quote = document.getElementById('quote');
      if (!quote) return;
      quote.className = `booking-quote ${response.success && response.data.available ? 'success' : 'error'}`;
      quote.innerHTML = response.success ? `<strong>${response.data.remainingQuantity} 席</strong><span>${response.data.available ? '這個時段可以預約' : '人數超過剩餘座位，請調整選項'}</span>` : `<strong>暫時無法預約</strong><span>${escapeHtml(response.error.message)}</span>`;
    };
    form.addEventListener('change', () => void refreshQuote());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      draft = { ...draft, date: String(data.get('date')), spaceId: String(data.get('spaceId')), startTime: String(data.get('startTime')), durationMinutes: Number(data.get('durationMinutes')), quantity: Number(data.get('quantity')) };
      void renderBookingConfirm();
    });
    void refreshQuote();
  }

  async function renderBookingConfirm() {
    const space = spaces.find((item) => item.id === draft.spaceId)!;
    const response = await availability(space, draft.date, draft.startTime, draft.durationMinutes, draft.quantity);
    if (!response.success || !response.data.available) {
      alert(response.error?.message ?? '這個時段的剩餘座位不足，請重新選擇。');
      return renderBookingForm();
    }
    const starts = new Date(`${draft.date}T${draft.startTime}:00+08:00`);
    const ends = new Date(starts.getTime() + draft.durationMinutes * 60_000);
    const price = space.basePrice * draft.quantity * (draft.durationMinutes / 60);
    appShell(`<section class="booking-confirm">
        <div class="stepper"><span class="done"><b>✓</b><small>選擇時段</small></span><i></i><span class="active"><b>2</b><small>確認資料</small></span><i></i><span><b>3</b><small>完成預約</small></span></div>
        <div class="confirm-title"><span>再次確認預約資訊</span><strong>${price ? money(price, space.currency) : '免費'}</strong><h1>${escapeHtml(space.name)}</h1><p>${new Intl.DateTimeFormat('zh-TW', { timeZone: TAIPEI, month: 'long', day: 'numeric', weekday: 'short' }).format(starts)}</p></div>
        <dl class="time-summary"><div><dt>預約入場</dt><dd>${draft.startTime}</dd></div><div><dt>預計離場</dt><dd>${ends.toLocaleTimeString('zh-TW', { timeZone: TAIPEI, hour: '2-digit', minute: '2-digit', hour12: false })}</dd></div><div><dt>使用人數</dt><dd>${draft.quantity} 人</dd></div></dl>
        <form id="confirm-form" class="confirm-form"><label>聯絡人姓名<input name="customerName" value="${escapeHtml(draft.customerName)}" autocomplete="name" required></label><label>手機號碼<input name="customerPhone" value="${escapeHtml(draft.customerPhone)}" type="tel" inputmode="tel" autocomplete="tel" placeholder="09xx-xxx-xxx" required></label><label class="terms-check"><input name="termsAccepted" type="checkbox" required><span>我已閱讀並同意空間規範、環境復原及準時離場條款。</span></label><div class="reminder-box"><strong>預約提醒</strong><ul><li>請依預約時段準時入場。</li><li>取消期限依空間設定計算。</li><li>費用依預約方案收取。</li></ul></div><button type="button" class="button secondary" id="back-edit">返回修改</button><button type="submit" class="button primary">完成預約</button></form>
      </section>`, 'book', { back: 'book' });
    document.getElementById('back-edit')?.addEventListener('click', renderBookingForm);
    const form = document.getElementById('confirm-form') as HTMLFormElement;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      draft.customerName = String(data.get('customerName'));
      draft.customerPhone = String(data.get('customerPhone'));
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submit.disabled = true;
      submit.textContent = '正在建立預約…';
      const result = await api('/api/cafe/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ ...draft, termsAccepted: true }),
      });
      if (!result.success) {
        submit.disabled = false;
        submit.textContent = '完成預約';
        alert(result.error.message);
        return;
      }
      renderSuccess(result.data, space);
    });
  }

  function renderSuccess(booking: any, space: Space) {
    appShell(`<section class="booking-success"><div class="success-seal"><span>✓</span></div><p>RESERVATION COMPLETE</p><h1>預約完成</h1><p>你的閱讀位置已經保留好了。</p><div class="success-ticket"><small>預約編號</small><strong>${escapeHtml(booking.bookingCode)}</strong><hr><h2>${escapeHtml(space.name)}</h2><p>${new Date(booking.startsAt).toLocaleString('zh-TW', { timeZone: TAIPEI })}</p><div><span>${booking.quantity} 人</span><span>${booking.status === 'confirmed' ? '預約已確認' : booking.status}</span></div></div><div class="qr-placeholder">${icons.book}<div><strong>入場 QR Code</strong><span>將於功能啟用後提供</span></div></div><button class="button primary" data-page="mine">查看我的預約</button><button class="button text" id="close-line">返回 LINE</button></section>`, 'mine');
    document.getElementById('close-line')?.addEventListener('click', () => liff.closeWindow());
  }

  async function renderMine() {
    appShell(`<section class="page-intro"><span>MY RESERVATIONS</span><h1>我的預約</h1><p>管理接下來的閱讀時間，也可以查看過去的使用紀錄。</p></section><div id="booking-list" class="my-booking-list"><div class="skeleton-card"></div></div>`, 'mine', { back: 'home' });
    const response = await api('/api/cafe/me/bookings');
    const bookings: Booking[] = response.data ?? [];
    const list = document.getElementById('booking-list')!;
    if (!bookings.length) {
      list.innerHTML = `<div class="empty-state">${icons.book}<h2>還沒有預約</h2><p>找一個喜歡的空間，安排你的第一段閱讀時間。</p><button class="button primary" data-page="book">立即預約</button></div>`;
      bindNavigation();
      return;
    }
    list.innerHTML = bookings.map((booking) => {
      const starts = new Date(booking.starts_at);
      const part = taipeiParts(starts);
      const active = ['confirmed', 'holding', 'pending_payment', 'checked_in'].includes(booking.status);
      return `<article class="booking-card ${active ? 'upcoming' : ''}"><div class="booking-date"><strong>${part.day}</strong><span>${part.month}月</span></div><div class="booking-info"><small>${escapeHtml(booking.booking_code)}</small><h2>${escapeHtml(booking.space_name)}</h2><p>${part.weekday}・${part.hour}:${part.minute}・${booking.quantity} 人</p><em>${active ? '即將到來' : booking.status === 'cancelled' ? '已取消' : '已完成'}</em></div>${active ? `<button data-cancel="${booking.id}">取消</button>` : ''}</article>`;
    }).join('');
    list.querySelectorAll<HTMLElement>('[data-cancel]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('確定要取消這筆預約嗎？')) return;
      const result = await api(`/api/cafe/bookings/${button.dataset.cancel}/cancel`, { method: 'POST' });
      alert(result.success ? '預約已取消' : result.error.message);
      if (result.success) void renderMine();
    }));
  }

  async function render(page: string) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'availability') return renderAvailability();
    if (page === 'book') return renderBookingForm();
    if (page === 'mine') return renderMine();
    return renderHome();
  }

  await render('home');
}
