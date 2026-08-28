/* Max Credit Solution — single-page app (Super Admin / Retailer / Customer).
   Vanilla JS, no build step. Works on web + installable as a PWA on Android/iOS. */
'use strict';

// ---------------------------------------------------------------- state
const State = {
  token: localStorage.getItem('mcs_token') || null,
  user: JSON.parse(localStorage.getItem('mcs_user') || 'null'),
  config: null,
};
function setSession(token, user) {
  State.token = token; State.user = user;
  localStorage.setItem('mcs_token', token);
  localStorage.setItem('mcs_user', JSON.stringify(user));
}
function clearSession() {
  State.token = null; State.user = null;
  localStorage.removeItem('mcs_token'); localStorage.removeItem('mcs_user');
}

// ---------------------------------------------------------------- api
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (State.token) headers.Authorization = 'Bearer ' + State.token;
  let payload;
  if (form) { payload = form; }
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch('/api' + path, { method, headers, body: payload });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401) { clearSession(); location.hash = '#/login'; }
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

// ---------------------------------------------------------------- ui helpers
const $ = (s, r = document) => r.querySelector(s);
const app = () => document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '—';

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  const color = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-brand' : 'bg-navy';
  el.innerHTML = `<div class="${color} text-white px-4 py-3 rounded-xl shadow-lg text-sm fade-in max-w-[90vw]">${esc(msg)}</div>`;
  el.classList.remove('hidden');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 3200);
}
const spinner = (label = 'Loading…') =>
  `<div class="flex items-center justify-center gap-3 py-16 text-mute">
     <svg class="spin w-6 h-6" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#cdd6d1" stroke-width="3"/><path d="M22 12a10 10 0 0 0-10-10" stroke="#1f7a5a" stroke-width="3" stroke-linecap="round"/></svg>
     <span>${label}</span></div>`;
const logo = (size = 40) =>
  `<div class="flex items-center gap-2.5">
     <div class="rounded-xl bg-navy text-white grid place-items-center font-bold" style="width:${size}px;height:${size}px">
       <svg width="${size*0.55}" height="${size*0.55}" viewBox="0 0 24 24" fill="none"><path d="M4 13l4 4L20 5" stroke="#57d9a3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke="#b08a2e" stroke-width="2.5" stroke-linecap="round"/></svg>
     </div>
     <div class="leading-tight"><div class="font-extrabold text-navy">Max Credit</div><div class="text-[11px] text-mute -mt-0.5">Solution</div></div>
   </div>`;

const STATUS = {
  invited:{t:'Invited',c:'bg-slate-100 text-slate-600'},
  application_started:{t:'Application started',c:'bg-amber-100 text-amber-700'},
  deposit_paid:{t:'Deposit paid',c:'bg-blue-100 text-blue-700'},
  documents_uploaded:{t:'Documents uploaded',c:'bg-indigo-100 text-indigo-700'},
  signed:{t:'Signed',c:'bg-violet-100 text-violet-700'},
  active:{t:'Active',c:'bg-emerald-100 text-emerald-700'},
  completed:{t:'Completed',c:'bg-teal-100 text-teal-700'},
  cancelled:{t:'Cancelled',c:'bg-red-100 text-red-700'},
};
const badge = (s) => { const x = STATUS[s] || {t:s,c:'bg-slate-100 text-slate-600'}; return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${x.c}">${x.t}</span>`; };
const payBadge = (s) => ({paid:'bg-emerald-100 text-emerald-700',pending:'bg-amber-100 text-amber-700',failed:'bg-red-100 text-red-700',refunded:'bg-slate-100 text-slate-600'}[s]||'bg-slate-100');

// ---------------------------------------------------------------- router
const routes = {};
function route(path, handler) { routes[path] = handler; }
function navigate(hash) { location.hash = hash; }

async function render() {
  if (!State.config) { try { State.config = (await fetch('/api/public/config').then(r=>r.json())); } catch(_) { State.config = {}; } }
  const hash = location.hash || '#/';
  const [_, seg1, seg2, seg3] = hash.split('/');
  const key = '#/' + (seg1 || '');

  // auth gating
  const publicRoutes = ['#/login', '#/register', '#/apply', '#/'];
  if (!State.token && !publicRoutes.includes(key)) return navigate('#/login');
  if (State.token && (key === '#/login' || key === '#/' )) return navigate(homeFor(State.user));
  // bare root (no hash) → send visitors to the login/sign-in front door
  if (key === '#/') return navigate('#/login');

  const handler = routes[key] || routes['#/404'];
  await handler({ seg1, seg2, seg3, hash });
}
function homeFor(u) {
  if (!u) return '#/login';
  return u.role === 'super_admin' ? '#/admin' : u.role === 'retailer' ? '#/retailer' : '#/portal';
}
window.addEventListener('hashchange', render);
window.addEventListener('load', render);

// ================================================================ AUTH VIEWS
function authShell(inner) {
  const c = State.config || {};
  return `<div class="min-h-dvh grid md:grid-cols-2">
    <div class="hidden md:flex flex-col justify-between bg-navy text-white p-10">
      <div>${logo(44)}</div>
      <div>
        <h1 class="text-4xl font-extrabold leading-tight">Restore your credit,<br>the simple way.</h1>
        <p class="mt-4 text-white/70 max-w-sm">Enroll online in minutes. Upload your documents securely. Track your progress every step of the way.</p>
        <div class="mt-8 space-y-3 text-sm text-white/80">
          ${['Fast online sign-up — no phone tag','Bank-level document handling','14-day money-back guarantee'].map(t=>`<div class="flex items-center gap-2"><span class="text-brand">✓</span> ${t}</div>`).join('')}
        </div>
      </div>
      <div class="text-white/50 text-xs">${esc(c.company||'Max Credit Solution')} · ${esc(c.phone||'')}</div>
    </div>
    <div class="flex items-center justify-center p-6 safe-top safe-bottom">
      <div class="w-full max-w-sm fade-in">${inner}</div>
    </div>
  </div>`;
}

route('#/login', () => {
  app().innerHTML = authShell(`
    <div class="md:hidden mb-6">${logo(44)}</div>
    <h2 class="text-2xl font-bold text-navy">Welcome back</h2>
    <p class="text-mute text-sm mt-1">Log in to your account.</p>
    <form id="loginForm" class="mt-6 space-y-4">
      <div><label class="text-sm font-medium">Email</label>
        <input name="email" type="email" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" placeholder="you@email.com"></div>
      <div><label class="text-sm font-medium">Password</label>
        <input name="password" type="password" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" placeholder="••••••••"></div>
      <button class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl">Log in</button>
    </form>
    <p class="text-sm text-mute mt-5 text-center">New customer? <a href="#/register" class="text-brand font-semibold">Create an account</a></p>
    <div class="mt-6 text-[11px] text-mute bg-paper border border-line rounded-xl p-3">
      <b>Demo logins</b> — Admin: <code>admin@maxcreditsolution.com</code> / <code>Admin@12345</code>
    </div>`);
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const d = await api('/auth/login', { method:'POST', body:{ email:f.email.value.trim(), password:f.password.value }});
      setSession(d.token, d.user); toast('Welcome back!', 'success'); navigate(homeFor(d.user));
    } catch (err) { toast(err.message,'error'); btn.disabled=false; btn.textContent='Log in'; }
  };
});

route('#/register', () => {
  const pendingInvite = sessionStorage.getItem('mcs_invite') || '';
  app().innerHTML = authShell(`
    <div class="md:hidden mb-6">${logo(44)}</div>
    <h2 class="text-2xl font-bold text-navy">Create your account</h2>
    <p class="text-mute text-sm mt-1">Start your credit-restoration enrollment.</p>
    <form id="regForm" class="mt-6 space-y-4">
      <div><label class="text-sm font-medium">Full name</label>
        <input name="name" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" placeholder="Jane Smith"></div>
      <div><label class="text-sm font-medium">Email</label>
        <input name="email" type="email" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" placeholder="you@email.com"></div>
      <div><label class="text-sm font-medium">Phone</label>
        <input name="phone" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" placeholder="(555) 555-5555"></div>
      <div><label class="text-sm font-medium">Password</label>
        <input name="password" type="password" required minlength="6" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" placeholder="At least 6 characters"></div>
      <button class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl">Create account</button>
    </form>
    <p class="text-sm text-mute mt-5 text-center">Already have an account? <a href="#/login" class="text-brand font-semibold">Log in</a></p>`);
  $('#regForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button'); btn.disabled=true; btn.textContent='Creating…';
    try {
      const d = await api('/auth/register', { method:'POST', body:{
        name:f.name.value.trim(), email:f.email.value.trim(), phone:f.phone.value.trim(), password:f.password.value }});
      setSession(d.token, d.user);
      if (pendingInvite) { try { await api('/customer/claim-invite',{method:'POST',body:{token:pendingInvite}}); } catch(_){} sessionStorage.removeItem('mcs_invite'); }
      toast('Account created!', 'success'); navigate('#/portal');
    } catch (err) { toast(err.message,'error'); btn.disabled=false; btn.textContent='Create account'; }
  };
});

// invite landing: /#/apply/<token>  → remember token, send to register/login
route('#/apply', async ({ seg2 }) => {
  if (seg2) sessionStorage.setItem('mcs_invite', seg2);
  const token = seg2 || sessionStorage.getItem('mcs_invite');
  let invite = null;
  try { invite = (await api('/public/invite/' + token)).invite; } catch(_) {}
  if (State.token && State.user?.role === 'customer') {
    try { await api('/customer/claim-invite',{method:'POST',body:{token}}); } catch(_){}
    return navigate('#/portal');
  }
  app().innerHTML = authShell(`
    <div class="md:hidden mb-6">${logo(44)}</div>
    <h2 class="text-2xl font-bold text-navy">You're invited 🎉</h2>
    <p class="text-mute text-sm mt-2">${invite ? `Hi ${esc(invite.first_name||'there')}, you've been invited to enroll with ${esc((State.config||{}).company||'Max Credit Solution')}.` : 'Create an account to begin your enrollment.'}</p>
    <div class="mt-6 space-y-3">
      <a href="#/register" class="btn block text-center bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl">Create my account</a>
      <a href="#/login" class="btn block text-center border border-line font-semibold py-2.5 rounded-xl">I already have an account</a>
    </div>`);
});

// ================================================================ APP SHELL (nav)
function shell(active, content, { title } = {}) {
  const u = State.user;
  const navItems = u.role === 'super_admin'
    ? [['#/admin','Dashboard','grid'],['#/admin/customers','Customers','users'],['#/admin/retailers','Retailers','store'],['#/admin/payments','Payments','card'],['#/admin/activity','Activity','activity']]
    : u.role === 'retailer'
    ? [['#/retailer','Dashboard','grid'],['#/retailer/invite','Invite','plus'],['#/retailer/customers','My Customers','users']]
    : [['#/portal','My Application','file']];
  const icon = (n) => ({
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    users:'M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 20v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
    store:'M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16',
    card:'M2 7h20v11H2zM2 11h20',
    activity:'M22 12h-4l-3 9L9 3l-3 9H2',
    plus:'M12 5v14M5 12h14', file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6'
  }[n]);
  const navLink = ([href,label,ic]) => {
    const on = active === href;
    return `<a href="${href}" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${on?'bg-brand text-white':'text-slate-600 hover:bg-paper'}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon(ic)}"/></svg>${label}</a>`;
  };
  return `<div class="min-h-dvh md:flex">
    <!-- sidebar (desktop) -->
    <aside class="hidden md:flex md:w-64 shrink-0 flex-col border-r border-line bg-white p-4">
      <div class="px-1 py-2">${logo(40)}</div>
      <nav class="mt-4 space-y-1">${navItems.map(navLink).join('')}</nav>
      <div class="mt-auto pt-4 border-t border-line">
        <div class="px-3 py-2 text-sm"><div class="font-semibold text-navy truncate">${esc(u.name)}</div><div class="text-xs text-mute capitalize">${u.role.replace('_',' ')}</div></div>
        <button onclick="doLogout()" class="btn w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50">Log out</button>
      </div>
    </aside>
    <!-- mobile top bar -->
    <div class="md:hidden sticky top-0 z-30 bg-white border-b border-line px-4 py-3 flex items-center justify-between safe-top">
      ${logo(34)}
      <button onclick="doLogout()" class="text-sm font-medium text-red-600">Log out</button>
    </div>
    <main class="flex-1 min-w-0">
      <div class="max-w-5xl mx-auto p-4 md:p-8 pb-28 md:pb-8">
        ${title?`<h1 class="text-2xl font-bold text-navy mb-6">${esc(title)}</h1>`:''}
        <div id="view">${content}</div>
      </div>
    </main>
    <!-- mobile bottom nav -->
    <nav class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line flex safe-bottom">
      ${navItems.map(([href,label,ic])=>{const on=active===href;return `<a href="${href}" class="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${on?'text-brand':'text-slate-500'}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon(ic)}"/></svg>${label}</a>`}).join('')}
    </nav>
  </div>`;
}
window.doLogout = () => { clearSession(); toast('Logged out'); navigate('#/login'); };

function statCard(label, value, sub, color='navy') {
  return `<div class="card p-5">
    <div class="text-sm text-mute">${label}</div>
    <div class="text-3xl font-extrabold text-${color} mt-1">${value}</div>
    ${sub?`<div class="text-xs text-mute mt-1">${sub}</div>`:''}
  </div>`;
}

// ================================================================ SUPER ADMIN
route('#/admin', async ({ seg2, seg3 }) => {
  if (seg2 === 'customers') return adminCustomers(seg3);
  if (seg2 === 'retailers') return adminRetailers();
  if (seg2 === 'payments') return adminPayments();
  if (seg2 === 'activity') return adminActivity();
  // dashboard
  app().innerHTML = shell('#/admin', spinner(), { title:'Dashboard' });
  const s = await api('/admin/stats');
  const act = (await api('/admin/activity')).activity.slice(0, 8);
  $('#view').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${statCard('Customers', s.customers, `${s.leads} leads · ${s.active} active`)}
      ${statCard('Retailers', s.retailers, 'active dealers','navy')}
      ${statCard('Revenue collected', money(s.revenue), 'paid to date','brand')}
      ${statCard('Outstanding', money(s.outstanding), 'pending / failed','gold')}
    </div>
    <div class="grid lg:grid-cols-3 gap-4 mt-4">
      <div class="card p-5">
        <div class="font-semibold text-navy mb-3">Pipeline</div>
        ${[['Leads',s.leads,'bg-amber-400'],['Active',s.active,'bg-emerald-400'],['Completed',s.completed,'bg-teal-400'],['Cancelled',s.cancelled,'bg-red-300']].map(([l,v,c])=>{
          const tot = Math.max(s.applications,1); return `<div class="mb-2.5"><div class="flex justify-between text-sm mb-1"><span class="text-mute">${l}</span><span class="font-semibold">${v}</span></div>
          <div class="h-2 bg-paper rounded-full overflow-hidden"><div class="h-full ${c}" style="width:${(v/tot*100).toFixed(0)}%"></div></div></div>`;}).join('')}
      </div>
      <div class="card p-5 lg:col-span-2">
        <div class="flex items-center justify-between mb-3"><div class="font-semibold text-navy">Recent activity</div><a href="#/admin/activity" class="text-sm text-brand">View all</a></div>
        <div class="space-y-2 text-sm">${act.length?act.map(a=>`<div class="flex items-center justify-between border-b border-line/60 pb-2">
          <span class="text-ink capitalize">${esc(a.action.replace(/_/g,' '))} <span class="text-mute">· ${esc(a.actor_role||'')}</span></span>
          <span class="text-mute text-xs">${fmtDate(a.created_at)}</span></div>`).join(''):'<div class="text-mute">No activity yet.</div>'}</div>
      </div>
    </div>
    <div class="card p-5 mt-4">
      <div class="font-semibold text-navy">Current plan pricing</div>
      <p class="text-sm text-mute mt-1">Sign-up ${money(s.pricing.signup)} + ${money(s.pricing.monthly)}/month for ${s.pricing.months} months. Change these via environment variables (see README).</p>
    </div>`;
});

async function adminCustomers(id) {
  if (id) return adminCustomerDetail(id);
  app().innerHTML = shell('#/admin/customers', spinner(), { title:'Customers' });
  const filters = ['all','invited','application_started','deposit_paid','documents_uploaded','signed','active','completed','cancelled'];
  const load = async (status='all', q='') => {
    const d = await api(`/admin/applications?status=${status}&q=${encodeURIComponent(q)}`);
    return d.applications;
  };
  const rows = await load();
  $('#view').innerHTML = `
    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      <input id="q" placeholder="Search name, email, phone…" class="flex-1 px-3.5 py-2.5 rounded-xl border border-line bg-white">
      <select id="status" class="px-3.5 py-2.5 rounded-xl border border-line bg-white">
        ${filters.map(f=>`<option value="${f}">${f==='all'?'All statuses':(STATUS[f]?.t||f)}</option>`).join('')}</select>
    </div>
    <div id="list" class="card overflow-hidden"></div>`;
  const draw = (list) => {
    $('#list').innerHTML = list.length ? `
      <div class="overflow-x-auto"><table class="w-full text-sm">
        <thead class="bg-paper text-mute"><tr>
          <th class="text-left font-medium px-4 py-3">Customer</th>
          <th class="text-left font-medium px-4 py-3 hidden sm:table-cell">Contact</th>
          <th class="text-left font-medium px-4 py-3">Status</th>
          <th class="text-right font-medium px-4 py-3 hidden sm:table-cell">Paid</th>
          <th class="text-right font-medium px-4 py-3">Updated</th></tr></thead>
        <tbody>${list.map(a=>`<tr class="border-t border-line hover:bg-paper cursor-pointer" onclick="location.hash='#/admin/customers/${a.id}'">
          <td class="px-4 py-3"><div class="font-semibold text-navy">${esc((a.first_name||'')+' '+(a.last_name||''))||'<span class=text-mute>Unnamed</span>'}</div><div class="text-xs text-mute sm:hidden">${esc(a.email||'')}</div></td>
          <td class="px-4 py-3 hidden sm:table-cell text-mute">${esc(a.email||'—')}<div class="text-xs">${esc(a.phone||'')}</div></td>
          <td class="px-4 py-3">${badge(a.status)}</td>
          <td class="px-4 py-3 text-right hidden sm:table-cell font-semibold">${money(a.total_paid)}</td>
          <td class="px-4 py-3 text-right text-mute text-xs">${fmtDate(a.updated_at)}</td></tr>`).join('')}</tbody>
      </table></div>` : `<div class="p-10 text-center text-mute">No customers found.</div>`;
  };
  draw(rows);
  let t; const refresh = async () => { const list = await load($('#status').value, $('#q').value.trim()); draw(list); };
  $('#q').oninput = () => { clearTimeout(t); t = setTimeout(refresh, 250); };
  $('#status').onchange = refresh;
}

async function adminCustomerDetail(id) {
  app().innerHTML = shell('#/admin/customers', spinner());
  const { application: a } = await api('/admin/applications/' + id);
  const docLink = (d) => `<a href="/api/admin/documents/${d.id}" target="_blank" class="text-brand hover:underline">${esc(d.doc_type.replace(/_/g,' '))}</a>`;
  $('#view').innerHTML = `
    <a href="#/admin/customers" class="text-sm text-brand">← Back to customers</a>
    <div class="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
      <div><h1 class="text-2xl font-bold text-navy">${esc((a.first_name||'')+' '+(a.last_name||''))||'Unnamed applicant'}</h1>
        <div class="text-mute text-sm">${esc(a.email||'')} · ${esc(a.phone||'')}</div></div>
      ${badge(a.status)}
    </div>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="card p-5 lg:col-span-2 space-y-4">
        <div><div class="font-semibold text-navy mb-2">Applicant details</div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            ${[['Address',a.address],['City',a.city],['State',a.state],['ZIP',a.zip],['Time zone',a.timezone],['Date of birth',a.dob],['Retailer',a.retailer_name||'Direct sign-up'],['Synced to engine',a.synced_engine?'Yes':'No']]
              .map(([k,v])=>`<div><div class="text-mute text-xs">${k}</div><div class="font-medium">${esc(v||'—')}</div></div>`).join('')}
          </div></div>
        <div><div class="font-semibold text-navy mb-2">Documents</div>
          <div class="flex flex-wrap gap-2 text-sm">${a.documents.length?a.documents.map(d=>`<span class="px-3 py-1.5 bg-paper rounded-lg border border-line">${docLink(d)}</span>`).join(''):'<span class="text-mute">No documents uploaded.</span>'}</div></div>
        <div><div class="font-semibold text-navy mb-2">Payments</div>
          <div class="space-y-2 text-sm">${a.payments.length?a.payments.map(p=>`<div class="flex items-center justify-between border border-line rounded-lg px-3 py-2">
            <span class="capitalize">${p.kind} ${p.period?`· ${p.period}`:''}</span>
            <span class="flex items-center gap-2"><b>${money(p.amount)}</b><span class="px-2 py-0.5 rounded-full text-xs ${payBadge(p.status)}">${p.status}</span></span></div>`).join(''):'<span class="text-mute">No payments yet.</span>'}</div></div>
      </div>
      <div class="card p-5 space-y-4 h-fit">
        <div class="font-semibold text-navy">Manage</div>
        <div><label class="text-sm font-medium">Status</label>
          <select id="st" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line bg-white">
            ${Object.keys(STATUS).map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${STATUS[s].t}</option>`).join('')}</select></div>
        <div><label class="text-sm font-medium">Internal notes</label>
          <textarea id="notes" rows="4" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line" placeholder="Add a note…">${esc(a.notes||'')}</textarea></div>
        <button id="save" class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl">Save changes</button>
        <div class="text-xs text-mute pt-2 border-t border-line">Total paid: <b>${money(a.total_paid)}</b><br>Signed: ${a.signed_at?fmtDate(a.signed_at)+' by '+esc(a.signed_name||''):'Not signed'}</div>
      </div>
    </div>`;
  $('#save').onclick = async () => {
    try { await api('/admin/applications/'+id, { method:'PATCH', body:{ status:$('#st').value, notes:$('#notes').value }});
      toast('Saved','success'); } catch(e){ toast(e.message,'error'); }
  };
}

async function adminRetailers() {
  app().innerHTML = shell('#/admin/retailers', spinner(), { title:'Retailers' });
  const draw = async () => {
    const { retailers } = await api('/admin/retailers');
    $('#list').innerHTML = retailers.length ? `
      <div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="bg-paper text-mute"><tr>
        <th class="text-left font-medium px-4 py-3">Retailer</th><th class="text-left font-medium px-4 py-3 hidden sm:table-cell">Company</th>
        <th class="text-center font-medium px-4 py-3">Customers</th><th class="text-center font-medium px-4 py-3">Status</th><th></th></tr></thead>
      <tbody>${retailers.map(r=>`<tr class="border-t border-line">
        <td class="px-4 py-3"><div class="font-semibold text-navy">${esc(r.name)}</div><div class="text-xs text-mute">${esc(r.email)}</div></td>
        <td class="px-4 py-3 hidden sm:table-cell text-mute">${esc(r.company||'—')}</td>
        <td class="px-4 py-3 text-center font-semibold">${r.customers}</td>
        <td class="px-4 py-3 text-center">${r.active?'<span class="text-emerald-600 text-xs font-semibold">Active</span>':'<span class="text-red-500 text-xs font-semibold">Disabled</span>'}</td>
        <td class="px-4 py-3 text-right"><button onclick="toggleRetailer('${r.id}',${r.active?0:1})" class="text-xs text-brand font-medium">${r.active?'Disable':'Enable'}</button></td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="p-10 text-center text-mute">No retailers yet. Add your first one.</div>';
  };
  $('#view').innerHTML = `
    <div class="flex justify-end mb-4"><button onclick="showRetailerModal()" class="btn bg-brand hover:bg-brandDark text-white font-semibold px-4 py-2.5 rounded-xl">+ Add retailer</button></div>
    <div id="list" class="card overflow-hidden"></div>`;
  await draw();
  window._redrawRetailers = draw;
}
window.toggleRetailer = async (id, active) => { try { await api('/admin/retailers/'+id,{method:'PATCH',body:{active:!!active}}); toast('Updated','success'); window._redrawRetailers(); } catch(e){toast(e.message,'error');} };
window.showRetailerModal = () => {
  const m = document.createElement('div');
  m.className = 'fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4';
  m.innerHTML = `<div class="card p-6 w-full max-w-md fade-in bg-white">
    <div class="font-bold text-navy text-lg mb-4">Add retailer</div>
    <form id="rf" class="space-y-3">
      ${['name:Full name:text','company:Company:text','email:Email:email','phone:Phone:text','password:Temp password:text','commission:Commission %:number']
        .map(x=>{const[n,l,t]=x.split(':');return `<div><label class="text-sm font-medium">${l}</label><input name="${n}" type="${t}" ${['name','email','password'].includes(n)?'required':''} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line"></div>`}).join('')}
      <div class="flex gap-2 pt-2"><button type="button" onclick="this.closest('.fixed').remove()" class="btn flex-1 border border-line py-2.5 rounded-xl font-medium">Cancel</button>
      <button class="btn flex-1 bg-brand text-white py-2.5 rounded-xl font-semibold">Create</button></div>
    </form></div>`;
  document.body.appendChild(m);
  $('#rf', m).onsubmit = async (e) => { e.preventDefault(); const f=e.target;
    try { await api('/admin/retailers',{method:'POST',body:{name:f.name.value,company:f.company.value,email:f.email.value,phone:f.phone.value,password:f.password.value,commission:f.commission.value}});
      m.remove(); toast('Retailer created','success'); window._redrawRetailers(); } catch(err){ toast(err.message,'error'); } };
};

async function adminPayments() {
  app().innerHTML = shell('#/admin/payments', spinner(), { title:'Payments' });
  const { payments } = await api('/admin/payments');
  $('#view').innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <p class="text-sm text-mute">All sign-up and monthly charges across customers.</p>
      <button id="runBill" class="btn bg-navy hover:bg-navy/90 text-white font-semibold px-4 py-2.5 rounded-xl">Run monthly billing</button>
    </div>
    <div class="card overflow-hidden">${payments.length?`
      <div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="bg-paper text-mute"><tr><th class="text-left font-medium px-4 py-3">Customer</th>
        <th class="text-left font-medium px-4 py-3">Type</th><th class="text-left font-medium px-4 py-3 hidden sm:table-cell">Period</th>
        <th class="text-right font-medium px-4 py-3">Amount</th><th class="text-center font-medium px-4 py-3">Status</th>
        <th class="text-right font-medium px-4 py-3 hidden sm:table-cell">Date</th></tr></thead>
      <tbody>${payments.map(p=>`<tr class="border-t border-line">
        <td class="px-4 py-3 font-medium text-navy">${esc((p.first_name||'')+' '+(p.last_name||''))||esc(p.email||'—')}</td>
        <td class="px-4 py-3 capitalize">${p.kind}</td>
        <td class="px-4 py-3 hidden sm:table-cell text-mute">${p.period||'—'}</td>
        <td class="px-4 py-3 text-right font-semibold">${money(p.amount)}</td>
        <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs ${payBadge(p.status)}">${p.status}</span></td>
        <td class="px-4 py-3 text-right text-mute text-xs hidden sm:table-cell">${fmtDate(p.created_at)}</td></tr>`).join('')}</tbody>
      </table></div>`:'<div class="p-10 text-center text-mute">No payments yet.</div>'}</div>`;
  $('#runBill').onclick = async () => {
    if (!confirm('Create this month’s pending charges for all active customers and email them a payment request?')) return;
    try { const d = await api('/admin/billing/run',{method:'POST'}); toast(`Billing run complete — ${d.created} charge(s) created`,'success'); adminPayments(); }
    catch(e){ toast(e.message,'error'); }
  };
}

async function adminActivity() {
  app().innerHTML = shell('#/admin/activity', spinner(), { title:'Activity log' });
  const { activity } = await api('/admin/activity');
  $('#view').innerHTML = `<div class="card divide-y divide-line">${activity.length?activity.map(a=>`
    <div class="flex items-center justify-between px-4 py-3 text-sm">
      <div><span class="font-medium text-navy capitalize">${esc(a.action.replace(/_/g,' '))}</span>
        <span class="text-mute">· ${esc(a.actor_role||'system')}</span></div>
      <span class="text-mute text-xs">${fmtDate(a.created_at)}</span></div>`).join(''):'<div class="p-10 text-center text-mute">No activity yet.</div>'}</div>`;
}

// ================================================================ RETAILER
route('#/retailer', async ({ seg2 }) => {
  if (seg2 === 'invite') return retailerInvite();
  if (seg2 === 'customers') return retailerCustomers();
  app().innerHTML = shell('#/retailer', spinner(), { title:'Dashboard' });
  const s = await api('/retailer/stats');
  $('#view').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${statCard('My customers', s.total, 'total referred')}
      ${statCard('Leads', s.leads, 'not yet paid','gold')}
      ${statCard('Active', s.active, 'in progress','brand')}
      ${statCard('Completed', s.completed, 'finished')}
    </div>
    <div class="card p-6 mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div><div class="font-semibold text-navy text-lg">Invite a customer</div>
        <p class="text-mute text-sm mt-1">Send an application invitation by email and get a shareable link.</p></div>
      <a href="#/retailer/invite" class="btn bg-brand hover:bg-brandDark text-white font-semibold px-5 py-2.5 rounded-xl whitespace-nowrap">+ New invitation</a>
    </div>`;
});

async function retailerInvite() {
  app().innerHTML = shell('#/retailer/invite', `
    <div class="max-w-lg">
      <div class="card p-6">
        <div class="font-semibold text-navy text-lg mb-1">Invite a customer</div>
        <p class="text-sm text-mute mb-5">They'll get an email with a link to start their application.</p>
        <form id="inv" class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-sm font-medium">First name</label><input name="first_name" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
            <div><label class="text-sm font-medium">Last name</label><input name="last_name" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
          </div>
          <div><label class="text-sm font-medium">Email *</label><input name="email" type="email" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
          <div><label class="text-sm font-medium">Phone</label><input name="phone" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
          <button class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl">Send invitation</button>
        </form>
      </div>
      <div id="result" class="mt-4"></div>
    </div>`, { title:'New invitation' });
  $('#inv').onsubmit = async (e) => { e.preventDefault(); const f=e.target; const btn=f.querySelector('button'); btn.disabled=true; btn.textContent='Sending…';
    try { const d = await api('/retailer/invite',{method:'POST',body:{first_name:f.first_name.value,last_name:f.last_name.value,email:f.email.value,phone:f.phone.value}});
      const link = location.origin + '/' + d.invite_link;
      $('#result').innerHTML = `<div class="card p-5 border-brand/30 bg-emerald-50/40">
        <div class="font-semibold text-brand">✓ Invitation sent</div>
        <p class="text-sm text-mute mt-1">Share this link with the customer:</p>
        <div class="flex gap-2 mt-2"><input readonly value="${esc(link)}" class="flex-1 px-3 py-2 rounded-lg border border-line text-sm bg-white">
          <button onclick="navigator.clipboard.writeText('${esc(link)}');toast('Link copied','success')" class="btn bg-navy text-white px-3 rounded-lg text-sm">Copy</button></div></div>`;
      f.reset(); } catch(err){ toast(err.message,'error'); }
    btn.disabled=false; btn.textContent='Send invitation'; };
}

async function retailerCustomers() {
  app().innerHTML = shell('#/retailer/customers', spinner(), { title:'My customers' });
  const { customers } = await api('/retailer/customers');
  $('#view').innerHTML = `<div class="card overflow-hidden">${customers.length?`
    <div class="overflow-x-auto"><table class="w-full text-sm">
    <thead class="bg-paper text-mute"><tr><th class="text-left font-medium px-4 py-3">Customer</th>
      <th class="text-left font-medium px-4 py-3 hidden sm:table-cell">Email</th><th class="text-left font-medium px-4 py-3">Status</th>
      <th class="text-right font-medium px-4 py-3">Paid</th></tr></thead>
    <tbody>${customers.map(a=>`<tr class="border-t border-line">
      <td class="px-4 py-3 font-medium text-navy">${esc((a.first_name||'')+' '+(a.last_name||''))||'—'}</td>
      <td class="px-4 py-3 hidden sm:table-cell text-mute">${esc(a.email||'')}</td>
      <td class="px-4 py-3">${badge(a.status)}</td>
      <td class="px-4 py-3 text-right font-semibold">${money(a.total_paid)}</td></tr>`).join('')}</tbody>
    </table></div>`:'<div class="p-10 text-center text-mute">No customers yet. Send your first invitation.</div>'}</div>`;
}

// ================================================================ CUSTOMER PORTAL
route('#/portal', async () => {
  app().innerHTML = shell('#/portal', spinner());
  const { application: a, pricing } = await api('/customer/application');
  State.pricing = pricing;
  if (!a || ['invited','application_started'].includes(a.status)) return customerWizard(a, pricing);
  return customerStatus(a, pricing);
});

const STEPS = ['Your details','Deposit','Documents','Sign & finish'];
function stepper(current) {
  return `<div class="flex items-center gap-1 mb-6">${STEPS.map((s,i)=>`
    <div class="flex-1 flex items-center gap-1">
      <div class="flex flex-col items-center flex-1">
        <div class="w-8 h-8 rounded-full grid place-items-center text-sm font-bold ${i<current?'bg-brand text-white':i===current?'bg-navy text-white':'bg-paper text-mute border border-line'}">${i<current?'✓':i+1}</div>
        <div class="text-[10px] mt-1 text-center ${i===current?'text-navy font-semibold':'text-mute'}">${s}</div>
      </div>
      ${i<STEPS.length-1?`<div class="step-line flex-1 rounded ${i<current?'bg-brand':'bg-line'}"></div>`:''}
    </div>`).join('')}</div>`;
}

function customerWizard(a, pricing) {
  // determine current step
  let step = 0;
  window._appState = a || {};
  renderStep(step, a, pricing);
}

function renderStep(step, a, pricing) {
  const box = (inner) => `<div class="max-w-lg mx-auto fade-in"><div class="card p-6 md:p-8">${stepper(step)}${inner}</div></div>`;
  if (step === 0) {
    app().innerHTML = shell('#/portal', box(`
      <h2 class="text-xl font-bold text-navy">Tell us about you</h2>
      <p class="text-sm text-mute mt-1 mb-5">This information starts your credit-restoration file.</p>
      <form id="s0" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-sm font-medium">First name *</label><input name="first_name" required value="${esc(a?.first_name||'')}" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
          <div><label class="text-sm font-medium">Last name *</label><input name="last_name" required value="${esc(a?.last_name||'')}" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
        </div>
        <div><label class="text-sm font-medium">Email *</label><input name="email" type="email" required value="${esc(a?.email||State.user.email||'')}" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
        <div><label class="text-sm font-medium">Phone *</label><input name="phone" required value="${esc(a?.phone||'')}" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
        <div><label class="text-sm font-medium">Street address</label><input name="address" value="${esc(a?.address||'')}" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line"></div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="text-sm font-medium">City</label><input name="city" value="${esc(a?.city||'')}" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line"></div>
          <div><label class="text-sm font-medium">State</label><input name="state" value="${esc(a?.state||'')}" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line"></div>
          <div><label class="text-sm font-medium">ZIP</label><input name="zip" value="${esc(a?.zip||'')}" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-sm font-medium">Time zone</label><select name="timezone" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line bg-white">
            ${['','ET','CT','MT','PT'].map(z=>`<option ${a?.timezone===z?'selected':''}>${z||'Select…'}</option>`).join('')}</select></div>
          <div><label class="text-sm font-medium">Date of birth</label><input name="dob" type="date" value="${esc(a?.dob||'')}" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-line"></div>
        </div>
        <button class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl mt-2">Continue to deposit →</button>
      </form>`));
    $('#s0').onsubmit = async (e) => { e.preventDefault(); const f=e.target; const btn=f.querySelector('button'); btn.disabled=true;
      try { const body={}; ['first_name','last_name','email','phone','address','city','state','zip','timezone','dob'].forEach(k=>body[k]=f[k].value);
        const d = await api('/customer/application/details',{method:'POST',body}); window._appState = {...window._appState, ...body, id:d.application_id};
        renderStep(1, window._appState, pricing); } catch(err){ toast(err.message,'error'); btn.disabled=false; } };
    return;
  }
  if (step === 1) {
    const total = pricing.signup + pricing.monthly * pricing.months;
    app().innerHTML = shell('#/portal', box(`
      <h2 class="text-xl font-bold text-navy">Secure your enrollment</h2>
      <p class="text-sm text-mute mt-1 mb-5">A one-time deposit starts your file today.</p>
      <div class="rounded-2xl border border-line overflow-hidden mb-5">
        <div class="bg-navy text-white p-5"><div class="text-sm text-white/70">Due today</div><div class="text-4xl font-extrabold">${money(pricing.signup)}</div></div>
        <div class="p-4 text-sm space-y-1.5">
          <div class="flex justify-between"><span class="text-mute">Then monthly</span><span class="font-semibold">${money(pricing.monthly)} / mo</span></div>
          <div class="flex justify-between"><span class="text-mute">Plan length</span><span class="font-semibold">${pricing.months} months</span></div>
          <div class="flex justify-between border-t border-line pt-1.5"><span class="text-mute">Program total</span><span class="font-semibold">${money(total)}</span></div>
        </div>
      </div>
      <div class="flex gap-2 items-start bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 mb-5">
        <span>🛡️</span><span><b>${pricing.cancelWindowDays}-day money-back guarantee.</b> Not satisfied? Call us within ${pricing.cancelWindowDays} days for a full refund.</span></div>
      <div id="payArea"></div>
      <button id="cancelStep" class="btn w-full text-mute text-sm py-2 mt-2">← Back</button>`));
    $('#cancelStep').onclick = () => renderStep(0, window._appState, pricing);
    mountPayment('payArea', 'signup', pricing.signup, () => renderStep(2, window._appState, pricing));
    return;
  }
  if (step === 2) {
    app().innerHTML = shell('#/portal', box(`
      <h2 class="text-xl font-bold text-navy">Upload your documents</h2>
      <p class="text-sm text-mute mt-1 mb-5">We need a photo of your ID and Social Security card. On your phone you can snap a picture directly.</p>
      <form id="s2" class="space-y-4">
        ${docUpload('id_front','Driver’s License / ID — Front', true)}
        ${docUpload('id_back','Driver’s License / ID — Back', false)}
        ${docUpload('ssn_card','Social Security Card', true)}
        ${docUpload('proof_address','Proof of Address (optional)', false)}
        <button class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-2.5 rounded-xl mt-2">Upload & continue →</button>
      </form>
      <button id="skipDocs" class="btn w-full text-mute text-sm py-2 mt-1">Skip for now</button>`));
    $('#skipDocs').onclick = () => renderStep(3, window._appState, pricing);
    $('#s2').onsubmit = async (e) => { e.preventDefault(); const f=e.target; const btn=f.querySelector('button');
      const fd = new FormData(); let count=0;
      ['id_front','id_back','ssn_card','proof_address'].forEach(t=>{ const inp=f['file_'+t]; if(inp&&inp.files[0]){ fd.append('files',inp.files[0]); fd.append('doc_type',t); count++; }});
      if(!count){ toast('Please add at least your ID front and SSN card','error'); return; }
      btn.disabled=true; btn.textContent='Uploading…';
      try { await api('/customer/application/documents',{method:'POST',form:fd}); toast('Documents uploaded','success'); renderStep(3, window._appState, pricing); }
      catch(err){ toast(err.message,'error'); btn.disabled=false; btn.textContent='Upload & continue →'; } };
    // preview filenames
    document.querySelectorAll('input[type=file]').forEach(inp=>inp.onchange=()=>{ const lbl=inp.closest('label').querySelector('.fname'); if(lbl) lbl.textContent = inp.files[0]?inp.files[0].name:''; });
    return;
  }
  if (step === 3) {
    app().innerHTML = shell('#/portal', box(`
      <h2 class="text-xl font-bold text-navy">Review & sign</h2>
      <p class="text-sm text-mute mt-1 mb-4">By signing, you authorize ${esc((State.config||{}).company||'Max Credit Solution')} to begin working on your credit file.</p>
      <div class="bg-paper border border-line rounded-xl p-4 text-sm text-mute max-h-40 overflow-y-auto mb-4 leading-relaxed">
        <p class="mb-2"><b>Service Agreement (summary).</b> You are enrolling in a credit-restoration program. A one-time deposit of ${money(State.pricing.signup)} is due today, followed by ${money(State.pricing.monthly)}/month for ${State.pricing.months} months. You may cancel within ${State.pricing.cancelWindowDays} days for a full refund. This is a summary for demonstration — your final agreement text should be reviewed by counsel.</p>
      </div>
      <form id="s3" class="space-y-4">
        <label class="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required class="mt-1"> I have read and agree to the Service Agreement and authorize the charges above.</label>
        <div><label class="text-sm font-medium">Type your full legal name to sign *</label>
          <input name="signed_name" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-line" style="font-family:'Segoe Script','Bradley Hand',cursive;font-size:1.3rem" placeholder="Your signature"></div>
        <button class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-3 rounded-xl">Complete enrollment ✓</button>
      </form>`));
    $('#s3').onsubmit = async (e) => { e.preventDefault(); const f=e.target; const btn=f.querySelector('button'); btn.disabled=true; btn.textContent='Finishing…';
      try { await api('/customer/application/sign',{method:'POST',body:{signed_name:f.signed_name.value,agree:f.agree.checked}});
        toast('Enrollment complete! 🎉','success'); navigate('#/portal'); render(); }
      catch(err){ toast(err.message,'error'); btn.disabled=false; btn.textContent='Complete enrollment ✓'; } };
    return;
  }
}

function docUpload(type, label, required) {
  return `<label class="block border-2 border-dashed border-line rounded-xl p-4 cursor-pointer hover:border-brand transition">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-paper grid place-items-center text-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </div>
      <div class="flex-1 min-w-0"><div class="text-sm font-medium text-navy">${label} ${required?'<span class="text-red-500">*</span>':''}</div>
        <div class="text-xs text-mute fname">Tap to take a photo or choose a file</div></div>
    </div>
    <input type="file" name="file_${type}" accept="image/*,application/pdf" capture="environment" class="hidden">
  </label>`;
}

// Payment mount — demo mode (instant) OR Stripe Elements (live keys)
async function mountPayment(elId, kind, amount, onPaid) {
  const el = document.getElementById(elId);
  const cfg = State.config || {};
  const live = cfg.stripe && cfg.stripe.live;
  if (!live) {
    el.innerHTML = `<button id="payBtn" class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-3 rounded-xl">Pay ${money(amount)} & continue</button>
      <p class="text-center text-xs text-mute mt-2">Demo mode — no real card is charged. Add Stripe keys to go live.</p>`;
    $('#payBtn').onclick = async (e) => { e.target.disabled=true; e.target.textContent='Processing…';
      try { const intent = await api('/customer/payment/intent',{method:'POST',body:{kind}});
        await api('/customer/payment/confirm',{method:'POST',body:{intentId:intent.intentId,kind}});
        toast('Payment successful','success'); onPaid(); }
      catch(err){ toast(err.message,'error'); e.target.disabled=false; e.target.textContent=`Pay ${money(amount)} & continue`; } };
    return;
  }
  // live Stripe Elements
  el.innerHTML = `<div id="pel" class="p-3 border border-line rounded-xl mb-3"></div>
    <button id="payBtn" class="btn w-full bg-brand hover:bg-brandDark text-white font-semibold py-3 rounded-xl">Pay ${money(amount)}</button>
    <p id="perr" class="text-center text-xs text-red-500 mt-2"></p>`;
  try {
    const intent = await api('/customer/payment/intent',{method:'POST',body:{kind}});
    const stripe = Stripe(cfg.stripe.publishableKey);
    const elements = stripe.elements({ clientSecret: intent.clientSecret });
    const pe = elements.create('payment'); pe.mount('#pel');
    $('#payBtn').onclick = async () => {
      $('#payBtn').disabled = true; $('#payBtn').textContent='Processing…';
      const { error } = await stripe.confirmPayment({ elements, redirect:'if_required' });
      if (error) { $('#perr').textContent = error.message; $('#payBtn').disabled=false; $('#payBtn').textContent=`Pay ${money(amount)}`; return; }
      await api('/customer/payment/confirm',{method:'POST',body:{intentId:intent.intentId,kind}});
      toast('Payment successful','success'); onPaid();
    };
  } catch (err) { el.innerHTML = `<p class="text-red-500 text-sm">${esc(err.message)}</p>`; }
}

function customerStatus(a, pricing) {
  const done = ['deposit_paid','documents_uploaded','signed','active','completed'];
  const paidTotal = a.total_paid || 0;
  const monthsPaid = a.payments.filter(p=>p.kind==='monthly'&&p.status==='paid').length;
  const pendingMonthly = a.payments.find(p=>p.kind==='monthly'&&p.status!=='paid');
  app().innerHTML = shell('#/portal', `
    <div class="max-w-2xl mx-auto">
      <div class="card p-6 md:p-8 text-center bg-gradient-to-b from-emerald-50/60 to-white">
        <div class="w-16 h-16 rounded-full bg-brand text-white grid place-items-center mx-auto text-3xl">✓</div>
        <h2 class="text-2xl font-bold text-navy mt-4">You're enrolled!</h2>
        <p class="text-mute mt-1">${a.status==='completed'?'Your program is complete.':'Our team is working on your credit file. A representative will reach out within 7 days.'}</p>
        <div class="mt-2">${badge(a.status)}</div>
      </div>
      <div class="grid sm:grid-cols-3 gap-4 mt-4">
        ${statCard('Paid to date', money(paidTotal),'total')}
        ${statCard('Months paid', monthsPaid+' / '+pricing.months,'monthly plan','brand')}
        ${statCard('Monthly', money(pricing.monthly),'per month','gold')}
      </div>
      ${pendingMonthly?`<div class="card p-5 mt-4 border-amber-300 bg-amber-50/50">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div><div class="font-semibold text-navy">Monthly payment due</div><div class="text-sm text-mute">${money(pendingMonthly.amount)} for ${pendingMonthly.period}</div></div>
          <div id="mpay" class="w-full sm:w-auto"></div></div></div>`:''}
      <div class="card p-6 mt-4">
        <div class="font-semibold text-navy mb-3">Your progress</div>
        ${['Application submitted','Deposit paid','Documents uploaded','Agreement signed','Active — work in progress']
          .map((t,i)=>{const reached = i===0 || (i===1&&done.includes(a.status)) || (i===2&&['documents_uploaded','signed','active','completed'].includes(a.status)) || (i===3&&['signed','active','completed'].includes(a.status)) || (i===4&&['active','completed'].includes(a.status));
          return `<div class="flex items-center gap-3 py-2"><div class="w-6 h-6 rounded-full grid place-items-center text-xs ${reached?'bg-brand text-white':'bg-paper text-mute border border-line'}">${reached?'✓':i+1}</div><span class="${reached?'text-navy font-medium':'text-mute'}">${t}</span></div>`;}).join('')}
      </div>
      <div class="card p-5 mt-4 text-sm text-mute">Questions? Call us at <b class="text-navy">${esc((State.config||{}).phone||'')}</b>. You may cancel within ${pricing.cancelWindowDays} days of enrollment for a full refund.</div>
    </div>`);
  if (pendingMonthly) mountPayment('mpay','monthly',pendingMonthly.amount, ()=>{ toast('Thank you!','success'); render(); });
}

// ---------------------------------------------------------------- 404
route('#/404', () => { app().innerHTML = authShell(`<div class="text-center"><h2 class="text-2xl font-bold text-navy">Page not found</h2><a href="#/" class="text-brand mt-3 inline-block">Go home</a></div>`); });
