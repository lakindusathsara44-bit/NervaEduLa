const { OL_SUBJECTS: OL_SUBJECT_LIST, AL_SUBJECTS: AL_SUBJECT_LIST, SCHOLARSHIP_SUBJECTS: SCHOLARSHIP_SUBJECT_LIST = [] } = window.NERVAEDU_SUBJECTS || { OL_SUBJECTS: [], AL_SUBJECTS: [] };
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let currentUser = null, currentPage = 'overview', toastTimer;
let selectedTeacherSubject = 'O/L — Mathematics', selectedResourceSubject = '', selectedQuizSubject = '';
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  let data; try { data = await response.json(); } catch { throw new Error('The server sent an unreadable response.'); }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
async function uploadToImageKit(file, { subject, title, priceLkr }) {
  const type = file.type.startsWith('video/') ? 'video' : 'pdf';
  const auth = await api('/api/imagekit-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, type, priceLkr }) });
  const payload = new FormData();
  payload.set('file', file); payload.set('fileName', file.name); payload.set('publicKey', auth.publicKey);
  payload.set('token', auth.token); payload.set('expire', String(auth.expire)); payload.set('signature', auth.signature);
  payload.set('folder', auth.folder); payload.set('checks', auth.checks); payload.set('useUniqueFileName', 'true'); payload.set('isPrivateFile', type === 'video' ? 'true' : 'false');
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: payload });
  let uploaded; try { uploaded = await response.json(); } catch { throw new Error('ImageKit returned an unreadable upload response.'); }
  if (!response.ok) throw new Error(uploaded.message || uploaded.help || 'ImageKit could not upload this file.');
  return api('/api/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    source: 'imagekit', subject, title, type, name: file.name, size: uploaded.size,
    fileId: uploaded.fileId, filePath: uploaded.filePath, url: uploaded.url, priceLkr
  }) });
}
function message(target, text, success = false) { const node = $(target); node.textContent = text; node.classList.toggle('success', success); }
function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2800); }
function initials(name) { return (name || '?').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }
function subjectIcon(subject) {
  const name = subject.replace(/^(?:O\/L|A\/L|Other) — /, '').toLowerCase();
  if (name.includes('math')) return '📐'; if (name.includes('science') || /physics|chemistry|biology/.test(name)) return '🧪';
  if (name.includes('english') || name.includes('literature')) return '📖'; if (name.includes('history')) return '🏛️';
  if (name.includes('geography')) return '🌏'; if (name.includes('technology') || name.includes('ict')) return '💻';
  if (name.includes('music') || name.includes('art') || name.includes('dance')) return '🎨';
  if (name.includes('sinhala') || name.includes('tamil')) return '🪷'; return '📚';
}
function subjectOptions(subjects, selected = '') {
  return ['Scholarship', 'O/L', 'A/L', 'Other'].map(level => {
    const subset = subjects.filter(s => level === 'Other'
      ? s.startsWith('Other — ') || (!s.startsWith('Scholarship — ') && !s.startsWith('O/L — ') && !s.startsWith('A/L — '))
      : s.startsWith(level + ' — '));
    if (!subset.length) return '';
    return `<optgroup label="${level} subjects">${subset.map(s => `<option value="${safe(s)}" ${s === selected ? 'selected' : ''}>${safe(s)}</option>`).join('')}</optgroup>`;
  }).join('');
}
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatPhone(phone) { return safe(phone || 'Not provided'); }
function formatLkr(value) { return `LKR ${new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(Number(value) || 0)}`; }
function whatsappPhone(value) { let digits = String(value || '').replace(/\D/g, ''); return digits.startsWith('0') ? '94' + digits.slice(1) : digits; }
function chooseAuth(isRegister) {
  $('#loginForm').classList.toggle('hidden', isRegister); $('#registerForm').classList.toggle('hidden', !isRegister);
  $('#authSwitch').innerHTML = isRegister ? 'Already have an account? <button type="button" id="switchAuth">Sign in</button>' : 'New to NervaEdu? <button type="button" id="switchAuth">Create an account</button>';
  $('#authTitle').textContent = isRegister ? 'Create your account' : 'Welcome back';
  $('#authSubtitle').textContent = isRegister ? 'Tell us a little about yourself to get started.' : 'Sign in to continue learning.';
  $('#authMessage').textContent = ''; $('#authMessage').classList.remove('success');
  $('#switchAuth').onclick = () => chooseAuth(!isRegister);
}
function populateSubjects() {
  const group = (name, items) => `<fieldset class="subject-group"><legend>${name} subjects</legend><div class="subject-checks">${items.map(s => `<label><input type="checkbox" name="subjectChoice" value="${safe(s)}"> ${safe(s.replace(/^(?:O\/L|A\/L) — /, ''))}</label>`).join('')}</div></fieldset>`;
  $('#subjectChecks').innerHTML = group('Scholarship', SCHOLARSHIP_SUBJECT_LIST) + group('O/L', OL_SUBJECT_LIST) + group('A/L', AL_SUBJECT_LIST);
  $('#subjectSearch').oninput = event => {
    const value = event.target.value.trim().toLowerCase();
    $$('#subjectChecks label').forEach(label => { label.hidden = !label.textContent.toLowerCase().includes(value); });
    $$('.subject-group').forEach(field => { field.hidden = !$$('label:not([hidden])', field).length; });
  };
}
function setRegRole(role) {
  const form = $('#registerForm'); form.elements.role.value = role;
  $$('.role-option', form).forEach(b => b.classList.toggle('selected', b.dataset.role === role));
  $$('.student-field', form).forEach(n => n.classList.toggle('hidden', role !== 'student'));
  $$('.teacher-field', form).forEach(n => n.classList.toggle('hidden', role !== 'teacher'));
  const studentPhone = form.elements.phone, teacherPhone = form.elements.phoneTeacher;
  studentPhone.required = role === 'student'; teacherPhone.required = role === 'teacher';
  form.elements.age.required = role === 'student'; form.elements.address.required = role === 'student'; form.elements.school.required = role === 'student';
  form.elements.whatsapp.required = role === 'teacher'; form.elements.qualification.required = role === 'teacher';
  form.elements.thumbnail.required = false;
}
async function showApp(user) {
  currentUser = user; $('#authScreen').classList.add('hidden'); $('#appScreen').classList.remove('hidden');
  $('#schoolName').textContent = user.role === 'student' ? user.school : user.role === 'admin' ? 'Account manager' : 'Teacher workspace';
  $('#schoolCaption').textContent = user.role === 'student' ? `Age ${user.age} · Student` : user.role === 'admin' ? 'Teacher verification & plans' : (user.subjects || []).join(' · ');
  const avatar = user.thumbnail ? `<img class="avatar" src="${safe(user.thumbnail)}" alt="">` : `<span class="avatar">${safe(initials(user.name))}</span>`;
  $('#profileButton').innerHTML = `${avatar}<span><b>${safe(user.name)}</b><small>${user.role === 'student' ? 'Student' : user.role === 'admin' ? 'Account manager' : 'Teacher profile'}</small></span>`;
  $('#mobileProfile').textContent = initials(user.name);
  history.replaceState({ lmsPage: 'overview' }, '', location.pathname);
  buildNavigation(); await renderPage('overview');
}
function buildNavigation() {
  const links = currentUser.role === 'admin' ? [
    ['overview', '⌂', 'Overview'], ['admin-teachers', '✓', 'Verify teachers'], ['admin-plans', 'L', 'Plan requests']
  ] : currentUser.role === 'student' ? [
    ['overview', '⌂', 'Overview'], ['teachers', '♙', 'Find a teacher'], ['resources', '▤', 'Lessons & papers'], ['quizzes', '✓', 'Quizzes'], ['profile', '◉', 'My account']
  ] : [
    ['overview', '⌂', 'Overview'], ['resources', '▤', 'My resources'], ['access', 'R', 'Access requests'], ['plans', 'L', 'Capacity plans'], ['quizzes', '✓', 'My quizzes'], ['profile', '◉', 'Teacher profile']
  ];
  const markup = links.map(([id, icon, label]) => `<button class="nav-link ${currentPage === id ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
  $('#navigation').innerHTML = markup;
  $('#mobileNavigation').innerHTML = links.map(([id, icon, label]) => `<button class="mobile-nav-item ${currentPage === id ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
  $$('.nav-link, .mobile-nav-item').forEach(button => button.onclick = () => navigatePage(button.dataset.page));
}
function openPage(name) { return navigatePage(name); }
function navigatePage(name) {
  if (name === currentPage) return renderPage(name);
  history.pushState({ lmsPage: name }, '', location.pathname);
  return renderPage(name);
}
window.addEventListener('popstate', event => { if (currentUser) renderPage(event.state?.lmsPage || 'overview'); });
async function renderPage(name) {
  currentPage = name; buildNavigation(); $('#pageCrumb').textContent = ({ overview: 'Overview', teachers: 'Find a teacher', resources: currentUser.role === 'teacher' ? 'My resources' : 'Lessons & papers', access: 'Access requests', plans: 'Capacity plans', 'admin-teachers': 'Verify teachers', 'admin-plans': 'Plan requests', quizzes: 'Quizzes', profile: currentUser.role === 'teacher' ? 'Teacher profile' : currentUser.role === 'admin' ? 'Account manager' : 'My account' })[name] || 'Overview';
  const page = $('#page'); page.innerHTML = '<div class="empty-state">Loading your learning space…</div>';
  try {
    if (currentUser.role === 'teacher' && currentUser.verificationStatus !== 'verified' && name !== 'plans' && name !== 'profile') page.innerHTML = `<section class="tab-header"><div><h1>Teacher profile review</h1><p>${currentUser.verificationStatus === 'rejected' ? 'Your teacher application was not approved. Contact the NervaEdu account manager.' : 'Your account is waiting for the NervaEdu admin to verify your subjects and qualification.'}</p></div><button class="button secondary small" data-goto="plans">View status</button></section><section class="panel empty-state"><span>🔎</span>Teacher resources and publishing tools will be available after verification.</section>`;
    else if (name === 'overview') page.innerHTML = currentUser.role === 'student' ? await studentOverview() : currentUser.role === 'admin' ? await adminOverview() : await teacherOverview();
    else if (name === 'admin-teachers' && currentUser.role === 'admin') page.innerHTML = await adminTeachersPage();
    else if (name === 'admin-plans' && currentUser.role === 'admin') page.innerHTML = await adminPlanRequestsPage();
    else if (name === 'teachers' && currentUser.role === 'student') page.innerHTML = await teachersPage();
    else if (name === 'resources') page.innerHTML = currentUser.role === 'teacher' ? await teacherResourcesPage() : await studentResourcesPage();
    else if (name === 'access' && currentUser.role === 'teacher') page.innerHTML = await teacherAccessRequestsPage();
    else if (name === 'plans' && currentUser.role === 'teacher') page.innerHTML = await teacherPlansPage();
    else if (name === 'quizzes') page.innerHTML = currentUser.role === 'teacher' ? await teacherQuizzesPage() : await studentQuizzesPage();
    else page.innerHTML = currentUser.role === 'admin' ? adminProfilePage() : await profilePage();
    bindPageActions();
  } catch (error) { page.innerHTML = `<section class="panel empty-state"><span>🌿</span>${safe(error.message)}<br><button class="button secondary" id="retryButton" style="margin-top:12px">Try again</button></section>`; $('#retryButton').onclick = () => renderPage(name); }
}
function welcome(name, roleLabel) { const hour = new Date().getHours(); const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; const message = roleLabel === 'admin' ? 'Review teacher applications and manage monthly plans.' : roleLabel === 'student' ? 'A little progress each day adds up to big results.' : 'Your next lesson is only a few steps away.'; return `<section class="welcome"><div><h1>${greeting}, ${safe(name.split(' ')[0])} <span>${roleLabel === 'student' ? '🌿' : roleLabel === 'admin' ? '🔑' : '🍃'}</span></h1><p>${message}</p></div><span class="date-chip">${new Intl.DateTimeFormat('en-LK', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}</span></section>`; }
async function studentOverview() {
  const [r, q, choices] = await Promise.all([api('/api/resources'), api('/api/quizzes'), api('/api/my-choices')]);
  const lessons = r.resources.length, quizzes = q.quizzes.length;
  const olFeatured = ['O/L — Sinhala Language & Literature', 'O/L — English Language', 'O/L — Mathematics', 'O/L — Science', 'O/L — History'];
  const alFeatured = ['A/L — Combined Mathematics', 'A/L — Physics', 'A/L — Chemistry', 'A/L — Biology', 'A/L — Economics'];
  const rows = currentUser.subjects?.length ? currentUser.subjects.slice(0, 6) : (Number(currentUser.age) >= 16 ? alFeatured : olFeatured);
  const subjects = rows.map((s, i) => `<div class="course-row"><div class="course-emoji">${subjectIcon(s)}</div><div><h3>${safe(s)}</h3><p>${Object.keys(choices.choices).includes(s) ? 'Your teacher is selected' : 'Find a teacher for this subject'}</p></div><button class="chip" data-goto-teachers="${safe(s)}">${Object.keys(choices.choices).includes(s) ? 'Change' : 'Explore'}</button></div>`).join('');
  return `${welcome(currentUser.name, currentUser.role)}<section class="stats"><div class="stat"><div class="stat-label">My subjects<span class="stat-icon">▤</span></div><div class="stat-value">${rows.length}</div><div class="stat-note">Choose teachers by subject</div></div><div class="stat"><div class="stat-label">Learning resources<span class="stat-icon">▶</span></div><div class="stat-value">${lessons}</div><div class="stat-note">Videos and PDF papers</div></div><div class="stat"><div class="stat-label">Practice quizzes<span class="stat-icon">✓</span></div><div class="stat-value">${quizzes}</div><div class="stat-note">Six questions each</div></div><div class="stat"><div class="stat-label">School<span class="stat-icon">🏫</span></div><div class="stat-value" style="font-size:16px">${safe(currentUser.school)}</div><div class="stat-note">Your learning community</div></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Your subjects</h2><p>Find the teacher who helps you learn</p></div><button class="button secondary small" data-goto="teachers">Find a teacher</button></div>${subjects}</section><section class="panel"><div class="panel-head"><div><h2>Ready to learn?</h2><p>Pick up where you want to start</p></div><span>🌞</span></div><div class="timeline"><div class="timeline-row"><div class="timeline-time">01</div><div><h3>Explore teacher profiles</h3><p>Choose a teacher for each subject you study.</p></div></div><div class="timeline-row"><div class="timeline-time">02</div><div><h3>Watch a lesson or read a paper</h3><p>Open videos and PDFs shared by your teachers.</p></div></div><div class="timeline-row"><div class="timeline-time">03</div><div><h3>Try a six-question quiz</h3><p>Practice and see your result straight away.</p></div></div><div class="callout"><div class="sun">☀️</div><div><b>Your own pace, your own path</b><p>Resources stay here for your next study session.</p></div></div></div></section></div>`;
}
async function teacherOverview() {
  const [r, q] = await Promise.all([api('/api/resources'), api('/api/quizzes')]); const videoCount = r.resources.filter(x => x.type === 'video').length;
  return `${welcome(currentUser.name, currentUser.role)}<section class="stats"><div class="stat"><div class="stat-label">Subjects you teach<span class="stat-icon">📚</span></div><div class="stat-value">${currentUser.subjects.length}</div><div class="stat-note">${safe(currentUser.subjects.join(', '))}</div></div><div class="stat"><div class="stat-label">Uploaded videos<span class="stat-icon">▶</span></div><div class="stat-value">${videoCount}<small style="font:500 11px 'DM Sans';color:var(--muted)"> / ${currentUser.subjects.length * 5}</small></div><div class="stat-note">Up to 5 per subject</div></div><div class="stat"><div class="stat-label">PDF papers<span class="stat-icon">▤</span></div><div class="stat-value">${r.resources.filter(x => x.type === 'pdf').length}</div><div class="stat-note">Notes and past papers</div></div><div class="stat"><div class="stat-label">Quizzes created<span class="stat-icon">✓</span></div><div class="stat-value">${q.quizzes.filter(x => x.teacherId === currentUser.id).length}</div><div class="stat-note">Six MCQs per quiz</div></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Teaching subjects</h2><p>Students can find you under these subjects</p></div><button class="button secondary small" data-goto="profile">View profile</button></div>${currentUser.subjects.map(s => `<div class="course-row"><div class="course-emoji">${subjectIcon(s)}</div><div><h3>${safe(s)}</h3><p>${r.resources.filter(x => x.subject === s).length} resources shared</p></div><button class="chip" data-upload-subject="${safe(s)}">Add resource</button></div>`).join('')}</section><section class="panel"><div class="panel-head"><div><h2>Quick start</h2><p>Prepare something for your class</p></div><span>🌱</span></div><div class="timeline"><div class="timeline-row"><div class="timeline-time">01</div><div><h3>Share a lesson video</h3><p>Upload up to five videos for each subject.</p></div></div><div class="timeline-row"><div class="timeline-time">02</div><div><h3>Add a paper or notes</h3><p>Upload PDF files for students to read.</p></div></div><div class="timeline-row"><div class="timeline-time">03</div><div><h3>Build a six-question quiz</h3><p>Four answer choices and one correct answer.</p></div></div></div></section></div>`;
}
async function adminOverview() {
  const stats = await api('/api/admin/overview');
  return `${welcome(currentUser.name, 'admin')}<section class="stats"><div class="stat"><div class="stat-label">Teachers</div><div class="stat-value">${stats.teacherCount}</div><div class="stat-note">${stats.pendingTeachers} waiting for review</div></div><div class="stat"><div class="stat-label">Students</div><div class="stat-value">${stats.studentCount}</div><div class="stat-note">Registered NervaEdu learners</div></div><div class="stat"><div class="stat-label">Verification queue</div><div class="stat-value">${stats.pendingTeachers}</div><div class="stat-note">Teacher profiles to check</div></div><div class="stat"><div class="stat-label">Plan receipts</div><div class="stat-value">${stats.pendingPlans}</div><div class="stat-note">Awaiting WhatsApp receipt review</div></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Teacher verification</h2><p>Review qualifications and confirm teaching subjects.</p></div><button class="button secondary small" data-goto="admin-teachers">Review teachers</button></div></section><section class="panel"><div class="panel-head"><div><h2>Monthly plan requests</h2><p>Check payment receipts in WhatsApp before activating a plan.</p></div><button class="button secondary small" data-goto="admin-plans">Review plans</button></div></section></div>`;
}
async function adminTeachersPage() {
  const { teachers } = await api('/api/admin/teachers');
  const rows = teachers.map(teacher => {
    const qualification = teacher.qualification === 'Other' ? teacher.otherQualification : teacher.qualification;
    const status = teacher.verificationStatus;
    const buttons = status === 'pending' ? `<button class="button primary small" data-verify-teacher="${safe(teacher.id)}" data-approved="true">Approve teacher</button><button class="button secondary small" data-verify-teacher="${safe(teacher.id)}" data-approved="false">Reject</button>` : status === 'rejected' ? `<button class="button primary small" data-verify-teacher="${safe(teacher.id)}" data-approved="true">Approve teacher</button>` : '<span class="admin-status verified">Verified</span>';
    return `<article class="admin-review-row"><div class="teacher-photo">${teacher.thumbnail ? `<img class="teacher-photo" src="${safe(teacher.thumbnail)}" alt="">` : safe(initials(teacher.name))}</div><div class="admin-review-details"><b>${safe(teacher.name)}</b><small>${safe(teacher.subjects.join(', '))}</small><small>${safe(qualification || 'Qualification not provided')} · Call ${formatPhone(teacher.phone)} · WhatsApp ${formatPhone(teacher.whatsapp)}</small><small>Status: ${safe(status)} · ${teacher.plan.studentCount} student${teacher.plan.studentCount === 1 ? '' : 's'}</small></div><div class="admin-review-actions">${buttons}</div></article>`;
  }).join('');
  return `<section class="tab-header"><div><h1>Verify teachers</h1><p>Review teacher subjects and qualifications before publishing their profiles.</p></div></section><section class="panel">${rows || '<div class="empty-state"><span>✓</span>No teacher accounts yet.</div>'}</section>`;
}
async function adminPlanRequestsPage() {
  const { requests } = await api('/api/admin/plan-requests');
  const rows = requests.map(request => `<article class="admin-review-row"><div class="admin-review-details"><b>${safe(request.teacherName)} · ${request.tier === 'plus' ? 'Premium Plus' : 'Premium'}</b><small>${request.studentLimit.toLocaleString()} student capacity · ${formatLkr(request.priceLkr)}/month · requested ${new Date(request.createdAt).toLocaleDateString()}</small><small>Teacher phone: <a href="https://wa.me/${whatsappPhone(request.phone)}" target="_blank" rel="noopener">WhatsApp teacher and check receipt</a></small><small>Status: ${safe(request.status)}${request.expiresAt ? ` · Expires ${new Date(request.expiresAt).toLocaleDateString()}` : ''}</small></div>${request.status === 'pending' ? `<button class="button primary small" data-activate-plan="${safe(request.id)}">Receipt checked — activate</button>` : '<span class="admin-status verified">Processed</span>'}</article>`).join('');
  return `<section class="tab-header"><div><h1>Plan requests</h1><p>Review the teacher’s WhatsApp receipt, then activate the monthly plan.</p></div></section><section class="panel">${rows || '<div class="empty-state"><span>▤</span>No plan requests yet.</div>'}</section>`;
}
function adminProfilePage() {
  return `<section class="tab-header"><div><h1>Account manager</h1><p>NervaEdu main administrator account.</p></div></section><section class="panel profile-panel"><div class="profile-large">${safe(initials(currentUser.name))}</div><div class="profile-detail"><h2>${safe(currentUser.name)}</h2><p>Teacher verification and monthly plan manager</p><div class="profile-meta"><div><small>Phone / WhatsApp</small><b>${formatPhone(currentUser.phone)}</b></div><div><small>Access</small><b>Admin controls are server-protected</b></div></div></div></section>`;
}
async function teacherPlansPage() {
  const status = await api('/api/teacher-status');
  if (status.verificationStatus !== 'verified') return `<section class="tab-header"><div><h1>Teacher access</h1><p>${status.verificationStatus === 'rejected' ? 'Your application was not approved. Contact the NervaEdu account manager.' : 'Your teacher profile is waiting for the NervaEdu admin to verify your qualification and subjects.'}</p></div></section><section class="panel empty-state"><span>🔎</span>You can use teacher features after your account is verified.</section>`;
  const plan = status.plan, pending = status.pendingRequest;
  const subjectRows = status.subjects.map(item => `<div class="course-row"><div class="course-emoji">📚</div><div><h3>${safe(item.subject)}</h3><p>${plan.tier === 'free' ? `${item.studentCount} / ${item.freeLimit} free student places used` : `${item.studentCount} students assigned`}</p></div></div>`).join('');
  const premiumReady = ['premium', 'plus'].includes(plan.previousTier) || plan.studentCount >= 250 || status.subjects.some(item => item.studentCount >= 250);
  const plusReady = plan.previousTier === 'plus' || plan.studentCount >= 1400;
  const requestPanel = pending ? `<div class="callout"><div class="sun">⌛</div><div><b>${pending.tier === 'plus' ? 'Premium Plus' : 'Premium'} request is waiting for receipt review</b><p>Send the receipt to the NervaEdu admin on WhatsApp. The admin activates the plan after checking it.</p><button class="button secondary small" data-request-plan="${safe(pending.tier)}">Open WhatsApp again</button></div></div>` : `<div class="plan-cards"><article class="plan-card"><span class="admin-status">Premium</span><h2>251–1,400 students</h2><p>LKR 1,000 per month</p><button class="button primary small" data-request-plan="premium" ${premiumReady ? '' : 'disabled'}>Request Premium</button></article><article class="plan-card"><span class="admin-status">Premium Plus</span><h2>1,401–10,000 students</h2><p>LKR 2,100 per month</p><button class="button primary small" data-request-plan="plus" ${plusReady ? '' : 'disabled'}>Request Premium Plus</button></article></div><small class="field-hint">When you request a plan, WhatsApp opens for the admin. Attach your payment receipt in that chat; the plan stays locked until the admin checks and activates it.</small>`;
  return `<section class="tab-header"><div><h1>Capacity plans</h1><p>Free teachers can have up to 250 students for each subject.</p></div></section><section class="stats"><div class="stat"><div class="stat-label">Current plan</div><div class="stat-value">${plan.tier === 'plus' ? 'Premium Plus' : plan.tier === 'premium' ? 'Premium' : 'Free'}</div><div class="stat-note">${plan.expiresAt ? `Active until ${new Date(plan.expiresAt).toLocaleDateString()}` : plan.tier === 'free' ? '250 students per subject' : 'Plan active'}</div></div><div class="stat"><div class="stat-label">Students assigned</div><div class="stat-value">${plan.studentCount.toLocaleString()}</div><div class="stat-note">${plan.studentLimit.toLocaleString()} plan capacity</div></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Students by subject</h2><p>Free capacity is counted separately for each subject.</p></div></div>${subjectRows}</section><section class="panel"><div class="panel-head"><div><h2>Monthly plans</h2><p>Admin reviews your receipt and activates your plan.</p></div></div><div class="card-body">${requestPanel}</div></section></div>`;
}
async function teachersPage(subjectValue = '') {
  const subject = subjectValue || selectedTeacherSubject;
  const [{ teachers }, { choices }, { subjects }] = await Promise.all([
    api('/api/teachers?subject=' + encodeURIComponent(subject)), api('/api/my-choices'), api('/api/subjects')
  ]);
  return `<section class="tab-header"><div><h1>Find a teacher</h1><p>Browse teacher profiles by Scholarship, O/L or A/L subject and choose who you’ll learn with.</p></div><select class="select-inline" id="teacherSubjectFilter">${subjectOptions(subjects, subject)}</select></section><div class="teacher-grid">${teachers.length ? teachers.map(t => teacherCard(t, choices[subject] === t.id, subject)).join('') : `<section class="panel empty-state" style="grid-column:1/-1"><span>👩‍🏫</span>No ${safe(subject)} teachers have joined yet. Try another subject or check again later.</section>`}</div>`;
}
function teacherCard(t, selected, subject) {
  const qual = t.qualification === 'Other' ? t.otherQualification : t.qualification;
  const photo = t.thumbnail ? `<img class="teacher-photo" src="${safe(t.thumbnail)}" alt="${safe(t.name)}">` : `<div class="teacher-photo">${safe(initials(t.name))}</div>`;
  return `<article class="teacher-card"><div class="teacher-top">${photo}<div><h3>${safe(t.name)}</h3><div class="qual">${safe(qual || 'Teacher')}${t.otherQualification && t.qualification !== 'Other' ? ` · ${safe(t.otherQualification)}` : ''}</div></div></div><div class="teacher-subjects">${t.subjects.map(s => `<span class="subject-tag">${subjectIcon(s)} ${safe(s)}</span>`).join('')}</div><div class="teacher-contacts"><span class="field-hint">Contact details are shared securely when you request paid video access.</span></div><button class="button ${selected ? 'secondary' : 'primary'} small" data-choose-teacher="${safe(t.id)}" data-subject="${safe(subject)}">${selected ? '✓ Your selected teacher' : 'Choose for ' + safe(subject)}</button></article>`;
}
async function studentResourcesPage(subjectValue = '') {
  const subject = subjectValue || selectedResourceSubject;
  const [{ resources, videoPacks = [], accessRequests = [] }, { subjects }] = await Promise.all([
    api('/api/resources' + (subject ? '?subject=' + encodeURIComponent(subject) : '')), api('/api/subjects')
  ]);
  const groups = new Map();
  resources.filter(item => item.type === 'video').forEach(item => {
    const key = `${item.teacherId}|${item.subject}`;
    if (!groups.has(key)) groups.set(key, { teacherId: item.teacherId, teacherName: item.teacherName, subject: item.subject, videos: [] });
    groups.get(key).videos.push(item);
  });
  const packs = [...groups.values()].map(group => {
    const pack = videoPacks.find(item => item.teacherId === group.teacherId && item.subject === group.subject);
    const locked = group.videos.some(item => item.accessStatus !== 'unlocked');
    if (!locked) return '';
    const pending = accessRequests.some(item => item.teacherId === group.teacherId && item.subject === group.subject && item.scope === 'pack' && item.status === 'pending');
    const action = pack ? `<button class="button ${pending ? 'secondary' : 'primary'} small" data-request-pack data-teacher="${safe(group.teacherId)}" data-subject="${safe(group.subject)}" data-pending="${pending}">${pending ? 'Send receipt on WhatsApp again' : 'Request video pack'}</button>` : '<span class="field-hint">Teacher has not set a pack price yet.</span>';
    return `<div class="pack-request-row"><div><b>${safe(group.subject)} · ${safe(group.teacherName)} video pack</b><small>${group.videos.length} video${group.videos.length === 1 ? '' : 's'} · ${pack ? formatLkr(pack.priceLkr) : 'Price not set'}</small></div>${action}</div>`;
  }).join('');
  return `<section class="tab-header"><div><h1>Lessons & papers</h1><p>Videos and PDF papers shared by your teachers. Attach your payment receipt in WhatsApp when requesting paid videos.</p></div><select class="select-inline" id="resourceSubjectFilter"><option value="">All subjects</option>${subjectOptions(subjects, subject)}</select></section>${packs ? `<section class="panel access-pack-panel"><div class="panel-head"><div><h2>Video packs</h2><p>Ask the teacher to check your receipt and unlock the pack.</p></div></div>${packs}<small class="receipt-note">WhatsApp cannot attach the receipt automatically. Attach the receipt in the WhatsApp chat before sending.</small></section>` : ''}<section class="panel">${resources.length ? resources.map(resourceRow).join('') : '<div class="empty-state"><span>📚</span>No learning resources have been shared yet.</div>'}</section>`;
}
function resourceRow(r) {
  const isVideo = r.type === 'video';
  const price = isVideo ? `<span class="price-tag">${Number.isSafeInteger(Number(r.priceLkr)) ? formatLkr(r.priceLkr) : 'Price not set'}</span>` : '';
  let action = `<a class="download" href="${safe(r.url)}" target="_blank" rel="noopener">${isVideo ? 'Play' : 'Open ↗'}</a>`;
  if (isVideo && r.accessStatus !== 'unlocked') {
    action = Number.isSafeInteger(Number(r.priceLkr))
      ? `<button class="button ${r.accessStatus === 'pending' ? 'secondary' : 'primary'} small" data-request-video="${safe(r.id)}" data-pending="${r.accessStatus === 'pending'}">${r.accessStatus === 'pending' ? 'Send receipt on WhatsApp again' : 'Request access'}</button>`
      : '<span class="field-hint">Teacher has not set a price yet.</span>';
  }
  return `<div class="resource-row"><div class="file-icon">${isVideo ? '▶️' : '📄'}</div><div><b>${safe(r.title)}</b><small>${safe(r.subject)} · ${isVideo ? 'Video' : 'PDF paper'} · ${safe(r.teacherName)} · ${safe(r.name)} ${price}</small></div>${action}</div>`;
}
async function teacherResourcesPage() {
  const { resources, videoPacks = [] } = await api('/api/resources');
  const packOptions = currentUser.subjects.map(subject => {
    const pack = videoPacks.find(item => item.subject === subject);
    return `<option value="${safe(subject)}" data-price="${pack ? pack.priceLkr : ''}">${safe(subject)}</option>`;
  }).join('');
  return `<section class="tab-header"><div><h1>My resources</h1><p>Set video prices, then upload lessons and PDF papers.</p></div></section><div class="teacher-layout"><section class="panel"><div class="panel-head"><div><h2>Add a resource</h2><p>Only subjects on your profile are available.</p></div><span>📚</span></div><div class="card-body"><form id="resourceForm"><div class="field"><label>Subject</label><select name="subject" required>${currentUser.subjects.map(s => `<option>${safe(s)}</option>`).join('')}</select></div><div class="field"><label>Resource title</label><input name="title" maxlength="150" placeholder="e.g. Introduction to cells"></div><div class="field"><label>Videos <span class="field-hint">up to 5 per subject · MP4, WebM or MOV · 100 MB max each</span></label><div class="drop-area">Choose lesson videos<input id="videoFiles" type="file" name="videos" accept="video/mp4,video/webm,video/quicktime" multiple></div><div id="videoPriceFields" class="video-price-fields"></div></div><div class="field"><label>Paper or notes <span class="field-hint">PDF · 25 MB max each</span></label><div class="drop-area">Choose PDF papers<input type="file" name="papers" accept="application/pdf" multiple></div></div><div class="resource-form-actions"><button class="button primary" type="submit">Publish resources →</button><span class="field-hint">Enter a price for each video. PDFs remain open to students.</span></div></form></div></section><div class="teacher-side-stack"><section class="panel"><div class="panel-head"><div><h2>Video pack price</h2><p>One price unlocks every video you share for that subject.</p></div></div><div class="card-body"><form id="videoPackPriceForm"><div class="field"><label>Subject</label><select name="subject" id="videoPackSubject">${packOptions}</select></div><div class="field"><label>Pack price (LKR)</label><input name="priceLkr" type="number" min="1" max="10000000" step="1" required placeholder="e.g. 1500"></div><button class="button secondary small" type="submit">Save pack price</button></form></div></section><section class="panel"><div class="panel-head"><div><h2>Shared resources</h2><p>${resources.length} item${resources.length === 1 ? '' : 's'} from your subjects</p></div></div>${resources.length ? resources.map(resourceRow).join('') : '<div class="empty-state"><span>📄</span>Your uploaded resources will appear here.</div>'}</section></div></div>`;
}
async function teacherAccessRequestsPage() {
  const { requests } = await api('/api/access-requests');
  return `<section class="tab-header"><div><h1>Access requests</h1><p>Check the receipt sent to your WhatsApp before unlocking each video or pack.</p></div></section><section class="panel">${requests.length ? requests.map(request => `<div class="access-request-row"><div><b>${safe(request.studentName)} · ${safe(request.resourceTitle)}</b><small>${safe(request.subject)} · ${request.scope === 'pack' ? 'Video pack' : 'Single video'} · ${formatLkr(request.priceLkr)} · ${new Date(request.createdAt).toLocaleDateString()}</small><small>Student phone: <a href="tel:${encodeURIComponent(request.studentPhone)}">${formatPhone(request.studentPhone)}</a> · <a href="https://wa.me/${whatsappPhone(request.studentPhone)}" target="_blank" rel="noopener">WhatsApp student</a></small></div><button class="button primary small" data-unlock-request="${safe(request.id)}">I checked the receipt — unlock</button></div>`).join('') : '<div class="empty-state"><span>🔒</span>No pending video access requests.</div>'}</section>`;
}async function teacherQuizzesPage() {
  const { quizzes } = await api('/api/quizzes'); const mine = quizzes.filter(q => q.teacherId === currentUser.id);
  return `<section class="tab-header"><div><h1>My quizzes</h1><p>Create six-question multiple-choice practice for your students.</p></div></section><div class="teacher-layout"><section class="panel"><div class="panel-head"><div><h2>New six-question quiz</h2><p>Each question needs four answer choices.</p></div><span>✎</span></div><div class="card-body"><form id="quizForm"><div class="field"><label>Subject</label><select name="subject">${currentUser.subjects.map(s => `<option>${safe(s)}</option>`).join('')}</select></div><div class="field"><label>Quiz title</label><input name="title" maxlength="120" placeholder="e.g. Cells and living things"></div><div id="quizBuilder">${Array.from({ length: 6 }, (_, i) => `<div class="quiz-question" data-question="${i}"><label>Question ${i + 1}</label><input class="question-prompt" maxlength="300" placeholder="Write your question"><div class="quiz-options">${['A', 'B', 'C', 'D'].map((l, j) => `<input class="question-option" maxlength="180" placeholder="${l}. Answer choice">`).join('')}</div><label style="font-size:9px">Correct choice</label><select class="quiz-answer">${['A', 'B', 'C', 'D'].map((l, j) => `<option value="${j}">${l}</option>`).join('')}</select></div>`).join('')}</div><button class="button primary" type="submit" style="margin-top:12px">Publish quiz →</button></form></div></section><section class="panel"><div class="panel-head"><div><h2>Published by you</h2><p>Quiz papers for your classes.</p></div></div>${mine.length ? mine.map(q => `<div class="student-quiz"><h3>${safe(q.title)}</h3><p>${safe(q.subject)} · ${q.questions.length} questions</p></div>`).join('') : '<div class="empty-state"><span>✏️</span>Your published quizzes will appear here.</div>'}</section></div>`;
}
async function studentQuizzesPage() {
  const subject = selectedQuizSubject; const [{ quizzes }, { subjects }] = await Promise.all([
    api('/api/quizzes' + (subject ? '?subject=' + encodeURIComponent(subject) : '')), api('/api/subjects')
  ]);
  return `<section class="tab-header"><div><h1>Practice quizzes</h1><p>Try a quiz from your teachers and see your score right away.</p></div><select class="select-inline" id="quizSubjectFilter"><option value="">All subjects</option>${subjectOptions(subjects, subject)}</select></section><section class="panel">${quizzes.length ? quizzes.map(q => `<div class="student-quiz"><h3>${safe(q.title)}</h3><p>${safe(q.subject)} · ${q.questions.length} questions · ${safe(q.teacherName)}</p><form class="take-quiz" data-quiz="${safe(q.id)}">${q.questions.map((question, i) => `<div class="take-question"><p>${i + 1}. ${safe(question.prompt)}</p>${question.options.map((option, j) => `<label class="take-option"><input type="radio" name="q${i}" value="${j}" required> ${safe(option)}</label>`).join('')}</div>`).join('')}<button class="button primary small" type="submit">Submit answers</button><span class="quiz-result" style="font-size:10px;margin-left:8px"></span></form></div>`).join('') : '<div class="empty-state"><span>✓</span>No quizzes yet. Your teachers’ new quizzes will appear here.</div>'}</section>`;
}
async function teachersForProfile(subject) { return api('/api/teachers?subject=' + encodeURIComponent(subject)); }
async function profilePage() {
  const u = currentUser;
  if (u.role === 'student') { const { choices } = await api('/api/my-choices'); const chosen = await Promise.all(Object.entries(choices).map(async ([subject, id]) => { const { teachers } = await teachersForProfile(subject); return teachers.find(t => t.id === id); }));
    return `<section class="tab-header"><div><h1>My account</h1><p>Your student details and selected subject teachers.</p></div></section><section class="panel profile-panel"><div class="profile-large">${safe(initials(u.name))}</div><div class="profile-detail"><h2>${safe(u.name)}</h2><p>Student · Age ${u.age} · ${safe(u.school)}</p><div class="profile-meta"><div><small>Phone</small><b>${formatPhone(u.phone)}</b></div><div><small>Home address</small><b>${safe(u.address)}</b></div></div></div></section><section class="panel section-spacer"><div class="panel-head"><div><h2>My chosen teachers</h2><p>Choose a teacher for each subject from their profile cards.</p></div><button class="button secondary small" data-goto="teachers">Find teachers</button></div>${chosen.filter(Boolean).length ? chosen.filter(Boolean).map(t => `<div class="resource-row"><div class="teacher-photo">${t.thumbnail ? `<img class="teacher-photo" src="${safe(t.thumbnail)}" alt="">` : safe(initials(t.name))}</div><div><b>${safe(t.name)}</b><small>${safe(t.subjects.join(', '))} · ${safe(t.qualification === 'Other' ? t.otherQualification : t.qualification)}</small></div></div>`).join('') : '<div class="empty-state">No teacher selected yet. Browse profiles to choose one for each subject.</div>'}</section>`;
  }
  const qualification = u.qualification === 'Other' ? u.otherQualification : u.qualification;
  const picture = u.thumbnail ? `<img class="profile-large" src="${safe(u.thumbnail)}" alt="${safe(u.name)}">` : `<div class="profile-large">${safe(initials(u.name))}</div>`;
  return `<section class="tab-header"><div><h1>Teacher profile</h1><p>This profile is shown to students looking for your subjects.</p></div></section><section class="panel profile-panel">${picture}<div class="profile-detail"><h2>${safe(u.name)}</h2><p>Teacher · Hillview learning space</p><div class="teacher-subjects">${u.subjects.map(s => `<span class="subject-tag">${subjectIcon(s)} ${safe(s)}</span>`).join('')}</div><div class="profile-meta"><div><small>Qualification</small><b>${safe(qualification)}</b></div>${u.otherQualification && u.qualification !== 'Other' ? `<div><small>Additional qualification</small><b>${safe(u.otherQualification)}</b></div>` : ''}<div><small>Call</small><b><a href="tel:${encodeURIComponent(u.phone)}">${formatPhone(u.phone)}</a></b></div><div><small>WhatsApp</small><b><a href="https://wa.me/${u.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">${formatPhone(u.whatsapp)}</a></b></div><div><small>Profile photo</small><b>${u.thumbnail ? 'Added' : 'Not added'}</b></div></div></div></section>`;
}
function renderVideoPriceFields() {
  const input = $('#videoFiles'), container = $('#videoPriceFields');
  if (!input || !container) return;
  container.innerHTML = [...input.files].map((file, index) => `<label class="video-price-row"><span>${safe(file.name)}</span><span><input type="number" min="1" max="10000000" step="1" name="videoPrice${index}" required placeholder="Price in LKR"><small>LKR</small></span></label>`).join('');
}
function bindPageActions() {
  $$('[data-goto]').forEach(b => b.onclick = () => navigatePage(b.dataset.goto));
  $$('[data-goto-teachers]').forEach(b => b.onclick = () => { selectedTeacherSubject = b.dataset.gotoTeachers; navigatePage('teachers'); });
  $$('[data-upload-subject]').forEach(b => b.onclick = () => renderPage('resources').then(() => { const s = $('#resourceForm select[name=subject]'); if (s) s.value = b.dataset.uploadSubject; }));
  if ($('#teacherSubjectFilter')) $('#teacherSubjectFilter').onchange = event => { selectedTeacherSubject = event.target.value; renderPage('teachers'); };
  if ($('#resourceSubjectFilter')) $('#resourceSubjectFilter').onchange = event => { selectedResourceSubject = event.target.value; renderPage('resources'); };
  if ($('#quizSubjectFilter')) $('#quizSubjectFilter').onchange = event => { selectedQuizSubject = event.target.value; renderPage('quizzes'); };
  $$('[data-choose-teacher]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await api('/api/teacher-choice', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: button.dataset.subject, teacherId: button.dataset.chooseTeacher }) }); toast('Teacher selected for ' + button.dataset.subject + '.'); await renderPage('teachers'); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  if ($('#videoFiles')) $('#videoFiles').onchange = renderVideoPriceFields;
  if ($('#videoPackSubject')) { const updatePackPrice = event => { const option = event.target.selectedOptions[0]; $('#videoPackPriceForm').elements.priceLkr.value = option.dataset.price || ''; }; $('#videoPackSubject').onchange = updatePackPrice; updatePackPrice({ target: $('#videoPackSubject') }); }
  if ($('#videoPackPriceForm')) $('#videoPackPriceForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type=submit]'); button.disabled = true;
    try { await api('/api/video-pack-price', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: form.elements.subject.value, priceLkr: Number(form.elements.priceLkr.value) }) }); toast('Video pack price saved.'); await renderPage('resources'); }
    catch (error) { toast(error.message); button.disabled = false; }
  };
  if ($('#resourceForm')) $('#resourceForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    const videos = [...form.elements.videos.files], papers = [...form.elements.papers.files], files = [...videos, ...papers];
    if (!files.length) return toast('Choose at least one video or PDF.');
    if (videos.length > 5) return toast('Choose up to five videos per upload.');
    const prices = videos.map((_, index) => Number(form.elements[`videoPrice${index}`]?.value));
    if (prices.some(price => !Number.isSafeInteger(price) || price < 1 || price > 10000000)) return toast('Enter a whole-number LKR price for every video.');
    const button = form.querySelector('button[type=submit]'); button.disabled = true; const subject = form.elements.subject.value, title = form.elements.title.value;
    let published = 0;
    try {
      for (const file of files) {
        button.textContent = `Uploading ${published + 1} of ${files.length}?`;
        const data = new FormData(); data.set('subject', subject); data.set('title', title); data.append('files', file);
        if (file.type.startsWith('video/')) data.set('priceLkr', String(prices[videos.indexOf(file)]));
        try { await uploadToImageKit(file, { subject, title, priceLkr: file.type.startsWith('video/') ? prices[videos.indexOf(file)] : undefined }); }
        catch (error) {
          if (error.message !== 'ImageKit is not configured on this server yet.') throw error;
          await api('/api/resources', { method: 'POST', body: data });
        }
        published++;
      }
      toast('Resources published for ' + subject + '.'); await renderPage('resources');
    } catch (error) {
      toast(published ? `${published} file(s) uploaded. ${error.message}` : error.message); button.disabled = false; button.textContent = 'Publish resources ?';
      if (published) await renderPage('resources');
    }
  };
  $$('[data-request-video], [data-request-pack]').forEach(button => button.onclick = async () => {
    button.disabled = true; const whatsappTab = window.open('about:blank', '_blank'); if (whatsappTab) whatsappTab.opener = null;
    try {
      const body = button.hasAttribute('data-request-video') ? { scope: 'video', resourceId: button.dataset.requestVideo } : { scope: 'pack', teacherId: button.dataset.teacher, subject: button.dataset.subject };
      const { whatsappUrl } = await api('/api/access-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (whatsappTab) whatsappTab.location.href = whatsappUrl; else window.location.assign(whatsappUrl);
    } catch (error) { if (whatsappTab) whatsappTab.close(); toast(error.message); button.disabled = false; }
  });
  $$('[data-unlock-request]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await api(`/api/access-requests/${encodeURIComponent(button.dataset.unlockRequest)}/unlock`, { method: 'POST' }); toast('Video access unlocked for the student.'); await renderPage('access'); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  $$('[data-verify-teacher]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await api(`/api/admin/teachers/${encodeURIComponent(button.dataset.verifyTeacher)}/verification`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: button.dataset.approved === 'true' }) }); toast(button.dataset.approved === 'true' ? 'Teacher verified.' : 'Teacher application rejected.'); await renderPage('admin-teachers'); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  $$('[data-activate-plan]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await api(`/api/admin/plan-requests/${encodeURIComponent(button.dataset.activatePlan)}/activate`, { method: 'POST' }); toast('Monthly plan activated for one month.'); await renderPage('admin-plans'); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  $$('[data-request-plan]').forEach(button => button.onclick = async () => {
    button.disabled = true; const whatsappTab = window.open('about:blank', '_blank'); if (whatsappTab) whatsappTab.opener = null;
    try {
      const { whatsappUrl } = await api('/api/plan-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: button.dataset.requestPlan }) });
      if (whatsappTab) whatsappTab.location.href = whatsappUrl; else window.location.assign(whatsappUrl);
    } catch (error) { if (whatsappTab) whatsappTab.close(); toast(error.message); button.disabled = false; }
  });
  if ($('#quizForm')) $('#quizForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    const questions = $$('.quiz-question', form).map(row => ({ prompt: $('.question-prompt', row).value.trim(), options: $$('.question-option', row).map(i => i.value.trim()), answer: Number($('.quiz-answer', row).value) }));
    if (questions.some(q => !q.prompt || q.options.some(x => !x))) return toast('Complete all six questions and four choices for each.');
    const button = form.querySelector('button[type=submit]'); button.disabled = true;
    try { await api('/api/quizzes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: form.elements.subject.value, title: form.elements.title.value, questions }) }); toast('Your quiz is published for students.'); await renderPage('quizzes'); }
    catch (error) { toast(error.message); button.disabled = false; }
  };
  $$('.take-quiz').forEach(form => form.onsubmit = async event => {
    event.preventDefault(); const answers = Array.from({ length: 6 }, (_, i) => new FormData(form).get('q' + i));
    if (answers.some(a => a === null)) return toast('Answer all six questions first.');
    try { const result = await api(`/api/quizzes/${encodeURIComponent(form.dataset.quiz)}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) }); $('.quiz-result', form).textContent = `Score: ${result.score}/${result.total} (${result.percent}%)`; }
    catch (error) { toast(error.message); }
  });
}
$('#switchAuth').onclick = () => chooseAuth(true); populateSubjects(); chooseAuth(false);
$$('.role-option').forEach(button => button.onclick = () => setRegRole(button.dataset.role));
$('#registerForm').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget, role = form.elements.role.value;
  const messageText = $('#authMessage'); messageText.textContent = ''; messageText.classList.remove('success');
  const selectedSubjects = $$('input[name=subjectChoice]:checked', form).map(i => i.value);
  const customNames = role === 'teacher' ? form.elements.otherSubjects.value.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (role === 'teacher' && !selectedSubjects.length && !customNames.length) return message('#authMessage', 'Select at least one listed subject or enter an other subject.');
  if (customNames.some(s => s.length < 2 || s.length > 80)) return message('#authMessage', 'Each custom subject must be between 2 and 80 characters.');
  const data = new FormData(); data.set('role', role); data.set('name', form.elements.name.value.trim()); data.set('password', form.elements.password.value);
  if (role === 'student') { data.set('age', form.elements.age.value); data.set('phone', form.elements.phone.value.trim()); data.set('address', form.elements.address.value.trim()); data.set('school', form.elements.school.value.trim()); }
  else {
    data.set('phone', form.elements.phoneTeacher.value.trim()); data.set('whatsapp', form.elements.whatsapp.value.trim());
    const level = form.elements.otherSubjectLevel.value;
    const customSubjects = customNames.map(subject => `${level} — ${subject}`);
    data.set('subjects', JSON.stringify([...new Set([...selectedSubjects, ...customSubjects])]));
    data.set('qualification', form.elements.qualification.value); data.set('otherQualification', form.elements.otherQualification.value.trim());
    if (form.elements.thumbnail.files[0]) data.set('thumbnail', form.elements.thumbnail.files[0]);
  }
  const button = form.querySelector('button[type=submit]'); button.disabled = true; button.textContent = 'Creating account…';
  window.NervaLoader?.show('Creating your account');
  try { const result = await api('/api/register', { method: 'POST', body: data }); form.reset(); setRegRole('student'); await showApp(result.user); }
  catch (error) { message('#authMessage', error.message); button.disabled = false; button.innerHTML = 'Create my account <span>→</span>'; }
  finally { window.NervaLoader?.hide(); }
};
$('#loginForm').onsubmit = async event => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true; button.textContent = 'Signing in…';
  window.NervaLoader?.show('Signing in to NervaEdu');
  try { const result = await api('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: form.elements.phone.value.trim(), password: form.elements.password.value }) }); form.reset(); await showApp(result.user); }
  catch (error) { message('#authMessage', error.message); button.disabled = false; button.innerHTML = 'Sign in <span>→</span>'; }
  finally { window.NervaLoader?.hide(); }
};
async function signOut() {
  try { await api('/api/logout', { method: 'POST' }); }
  catch (error) { toast(error.message); return; }
  currentUser = null; $('#appScreen').classList.add('hidden'); $('#authScreen').classList.remove('hidden'); chooseAuth(false);
}
$('#logoutButton').onclick = signOut;
$('#topLogout').onclick = signOut;
$('#profileButton').onclick = () => renderPage('profile'); $('#mobileProfile').onclick = () => renderPage('profile');
api('/api/me').then(({ user }) => user ? showApp(user) : null).catch(() => {}).finally(() => window.NervaLoader?.hide());
