// Admin dashboard: only works for the account whose UUID has been granted
// admin SELECT policies on `applications` and `profiles` in Supabase (see setup docs).
// Requires supabase-config.js loaded before this file.

document.addEventListener('DOMContentLoaded', () => {
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.startsWith('PASTE_')) {
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginBox = document.getElementById('adminLogin');
  const panel = document.getElementById('adminPanel');
  const loginForm = document.getElementById('adminLoginForm');
  const tableWrap = document.getElementById('adminTableWrap');
  const emptyEl = document.getElementById('adminEmpty');
  const statEl = document.getElementById('adminStat');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  function setStatus(message, isError){
    let box = loginForm.querySelector('.form-status');
    if (!box) {
      box = document.createElement('p');
      box.className = 'form-status';
      loginForm.appendChild(box);
    }
    box.textContent = message;
    box.style.color = isError ? '#C4433A' : 'var(--ledger)';
    box.style.fontSize = '13.5px';
    box.style.marginTop = '4px';
  }

  const STATUS_OPTIONS = ['Submitted', 'Under Review', 'Interview', 'Offer', 'Hired', 'Not Selected'];

  async function loadApplications(){
    const { data, error } = await sb
      .from('applications')
      .select('id, job_id, job_title, job_category, status, applied_at, profiles ( full_name, country, phone, category, years_experience, availability, linkedin_url, cover_message, resume_url )')
      .order('applied_at', { ascending: false });

    if (error) {
      emptyEl.textContent = "Couldn't load applications — " + error.message;
      emptyEl.style.display = 'block';
      tableWrap.innerHTML = '';
      statEl.textContent = '';
      return;
    }

    if (!data || data.length === 0) {
      emptyEl.style.display = 'block';
      tableWrap.innerHTML = '';
      statEl.textContent = '0 applications';
      return;
    }

    emptyEl.style.display = 'none';
    statEl.textContent = `${data.length} application${data.length === 1 ? '' : 's'}`;

    const rows = data.map(a => {
      const p = a.profiles || {};
      const resume = p.resume_url
        ? `<a href="${p.resume_url}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">View CV →</a>`
        : '—';
      const linkedin = p.linkedin_url
        ? `<a href="${p.linkedin_url}" target="_blank" rel="noopener" style="color:var(--ledger); font-weight:600;">Profile →</a>`
        : '—';
      const statusSelect = `
        <select class="status-select" data-app-id="${a.id}" style="font-family:'IBM Plex Mono',monospace; font-size:11.5px; padding:5px 8px; border:1px solid var(--line); border-radius:2px; background:var(--paper-raised);">
          ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      `;
      return `
        <tr>
          <td><strong>${p.full_name || '—'}</strong><br><span style="color:var(--ink-soft); font-size:12px;">${p.country || ''}</span></td>
          <td>${p.phone || '—'}</td>
          <td><span class="admin-pill">${a.job_category || ''}</span><br>${a.job_title}<br><a href="careers.html?job=${a.job_id}" target="_blank" style="font-size:11px; color:var(--ink-soft);">🔗 posting</a></td>
          <td>${p.category || '—'}</td>
          <td>${p.years_experience || '—'}<br><span style="color:var(--ink-soft); font-size:12px;">${p.availability || ''}</span></td>
          <td>${linkedin}</td>
          <td>${resume}</td>
          <td>${statusSelect}</td>
          <td style="white-space:nowrap;">${new Date(a.applied_at).toLocaleDateString()}</td>
        </tr>
        ${p.cover_message ? `<tr><td colspan="9" style="background:var(--paper-raised); font-size:13px; color:var(--ink-soft); padding:10px 12px;"><strong>Note:</strong> ${p.cover_message}</td></tr>` : ''}
      `;
    }).join('');

    tableWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Phone</th>
            <th>Applied for</th>
            <th>Category</th>
            <th>Experience</th>
            <th>LinkedIn</th>
            <th>Resume</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const appId = sel.dataset.appId;
        sel.disabled = true;
        const { error } = await sb.from('applications').update({ status: sel.value }).eq('id', appId);
        sel.disabled = false;
        if (error) alert("Couldn't update status: " + error.message);
      });
    });
  }

  function showPanel(){
    loginBox.style.display = 'none';
    panel.style.display = 'block';
    loadApplications();
  }

  function showLogin(){
    loginBox.style.display = 'block';
    panel.style.display = 'none';
  }

  sb.auth.getSession().then(({ data }) => {
    if (data.session) showPanel(); else showLogin();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Please wait…';

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'Log in';

    if (error) {
      setStatus(error.message, true);
      return;
    }
    showPanel();
  });

  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
    showLogin();
  });
});
