# NervaEdu

NervaEdu is a small, self-hosted learning management system for a school. It includes student and teacher accounts, teacher profiles, subject discovery, videos and PDF resources, and six-question multiple-choice quizzes.

## Run it

1. Install Node.js 22 or newer on the computer that will host the app.
2. Copy `.env.example` to `.env`, then set a private account-manager phone number and password. The server creates the protected admin account on first start and stores only its salted password hash in the database.
3. On Windows, double-click `start-nervaedu.bat`. It starts the local server and opens the app.

You can also open a terminal in this folder, run `node server.js` (or `npm start`), then visit [http://localhost:4173](http://localhost:4173). Do not open `index.html` directly as a `file://` page; the account and upload features require the server.

## HTTP and file layout

Only `public/` contains files for frontend delivery: `public/index.html` and the two named files in `public/assets/`. The subject catalog is serialized from the server module by the `/assets/catalog.js` route. The frontend also includes the loader and authentication-motion assets used by the welcome and sign-in experience. The HTTP server serves only these explicit frontend paths; it does not serve the project root or expose directory indexes. Server code, dependencies, environment files, and the local database remain outside the public directory. Local data and uploads stay under `data/` and are accessed only through application code and authenticated upload routes.

Requests containing environment filenames, private/config/data directories, source/configuration filenames, logs, backups, or traversal segments receive a 404 response. Upload downloads accept only app-generated UUID filenames and verify the user session and resource permissions before opening a file.

Without Firebase configuration, the server creates `data/nervaedu.json` for accounts and learning records. Uploaded profile photos, videos and PDFs are stored in `data/uploads/`. Keep the `data/` folder when backing up the local edition. Do not publish it or commit real student information to a public repository.

## Use Cloud Firestore

The backend can store users, teacher choices, resource metadata and quizzes in Cloud Firestore. Configure ImageKit below for cloud-hosted videos and papers before deploying multiple server instances.

1. Create a Firebase project and enable Cloud Firestore in the Firebase console.
2. Copy `.env.example` to `.env` and set `NERVAEDU_DATABASE=firestore` and `FIREBASE_PROJECT_ID`. Set the account-manager phone and private password in `.env`; the server stores only a salted password hash in its database.
3. For local development, create a Firebase service account key and store it outside this repository. Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to its full path. Never commit the key. On Google Cloud, use Application Default Credentials from the server's service identity instead.
4. Install dependencies with `npm install`, then start NervaEdu with `npm start`.

The Admin SDK uses privileged server credentials. `firestore.rules` denies all direct browser access; keep that protection in place so password hashes and student details are not exposed. The first run reads Firestore as the source of truth. To deliberately import existing local records into an empty Firestore database, set `FIREBASE_IMPORT_LOCAL=true` for that first run. Review the local records before enabling this because it uploads account and student information to your Firebase project.

Firestore collections are `users`, `resources`, `quizzes`, `studentChoices`, `videoPacks`, `videoAccessRequests`, `videoUnlocks`, and `teacherPlanRequests`. Store service-account credentials securely and grant the server only the Google Cloud permissions it needs.

## Deploy from GitHub to Google Cloud Run

The workflow in `.github/workflows/deploy-cloudrun.yml` deploys the full Node.js application to Cloud Run whenever changes are pushed to `main`. It uses GitHub Actions with Google Workload Identity Federation, so no Google service-account key is stored in GitHub. GitHub Pages cannot run this backend; Cloud Run hosts the server, while GitHub stores the source and triggers deployments.

One-time Google Cloud setup (project `nervaedu`, region `asia-south1`):

1. Enable Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and the IAM Credentials APIs. Configure billing for the project.
2. Create a Cloud Run runtime service account and grant it `roles/datastore.user` on the project so the Firebase Admin SDK can use Firestore through Application Default Credentials.
3. Create Secret Manager secrets named `NERVAEDU_ADMIN_PHONE`, `NERVAEDU_ADMIN_PASSWORD`, `NERVAEDU_ADMIN_NAME`, `IMAGEKIT_PUBLIC_KEY`, and `IMAGEKIT_PRIVATE_KEY`. Add each value as a secret version. Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` for these secrets.
4. Create a Workload Identity Pool and GitHub OIDC provider restricted by an attribute condition to `lakindusathsara44-bit/NervaEdu`. Create a deployment service account and grant it the Cloud Run/Cloud Build deployment permissions and `roles/iam.serviceAccountUser` on the runtime service account. Allow the GitHub provider to impersonate the deployment service account.
5. In the GitHub repository, add these **Actions variables** under Settings → Secrets and variables → Actions → Variables:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`: full provider resource name (`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`)
   - `GCP_SERVICE_ACCOUNT`: deployment service account email
6. Push to `main` or run **Deploy NervaEdu to Cloud Run** from the Actions tab. The workflow publishes the Cloud Run URL in its deployment output.

The deployment action builds from this repository using the Node.js package configuration. The app uses Cloud Run's `PORT` and binds to `0.0.0.0` in production. Keep the admin password and ImageKit private key only in Secret Manager. Do not add credential values to GitHub variables, source files, or commits. Configure the runtime service account separately from the GitHub deployment service account: GitHub federation authenticates deployment only; the server uses Cloud Run Application Default Credentials for Firestore.

## Use ImageKit for media

Set `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, and `IMAGEKIT_URL_ENDPOINT` in the server's environment. The private key must only exist in the server's secret configuration. Teacher video uploads go directly from the browser to ImageKit; videos are uploaded as private files, and NervaEdu returns a short-lived signed URL only to the teacher or a student whose teacher has unlocked access. PDFs are stored in ImageKit and shared as public links. When ImageKit is not configured, small local uploads continue to use `data/uploads/`.

## Included

- Student sign-up: name, age, phone, home address, school and password.
- Teacher sign-up: name, subjects, call number, WhatsApp number, highest qualification, other qualification when applicable, and an optional profile photo.
- New teacher profiles stay hidden until the NervaEdu account manager verifies them. The free plan permits up to 250 students per subject. Premium supports up to 1,400 students for LKR 1,000/month; Premium Plus supports up to 10,000 for LKR 2,100/month. Teachers send a plan receipt via WhatsApp; the account manager activates the plan after checking payment.
- Teacher directory filtered by subject; students can select a teacher for each subject.
- Sri Lankan G.C.E. O/L and A/L subject lists plus custom subjects for teachers.
- Teacher uploads: up to five videos per subject, plus PDF papers and notes. Teachers set an LKR price on each video or one price for the subject video pack. Students send a payment receipt to the teacher in WhatsApp; the teacher reviews it and unlocks the video or pack. Video limit is 100 MB per file; PDF limit is 25 MB per file.
- Six-question quizzes with four choices per question and server-checked answers.
- Passwords stored as salted scrypt hashes. Sessions use an HttpOnly cookie.

## Notes

The app listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` in `.env` when deploying on a platform that requires an externally reachable port. Put it behind HTTPS and add school-managed backups, access controls, and an appropriate privacy process for student contact details. Use a non-production dataset while evaluating it.

The interface uses an optional Google Fonts stylesheet. Local JSON mode uses Node.js built-in modules; Firestore mode uses the Firebase Admin SDK.
