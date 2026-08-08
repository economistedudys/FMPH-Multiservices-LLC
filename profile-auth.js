// Real account system for My Profile, backed by Supabase (Auth + Database + Storage).
// Also tracks which job a candidate applies to (via ?apply=CODE&title=... on this page's URL).
// Requires supabase-config.js (loaded before this file) with a real project URL + anon key.

document.addEventListener('DOMContentLoaded', () => {
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.startsWith('PASTE_')) {
    showSetupWarning();
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const tabsWrap = document.querySelector('.profile-tabs');
  const accountView = document.getElementById('accountView');
  const formsView = document.getElementById('formsView');
  const applyBanner = document.getElementById('applyBanner');
  const applyBannerTitle = document.getElementById('applyBannerTitle');
  const applyConfirm = document.getElementById('applyConfirm');
  const applyConfirmTitle = document.getElementById('applyConfirmTitle');
  const applyConfirmBtn = document.getElementById('applyConfirmBtn');

  // ---------- pending application (from ?apply=ID&title=...&cat=CODE) ----------
  const params = new URLSearchParams(window.location.search);
  const applyId = params.get('apply');
  const applyTitle = params.get('title');
  const applyCat = params.get('cat');
  if (applyId && applyTitle) {
    sessionStorage.setItem('pendingApplication', JSON.stringify({ id: applyId, title: applyTitle, cat: applyCat || '' }));
  }
  function getPendingApplication(){
    const raw = sessionStorage.getItem('pendingApplication');
    return raw ? JSON.parse(raw) : null;
  }

  // ---------- helpers ----------
  function setStatus(form, message, isError){
    let box = form.querySelector('.form-status');
    if (!box) {
      box = document.createElement('p');
      box.className = 'form-status';
      form.appendChild(box);
    }
    box.textContent = message;
    box.style.color = isError ? '#C4433A' : 'var(--ledger)';
    box.style.fontSize = '13.5px';
    box.style.marginTop = '4px';
  }

  function setLoading(form, isLoading, label){
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Please wait…' : label;
  }

  async function loadApplications(userId){
    const listEl = document.getElementById('applicationsList');
    const { data, error } = await sb
      .from('applications')
      .select('job_id, job_title, job_category, status, applied_at')
      .eq('candidate_id', userId)
      .order('applied_at', { ascending: false });

    if (error || !data || data.length === 0) {
      listEl.innerHTML = '<p style="color:var(--ink-soft); font-size:14px;">No applications yet.</p>';
      return [];
    }

    const statusColors = {
      'Submitted': { bg: 'rgba(14,124,107,.12)', text: 'var(--ledger-deep)' },
      'Under Review': { bg: 'rgba(42,111,176,.12)', text: '#2A6FB0' },
      'Interview': { bg: 'rgba(217,103,63,.14)', text: 'var(--amber)' },
      'Offer': { bg: 'rgba(14,124,107,.18)', text: 'var(--ledger-deep)' },
      'Hired': { bg: 'rgba(14,124,107,.22)', text: 'var(--ledger-deep)' },
      'Not Selected': { bg: 'rgba(196,67,58,.12)', text: '#C4433A' }
    };

    listEl.innerHTML = data.map(a => {
      const s = statusColors[a.status] || statusColors['Submitted'];
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--line); border-radius:2px; padding:12px 14px; gap:12px;">
        <div>
          <div style="font-weight:600; font-size:14px;">${a.job_title}</div>
          <div style="font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--ink-soft);">${a.job_category || ''} · Applied ${new Date(a.applied_at).toLocaleDateString()}</div>
        </div>
        <span style="font-family:'IBM Plex Mono',monospace; font-size:11px; padding:4px 10px; border-radius:20px; white-space:nowrap; background:${s.bg}; color:${s.text};">${a.status || 'Submitted'}</span>
      </div>
    `;
    }).join('');
    return data;
  }

  async function maybeShowApplyConfirm(userId){
    const pending = getPendingApplication();
    if (!pending) { applyConfirm.style.display = 'none'; return; }

    const existing = await loadApplications(userId);
    const alreadyApplied = existing.some(a => a.job_id === pending.id);
    if (alreadyApplied) {
      sessionStorage.removeItem('pendingApplication');
      applyConfirm.style.display = 'none';
      return;
    }

    applyConfirmTitle.textContent = pending.title;
    applyConfirm.style.display = 'block';
  }

  applyConfirmBtn.addEventListener('click', async () => {
    const pending = getPendingApplication();
    if (!pending) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    applyConfirmBtn.disabled = true;
    applyConfirmBtn.textContent = 'Submitting…';

    const { error } = await sb.from('applications').insert({
      candidate_id: user.id,
      job_id: pending.id,
      job_title: pending.title,
      job_category: pending.cat,
      status: 'Submitted'
    });

    if (!error) {
      sessionStorage.removeItem('pendingApplication');
      applyConfirm.innerHTML = '<p style="margin:0; color:var(--ledger); font-weight:600;">Application submitted ✓</p>';
      loadApplications(user.id);
    } else {
      applyConfirmBtn.disabled = false;
      applyConfirmBtn.textContent = 'Confirm application';
      setStatus(applyConfirm, error.message, true);
    }
  });

  // ---------- account view ----------
  async function showAccount(user){
    formsView.style.display = 'none';
    tabsWrap.style.display = 'none';
    applyBanner.style.display = 'none';
    accountView.style.display = 'block';

    const { data: profileData } = await sb.from('profiles').select('*').eq('id', user.id).single();

    document.getElementById('accEmail').textContent = user.email;
    document.getElementById('accName').textContent = profileData?.full_name || '—';
    document.getElementById('accCountry').textContent = profileData?.country || '—';
    document.getElementById('accPhone').textContent = profileData?.phone || '—';
    document.getElementById('accCategory').textContent = profileData?.category || '—';
    document.getElementById('accExperience').textContent = profileData?.years_experience || '—';
    document.getElementById('accAvailability').textContent = profileData?.availability || '—';
    const linkedinEl = document.getElementById('accLinkedin');
    if (profileData?.linkedin_url) {
      linkedinEl.innerHTML = `<a href="${profileData.linkedin_url}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">View profile →</a>`;
    } else {
      linkedinEl.textContent = '—';
    }
    const messageWrap = document.getElementById('accMessageWrap');
    if (profileData?.cover_message) {
      document.getElementById('accMessage').textContent = profileData.cover_message;
      messageWrap.style.display = 'block';
    } else {
      messageWrap.style.display = 'none';
    }
    const resumeLine = document.getElementById('accResumeLine');
    if (profileData?.resume_url) {
      resumeLine.innerHTML = `<span>RESUME</span><a href="${profileData.resume_url}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">View file →</a>`;
    } else {
      resumeLine.innerHTML = `<span>RESUME</span><span>Not uploaded</span>`;
    }

    await maybeShowApplyConfirm(user.id);
  }

  function showForms(){
    formsView.style.display = 'block';
    tabsWrap.style.display = 'flex';
    accountView.style.display = 'none';

    const pending = getPendingApplication();
    if (pending) {
      applyBannerTitle.textContent = pending.title;
      applyBanner.style.display = 'block';
    } else {
      applyBanner.style.display = 'none';
    }
  }

  // ---------- check existing session on load ----------
  sb.auth.getSession().then(({ data }) => {
    if (data.session) showAccount(data.session.user);
    else showForms();
  });

  // ---------- log in ----------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(loginForm, true, 'Log in');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(loginForm, false, 'Log in');

    if (error) {
      setStatus(loginForm, error.message, true);
      return;
    }
    setStatus(loginForm, 'Logged in ✓', false);
    showAccount(data.user);
    loginForm.reset();
  });

  // ---------- create profile (sign up) ----------
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(signupForm, true, 'Create profile');

    const fullName = document.getElementById('suName').value.trim();
    const country = document.getElementById('suCountry').value.trim();
    const email = document.getElementById('suEmail').value.trim();
    const phone = document.getElementById('suPhone').value.trim();
    const category = document.getElementById('suCategory').value;
    const yearsExperience = document.getElementById('suExperience').value;
    const availability = document.getElementById('suAvailability').value;
    const linkedinUrl = document.getElementById('suLinkedin').value.trim();
    const coverMessage = document.getElementById('suMessage').value.trim();
    const password = document.getElementById('suPassword').value;
    const resumeFile = document.getElementById('suResume').files[0];

    const { data: signUpData, error: signUpError } = await sb.auth.signUp({ email, password });

    if (signUpError) {
      setLoading(signupForm, false, 'Create profile');
      setStatus(signupForm, signUpError.message, true);
      return;
    }

    const user = signUpData.user;
    let resumeUrl = null;

    if (user && resumeFile) {
      const path = `${user.id}/${Date.now()}-${resumeFile.name}`;
      const { error: uploadError } = await sb.storage.from('resumes').upload(path, resumeFile);
      if (!uploadError) {
        const { data: publicUrlData } = sb.storage.from('resumes').getPublicUrl(path);
        resumeUrl = publicUrlData.publicUrl;
      }
    }

    if (user) {
      await sb.from('profiles').upsert({
        id: user.id,
        full_name: fullName,
        country: country,
        phone: phone,
        category: category,
        years_experience: yearsExperience,
        availability: availability,
        linkedin_url: linkedinUrl || null,
        cover_message: coverMessage || null,
        resume_url: resumeUrl
      });
    }

    setLoading(signupForm, false, 'Create profile');

    if (signUpData.session) {
      setStatus(signupForm, 'Profile created ✓', false);
      showAccount(user);
    } else {
      setStatus(signupForm, 'Profile created — check your email to confirm your address, then log in.', false);
    }
    signupForm.reset();
  });

  // ---------- log out ----------
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await sb.auth.signOut();
      showForms();
    });
  }
});

function showSetupWarning(){
  const el = document.getElementById('formsView');
  if (!el) return;
  const warning = document.createElement('div');
  warning.style.cssText = 'border:1px solid #E3B4AE; background:#FBEEEC; color:#8A2E24; padding:16px 18px; border-radius:2px; margin-bottom:22px; font-size:14px;';
  warning.textContent = 'Account system not connected yet — add your Supabase project URL and API key to supabase-config.js to activate real sign-up and login.';
  el.prepend(warning);
}
