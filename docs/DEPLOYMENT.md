# NervaEdu Pages and API deployment

GitHub Pages serves the static frontend. The Node.js API and Firestore access run on Cloud Run; Pages cannot run the server itself.

## Deploy the API

1. Configure the repository Actions variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` for the Google Workload Identity Federation provider and deployment service account.
2. Create the `NERVAEDU_ADMIN_PHONE`, `NERVAEDU_ADMIN_PASSWORD`, `NERVAEDU_ADMIN_NAME`, `IMAGEKIT_PUBLIC_KEY`, and `IMAGEKIT_PRIVATE_KEY` secrets in Google Secret Manager. Grant the Cloud Run runtime service account access to those secrets and the Firestore database.
3. Run **Deploy NervaEdu to Cloud Run** from the repository Actions tab. The workflow validates the federation variables before attempting deployment and prints the Cloud Run service URL after a successful deployment.

## Connect GitHub Pages to the API

1. Add the Actions variable `NERVAEDU_API_URL` under repository **Settings → Secrets and variables → Actions → Variables**. Set it to the HTTPS Cloud Run service origin only, such as `https://nervaedu-....asia-south1.run.app`, with no path or trailing API route.
2. Run **Deploy NervaEdu to GitHub Pages** or push a change to `main`. The Pages build injects that public service URL and copies the frontend from `public/`, including the generated subject catalog.
3. The Cloud Run workflow allows API requests only from `https://lakindusathsara44-bit.github.io`. The browser stores the signed session token in `sessionStorage` and sends it as a bearer token; this avoids relying on cross-site cookies, which browsers may block.

If `NERVAEDU_API_URL` is unset, Pages still publishes the interface, but account and learning API actions show a setup message. Registration cannot work until the API is deployed and that variable is set.

