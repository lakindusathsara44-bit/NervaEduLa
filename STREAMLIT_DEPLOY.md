# NervaEduLa — Streamlit entry point

This branch adds a minimal Streamlit app at the repository root so Streamlit Community Cloud can recognize an entry point.

## Deploy

1. Open https://share.streamlit.io/
2. Choose **Create app**.
3. Repository: lakindusathsara44-bit/NervaEduLa
4. Branch: feature/streamlit-entrypoint-2026
5. Main file path: app.py
6. Deploy.

## Important compatibility note

The existing NervaEduLa codebase is a Node.js application with Firebase/Firestore integration. A Python app.py does not automatically run server.js, transfer the current frontend, or preserve authentication, database, teacher/student workflows, and quizzes.

This branch's app.py is a separate Streamlit starter/demo interface. It is deployable, but it is **not** a complete migration of the original LMS and it does not persist teacher-entered resources. A full migration would require rebuilding and testing those features in Streamlit/Python, or deploying the existing Node.js application on a Node-compatible host.
