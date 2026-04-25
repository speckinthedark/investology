# CI/CD for StockPulse Tracker

## What is CI/CD?

CI/CD stands for **Continuous Integration / Continuous Delivery** (sometimes Deployment). It's the practice of automatically building, testing, and deploying your code every time you push a change — removing the manual steps you've been doing in the terminal.

Right now your workflow looks like this:

```
Edit code → git push → manually run gcloud builds submit → manually run gcloud run deploy
```

With CI/CD it becomes:

```
Edit code → git push → everything else happens automatically
```

---

## The Two Halves

### Continuous Integration (CI)

Every time you push to GitHub, an automated system checks that your code is healthy:

- **Build** — can the project compile without errors?
- **Test** — do all the tests pass?
- **Lint** — does the code meet style standards?

If any step fails, you get notified before broken code ever reaches production. Think of it as a gatekeeper that catches problems while they're still cheap to fix.

### Continuous Delivery / Deployment (CD)

Once CI passes, the CD pipeline takes over and ships the code:

- Builds a new Docker image
- Pushes it to a container registry
- Deploys it to Cloud Run

**Delivery** means the code is ready to deploy and a human presses a button to release it.  
**Deployment** means the release happens automatically with no human in the loop.

For a personal project like this one, full automatic deployment on every push to `main` is the right call.

---

## How It Works for This Project

This project already has the two pieces needed to automate deployment:

1. **A Dockerfile** — tells Cloud Build exactly how to build the image
2. **Cloud Run** — already running and expecting image updates

The missing piece is a **trigger**: something that watches GitHub and kicks off a Cloud Build job automatically when `main` changes.

Here's the end-to-end flow once CI/CD is configured:

```
1. You push a commit to main on GitHub
        ↓
2. GitHub notifies Google Cloud Build (via a webhook)
        ↓
3. Cloud Build pulls your code and runs the Dockerfile
        ↓
4. The new image is pushed to Artifact Registry
        ↓
5. Cloud Build deploys the new image to Cloud Run
        ↓
6. Your app at the Cloud Run URL is updated (zero downtime)
```

The whole process takes about 4–6 minutes. You don't touch a terminal.

---

## How to Set It Up

There are two ways to automate this. Both use Google Cloud Build, which you already have working.

### Option A: Cloud Build Trigger via the Console (easier, no YAML)

This connects your GitHub repo directly to Cloud Build through the GCP console UI.

1. Go to **Cloud Build → Triggers** in the [GCP Console](https://console.cloud.google.com/cloud-build/triggers) — make sure you're in project `gen-lang-client-0610398133`.
2. Click **Create Trigger**.
3. Set:
   - **Name:** `deploy-on-push-to-main`
   - **Event:** Push to a branch
   - **Source:** Connect your GitHub repo (first time requires OAuth)
   - **Branch:** `^main$`
   - **Configuration:** Autodetected (it will find `cloudbuild.yaml` — see below)
4. Click **Save**.

That's the trigger. Cloud Build still needs to know what steps to run, which brings us to the config file.

### The `cloudbuild.yaml` Config File

This file lives at the root of your repo and tells Cloud Build the exact steps to execute. Here's what it should look like for this project:

```yaml
# cloudbuild.yaml
steps:
  # Step 1: Build the Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-west1-docker.pkg.dev/gen-lang-client-0610398133/stockpulse/stockpulse-tracker:$COMMIT_SHA'
      - '-t'
      - 'us-west1-docker.pkg.dev/gen-lang-client-0610398133/stockpulse/stockpulse-tracker:latest'
      - '.'

  # Step 2: Push both tags to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '--all-tags', 'us-west1-docker.pkg.dev/gen-lang-client-0610398133/stockpulse/stockpulse-tracker']

  # Step 3: Deploy the new image to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'stockpulse-tracker'
      - '--image'
      - 'us-west1-docker.pkg.dev/gen-lang-client-0610398133/stockpulse/stockpulse-tracker:$COMMIT_SHA'
      - '--region'
      - 'us-west1'
      - '--quiet'

images:
  - 'us-west1-docker.pkg.dev/gen-lang-client-0610398133/stockpulse/stockpulse-tracker'

options:
  logging: CLOUD_LOGGING_ONLY
```

Key details:
- `$COMMIT_SHA` is automatically injected by Cloud Build — every deployment is tagged with the exact git commit that produced it, so you can roll back to any previous version by deploying an older image tag.
- The `--quiet` flag on `gcloud run deploy` suppresses the interactive prompt that would stall the pipeline.

### Option B: GitHub Actions (if you prefer keeping CI/CD config in GitHub)

GitHub Actions is an alternative that keeps your pipeline config inside your repo under `.github/workflows/`. It can call `gcloud` commands using a service account key. This is more portable but requires managing a GCP service account secret in GitHub. Cloud Build Triggers (Option A) is simpler for a project already on GCP.

---

## What is a Service Account?

When you run `gcloud run deploy` from your own terminal, GCP knows who you are — you logged in with your Google account (`rohan.kirpy@gmail.com`) and it checks whether your account has permission to deploy.

But when Cloud Build runs automatically in the background with no human present, there's no "you" to authenticate as. It needs an identity of its own. That's what a **service account** is:

> A service account is a Google identity for a program or automated process, not a human. It has its own email address, its own credentials, and its own set of permissions.

Instead of a password, service accounts authenticate using a private key or (more commonly within GCP) automatically via the metadata server — Cloud Build just knows which service account it's running as, no manual login required.

### The analogy

Think of your personal Google account like a staff ID badge — it gets you through the doors your employer decided you should access. A service account is like a separate badge issued to a robot or a script. You decide exactly which doors that badge can open, and you can revoke it without touching your own access.

### GCP creates one for you automatically

When you enabled Cloud Build on your project, GCP silently created a service account called the **Cloud Build service account**:

```
<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com
```

This is the identity Cloud Build uses by default when it runs your pipeline steps. It already has permission to build Docker images and push them to Artifact Registry. The one thing it's missing — and why you're hitting a wall in the trigger setup — is permission to deploy to Cloud Run.

### Why the trigger UI asks you to choose a service account

The Cloud Build trigger UI asks: "Which identity should Cloud Build run as when this trigger fires?" It only shows **user-managed** service accounts — the default Google-managed Cloud Build SA (`@cloudbuild.gserviceaccount.com`) does not appear in that dropdown.

The right approach is to create a dedicated service account for this trigger.

---

## Creating and Granting the Service Account

Run these commands in your terminal (verify your project first with `gcloud config get-value project`):

```bash
PROJECT_ID=gen-lang-client-0610398133
PROJECT_NUMBER=167678375363

# 1. Create the dedicated service account
gcloud iam service-accounts create cloudbuild-deployer \
  --display-name="Cloud Build Deployer" \
  --project=$PROJECT_ID

# 2. Grant permission to deploy to Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cloudbuild-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# 3. Grant permission to push/pull Docker images from Artifact Registry
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cloudbuild-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# 4. Grant permission to write Cloud Build logs
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cloudbuild-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# 5. Grant permission to read build source from Cloud Storage
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:cloudbuild-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

# 6. Allow it to act as the Compute runtime service account (required for Cloud Run deploy)
gcloud iam service-accounts add-iam-policy-binding \
  $PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --member="serviceAccount:cloudbuild-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT_ID
```

Select `2` (None) for any condition prompts that appear.

Once done, refresh the trigger creation page — `cloudbuild-deployer@gen-lang-client-0610398133.iam.gserviceaccount.com` will appear in the service account dropdown.

---

## Summary: What to Do

1. Run the six `gcloud` commands above to create the `cloudbuild-deployer` service account and grant it the necessary permissions
2. Add `cloudbuild.yaml` to the root of your repo (content in the section above)
3. Commit and push `cloudbuild.yaml` to `main`
4. Create the Cloud Build Trigger in the GCP console:
   - **Name:** `deploy-on-push-to-main`
   - **Event:** Push to a branch
   - **Branch:** `^main$`
   - **Service account:** `cloudbuild-deployer@gen-lang-client-0610398133.iam.gserviceaccount.com`
   - **Configuration:** Autodetected (`cloudbuild.yaml`)
5. Push any commit to `main` — Cloud Build fires automatically and deploys within ~5 minutes

After that, your workflow is permanently: `git push` and you're done.
