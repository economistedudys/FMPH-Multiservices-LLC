// Real account system for My Profile, backed by Supabase (Auth + Database + Storage).
// Also tracks which job a candidate applies to (via ?apply=ID&title=...&cat=CODE on this page's URL).
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

  function validatePassword(pw){
    const rules = {
      len: pw.length >= 8,
      max: pw.length <= 30,
      case: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
      num: /[0-9!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/.test(pw)
    };
    ['len', 'max', 'case', 'num'].forEach(key => {
      const el = document.getElementById(`rule-${key}`);
      if (el) el.classList.toggle('ok', rules[key]);
    });
    return Object.values(rules).every(Boolean);
  }
  const pwField = document.getElementById('suPassword');
  if (pwField) pwField.addEventListener('input', () => validatePassword(pwField.value));

  // ---------- ensure a profile row always exists for the logged-in user ----------
  // This self-heals accounts created while email confirmation briefly blocked the
  // original signup-time profile insert (the cause of "applications_candidate_id_fkey" errors).
  async function ensureProfileRow(userId, extra = {}){
    const { error } = await sb.from('profiles').upsert({ id: userId, ...extra }, { onConflict: 'id' });
    return error;
  }

  // ---------- applications list + jobs applied count ----------
  async function loadApplications(userId){
    const listEl = document.getElementById('applicationsList');
    const countEl = document.getElementById('jobsAppliedCount');
    const { data, error } = await sb
      .from('applications')
      .select('job_id, job_title, job_category, status, applied_at')
      .eq('candidate_id', userId)
      .order('applied_at', { ascending: false });

    if (error || !data || data.length === 0) {
      listEl.innerHTML = '<p style="color:var(--ink-soft); font-size:14px;">No applications yet.</p>';
      if (countEl) countEl.textContent = '0';
      return [];
    }

    if (countEl) countEl.textContent = String(data.length);

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
      <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--line); border-radius:2px; padding:12px 14px; gap:12px; background:var(--paper);">
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

    // Self-heal: make sure a profiles row exists before inserting the application,
    // otherwise the foreign key (applications.candidate_id -> profiles.id) fails.
    await ensureProfileRow(user.id);

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

  // ---------- populate editable sections from stored profile ----------
  function fillProfileForm(profileData, resumeUrl){
    document.getElementById('piName').value = profileData?.full_name || '';
    document.getElementById('piCountry').value = profileData?.country || '';
    document.getElementById('piPhone').value = profileData?.phone || '';
    if (profileData?.category) document.getElementById('piCategory').value = profileData.category;
    if (profileData?.years_experience) document.getElementById('piExperience').value = profileData.years_experience;
    if (profileData?.availability) document.getElementById('piAvailability').value = profileData.availability;
    document.getElementById('piLinkedin').value = profileData?.linkedin_url || '';
    document.getElementById('piMessage').value = profileData?.cover_message || '';
    document.getElementById('piPrevEmployment').value = profileData?.previous_employment || '';
    document.getElementById('piEducation').value = profileData?.formal_education || '';

    const docStatus = document.getElementById('docResumeStatus');
    if (resumeUrl) {
      docStatus.innerHTML = `<a href="${resumeUrl}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">View current file →</a>`;
    } else {
      docStatus.textContent = 'No resume uploaded yet.';
    }
  }

  // ---------- account view ----------
  async function showAccount(user){
    formsView.style.display = 'none';
    tabsWrap.style.display = 'none';
    applyBanner.style.display = 'none';
    accountView.style.display = 'block';

    // Self-heal on every login/session-restore: guarantees a profiles row exists
    // even for accounts created before this fix, or interrupted mid-signup.
    await ensureProfileRow(user.id);

    const { data: profileData } = await sb.from('profiles').select('*').eq('id', user.id).single();
    fillProfileForm(profileData, profileData?.resume_url);
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
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Please wait…';
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Sign In';

    if (error) {
      setStatus(loginForm, error.message, true);
      return;
    }
    showAccount(data.user);
    loginForm.reset();
  });

  // ---------- create profile (sign up) ----------
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('suEmail').value.trim();
    const emailConfirm = document.getElementById('suEmailConfirm').value.trim();
    const password = document.getElementById('suPassword').value;
    const passwordConfirm = document.getElementById('suPasswordConfirm').value;
    const fullName = document.getElementById('suName').value.trim();
    const country = document.getElementById('suCountry').value.trim();
    const phone = document.getElementById('suPhone').value.trim();
    const category = document.getElementById('suCategory').value;
    const yearsExperience = document.getElementById('suExperience').value;
    const availability = document.getElementById('suAvailability').value;
    const linkedinUrl = document.getElementById('suLinkedin').value.trim();
    const coverMessage = document.getElementById('suMessage').value.trim();
    const resumeFile = document.getElementById('suResume').files[0];
    const termsAccepted = document.getElementById('suTerms').checked;

    if (email !== emailConfirm) {
      setStatus(signupForm, 'Email addresses do not match.', true);
      return;
    }
    if (!validatePassword(password)) {
      setStatus(signupForm, 'Password does not meet the requirements above.', true);
      return;
    }
    if (password !== passwordConfirm) {
      setStatus(signupForm, 'Passwords do not match.', true);
      return;
    }
    if (!termsAccepted) {
      setStatus(signupForm, 'Please accept the data privacy statement to continue.', true);
      return;
    }

    const submitBtn = signupForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait…';

    const { data: signUpData, error: signUpError } = await sb.auth.signUp({ email, password });

    if (signUpError) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
      setStatus(signupForm, signUpError.message, true);
      return;
    }

    const user = signUpData.user;
    let resumeUrl = null;

    // Only upload/write profile data now if we actually have a session
    // (i.e. email confirmation is off). Otherwise this is done via
    // ensureProfileRow() the first time the user successfully logs in.
    if (user && signUpData.session) {
      if (resumeFile) {
        const path = `${user.id}/${Date.now()}-${resumeFile.name}`;
        const { error: uploadError } = await sb.storage.from('resumes').upload(path, resumeFile);
        if (!uploadError) {
          const { data: publicUrlData } = sb.storage.from('resumes').getPublicUrl(path);
          resumeUrl = publicUrlData.publicUrl;
        }
      }

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

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';

    if (signUpData.session) {
      showAccount(user);
    } else {
      setStatus(signupForm, 'Account created — check your email to confirm your address, then sign in. You can fill in your profile details after logging in.', false);
    }
    signupForm.reset();
  });

  // ---------- save: Profile Information ----------
  document.getElementById('saveProfileInfoBtn').addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const btn = document.getElementById('saveProfileInfoBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { error } = await sb.from('profiles').upsert({
      id: user.id,
      full_name: document.getElementById('piName').value.trim(),
      country: document.getElementById('piCountry').value.trim(),
      phone: document.getElementById('piPhone').value.trim(),
      category: document.getElementById('piCategory').value,
      years_experience: document.getElementById('piExperience').value,
      availability: document.getElementById('piAvailability').value,
      linkedin_url: document.getElementById('piLinkedin').value.trim() || null,
      cover_message: document.getElementById('piMessage').value.trim() || null
    }, { onConflict: 'id' });

    btn.disabled = false;
    btn.textContent = error ? 'Save' : 'Saved ✓';
    if (!error) setTimeout(() => { btn.textContent = 'Save'; }, 2000);
    else alert("Couldn't save: " + error.message);
  });

  // ---------- save: My Documents (resume upload) ----------
  document.getElementById('saveDocsBtn').addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const file = document.getElementById('docResumeUpload').files[0];
    if (!file) return;

    const btn = document.getElementById('saveDocsBtn');
    btn.disabled = true; btn.textContent = 'Uploading…';

    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await sb.storage.from('resumes').upload(path, file);

    if (!uploadError) {
      const { data: publicUrlData } = sb.storage.from('resumes').getPublicUrl(path);
      await sb.from('profiles').upsert({ id: user.id, resume_url: publicUrlData.publicUrl }, { onConflict: 'id' });
      document.getElementById('docResumeStatus').innerHTML = `<a href="${publicUrlData.publicUrl}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">View current file →</a>`;
      btn.textContent = 'Uploaded ✓';
    } else {
      btn.textContent = 'Upload';
      alert("Couldn't upload file: " + uploadError.message);
    }
    btn.disabled = false;
    setTimeout(() => { btn.textContent = 'Upload'; }, 2000);
  });

  // ---------- save: Previous Employment ----------
  document.getElementById('saveEmploymentBtn').addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const btn = document.getElementById('saveEmploymentBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { error } = await sb.from('profiles').upsert({
      id: user.id,
      previous_employment: document.getElementById('piPrevEmployment').value.trim() || null
    }, { onConflict: 'id' });

    btn.disabled = false;
    btn.textContent = error ? 'Save' : 'Saved ✓';
    if (!error) setTimeout(() => { btn.textContent = 'Save'; }, 2000);
    else alert("Couldn't save: " + error.message);
  });

  // ---------- save: Formal Education ----------
  document.getElementById('saveEducationBtn').addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const btn = document.getElementById('saveEducationBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { error } = await sb.from('profiles').upsert({
      id: user.id,
      formal_education: document.getElementById('piEducation').value.trim() || null
    }, { onConflict: 'id' });

    btn.disabled = false;
    btn.textContent = error ? 'Save' : 'Saved ✓';
    if (!error) setTimeout(() => { btn.textContent = 'Save'; }, 2000);
    else alert("Couldn't save: " + error.message);
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
