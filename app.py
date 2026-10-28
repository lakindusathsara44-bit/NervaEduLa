import streamlit as st
from datetime import datetime

st.set_page_config(page_title='NervaEduLa | Learning Portal', page_icon='📚', layout='wide', initial_sidebar_state='expanded')
st.markdown('''<style>.stApp{background:#0b1020;color:#eef2ff}[data-testid="stSidebar"]{background:#111a2e}.hero{padding:1.5rem;border:1px solid #263653;border-radius:18px;background:linear-gradient(120deg,#14213d,#102d35);margin-bottom:1rem}.muted{color:#a8b5cc}.pill{display:inline-block;padding:.25rem .65rem;border-radius:999px;border:1px solid #3b536e;color:#c7e7e5;font-size:.85rem}</style>''', unsafe_allow_html=True)

st.sidebar.title('📚 NervaEduLa')
page = st.sidebar.radio('Navigation', ['Home', 'Student Portal', 'Teacher Portal', 'About & Deployment'])
st.markdown('<div class="hero"><span class="pill">Learning Portal</span><h1>Welcome to NervaEduLa</h1><p class="muted">A simple Streamlit entry point for the NervaEduLa project.</p></div>', unsafe_allow_html=True)

if page == 'Home':
    st.subheader('Learning made easier')
    left, right = st.columns(2)
    with left:
        st.markdown('### 🎓 Student Portal')
        st.write('Browse study areas and open learning resources when links are provided.')
        if st.button('Open Student Portal', use_container_width=True):
            st.session_state['page_to_open'] = 'Student Portal'
            st.info('Choose Student Portal from the sidebar.')
    with right:
        st.markdown('### 🧑‍🏫 Teacher Portal')
        st.write('Preview the resource fields needed for lessons, papers, and quizzes.')
        if st.button('Open Teacher Portal', use_container_width=True):
            st.info('Choose Teacher Portal from the sidebar.')
    st.info('This is a Streamlit-compatible starter interface. It does not replace the existing Node.js/Firebase application or its authentication and database.')
    st.markdown('**Project repository:** [NervaEduLa on GitHub](https://github.com/lakindusathsara44-bit/NervaEduLa)')
elif page == 'Student Portal':
    st.subheader('Student Portal')
    st.write('Choose a study area and resource type.')
    subject = st.selectbox('Study area', ['HNDIT / IT', 'Ordinary Level (O/L)', 'Advanced Level (A/L)', 'Scholarships', 'Teacher Qualifications', 'Other'])
    kind = st.selectbox('Resource type', ['Video lesson', 'Past paper (PDF)', 'MCQ quiz', 'General notes'])
    st.markdown('---')
    st.markdown(f'### {subject}')
    st.write(f'Selected resource type: **{kind}**')
    st.caption('No course resources are connected in this starter build yet. Connect the existing database or supply resource URLs to display real content.')
    url = st.text_input('Optional resource URL', placeholder='https://…')
    if st.button('Open resource', disabled=not url.strip()):
        if url.strip().startswith(('https://', 'http://')):
            st.link_button('Open selected resource', url.strip(), use_container_width=True)
        else:
            st.error('Enter a valid URL starting with http:// or https://.')
elif page == 'Teacher Portal':
    st.subheader('Teacher Portal — resource preview')
    st.warning('This is a UI preview only. It has no teacher authentication and does not save data to Firebase or a database.')
    with st.form('resource_form'):
        title = st.text_input('Resource title')
        subject = st.selectbox('Subject / course', ['HNDIT / IT', 'O/L', 'A/L', 'Scholarships', 'Other'])
        kind = st.selectbox('Resource type', ['Video lesson', 'Past paper (PDF)', 'MCQ quiz', 'Notes'])
        link = st.text_input('Resource URL')
        submitted = st.form_submit_button('Preview resource')
    if submitted:
        if not title.strip():
            st.error('Enter a resource title.')
        elif not link.strip().startswith(('https://', 'http://')):
            st.error('Enter a valid URL starting with http:// or https://.')
        else:
            st.success('Resource preview created for this session.')
            st.write({'title': title.strip(), 'subject': subject, 'type': kind, 'url': link.strip()})
            st.link_button('Open resource', link.strip())
else:
    st.subheader('About this Streamlit entry point')
    st.write('The current NervaEduLa repository is a Node.js application with frontend assets and Firebase/Firestore integration. Adding app.py alone cannot make Streamlit execute that Node.js server or automatically carry over its login, teacher/student features, quizzes, and database.')
    st.write('This app.py provides a separate, deployable Streamlit starter interface. A full migration requires deliberately rebuilding and testing the existing app functionality in Python/Streamlit or deploying the existing Node.js app on a Node-compatible host.')
    st.markdown('#### Deploy on Streamlit Community Cloud')
    st.markdown('1. Select repository: lakindusathsara44-bit/NervaEduLa\n2. Select branch: feature/streamlit-entrypoint-2026\n3. Set main file path to: app.py\n4. Deploy.')
    st.markdown('[Streamlit deployment guide](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app)')
    st.caption('Build timestamp: ' + datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'))
st.sidebar.divider()
st.sidebar.caption('Streamlit starter • Not a production LMS')
