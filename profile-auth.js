// Real account system for My Profile, backed by Supabase (Auth + Database + Storage).
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

  async function showAccount(user){
    formsView.style.display = 'none';
    tabsWrap.style.display = 'none';
    accountView.style.display = 'block';

    const { data: profileData } = await sb.from('profiles').select('*').eq('id', user.id).single();

    document.getElementById('accEmail').textContent = user.email;
    document.getElementById('accName').textContent = profileData?.full_name || '—';
    document.getElementById('accCountry').textContent = profileData?.country || '—';
    document.getElementById('accPhone').textContent = profileData?.phone || '—';
    document.getElementById('accCategory').textContent = profileData?.category || '—';
    const resumeLine = document.getElementById('accResumeLine');
    if (profileData?.resume_url) {
      resumeLine.innerHTML = `<span>RESUME</span><a href="${profileData.resume_url}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">View file →</a>`;
    } else {
      resumeLine.innerHTML = `<span>RESUME</span><span>Not uploaded</span>`;
    }
  }

  function showForms(){
    formsView.style.display = 'block';
    tabsWrap.style.display = 'flex';
    accountView.style.display = 'none';
  }

  // ---------- check existing session on load ----------
  sb.auth.getSession().then(({ data }) => {
    if (data.session) showAccount(data.session.user);
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
        resume_url: resumeUrl
      });
    }

    setLoading(signupForm, false, 'Create profile');

    if (signUpData.session) {
      // Email confirmation is OFF in the Supabase project → logged in immediately
      setStatus(signupForm, 'Profile created ✓', false);
      showAccount(user);
    } else {
      // Email confirmation is ON → user must click the link in their inbox first
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
