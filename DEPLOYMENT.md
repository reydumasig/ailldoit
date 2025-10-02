# Ailldoit Google Cloud Deployment Guide

This document provides instructions for deploying the Ailldoit application to Google Cloud Run using the provided automation script.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Process](#deployment-process)
- [Configuration](#configuration)
- [Verifying the Deployment](#verifying-the-deployment)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1.  **Google Cloud Project**: A Google Cloud project with the ID `ailldoit-6d0e0`.
2.  **gcloud CLI**: The Google Cloud CLI must be installed and authenticated. Run `gcloud auth login` and `gcloud auth application-default login`.
3.  **Permissions**: Your user account must have sufficient permissions to manage IAM policies, Cloud Build, Artifact Registry, and Cloud Run (e.g., `Owner` or `Editor` roles).
4.  **Secrets**: All required secrets must be created in Google Secret Manager. The deployment script and `cloudbuild.yaml` reference these secrets by name.

### Required Secrets

The following secrets must exist in Secret Manager for the build and deployment to succeed:

**Build-time Secrets:**
- `DOCKER_HUB_USERNAME`: Your Docker Hub username.
- `DOCKER_HUB_PASSWORD`: A Docker Hub **Personal Access Token** (not your password).
- `VITE_FIREBASE_*`: All Firebase keys required by the frontend.
- `VITE_STRIPE_*`: All Stripe keys required by the frontend.

**Run-time Secrets (for Cloud Run):**
- `DATABASE_URL`
- `FIREBASE_*` (server-side keys)
- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `REPLICATE_API_TOKEN`
- `SESSION_SECRET`
- ...and any other secrets referenced in the `gcloud run deploy` command.

## Deployment Process

The deployment is fully automated via the `deploy-staging.sh` script. This script handles everything from setting up permissions to building the container and deploying it to Cloud Run.

**To deploy the staging environment, simply run:**

```bash
./deploy-staging.sh
```

### What the Script Does

1.  **Sets Project**: Configures `gcloud` to use the `ailldoit-6d0e0` project.
2.  **Enables APIs**: Ensures `cloudbuild.googleapis.com`, `run.googleapis.com`, and `artifactregistry.googleapis.com` are enabled.
3.  **Configures IAM Permissions**: Idempotently grants the Cloud Build service account the necessary roles to access secrets, push to Artifact Registry, and act as a builder.
4.  **Creates Artifact Registry**: Ensures a Docker repository exists to store the container image.
5.  **Submits Build**: Kicks off a Google Cloud Build process using `cloudbuild.yaml`. This build:
    - Logs into Docker Hub to avoid rate limits.
    - Builds the Docker image, injecting build-time secrets.
    - Pushes the final image to Artifact Registry.
6.  **Deploys to Cloud Run**: Deploys the newly built image as a new revision of the `ailldoit-staging` service, securely mounting all required run-time secrets.

## Verifying the Deployment

1.  **Monitor Build Logs**: The script will stream logs from Cloud Build. Watch for any errors.
2.  **Check Cloud Run URL**: Once the script completes, it will print the URL of the deployed service.
    ```
    ✅ Deployment completed successfully!
    🌐 Your staging app is available at:
    https://ailldoit-staging-opcatz6zya-uc.a.run.app
    ```
3.  **Review Service Logs**: If the application doesn't start correctly, check the logs in the Google Cloud console:
    - Navigate to **Cloud Run**.
    - Click on the `ailldoit-staging` service.
    - Go to the **Logs** tab.

## Troubleshooting

### Build Failure: `401 Unauthorized` from Docker Hub

- **Cause**: The `DOCKER_HUB_PASSWORD` secret in Secret Manager is incorrect or is a password instead of a Personal Access Token (PAT).
- **Solution**:
    1.  Generate a new **Read-only** PAT from your Docker Hub security settings.
    2.  Update the `DOCKER_HUB_PASSWORD` secret in Google Secret Manager with the new token.
    3.  Re-run the deployment script.

### Build Failure: Permission Denied for Secret Manager

- **Cause**: The Cloud Build service account (`<project-number>@cloudbuild.gserviceaccount.com`) does not have the `Secret Manager Secret Accessor` role.
- **Solution**: The `deploy-staging.sh` script should handle this automatically. If it fails, you can grant it manually via the IAM page in the Google Cloud console.

### Cloud Run Deployment Fails to Start

- **Cause**: Often due to a missing run-time secret or an application error on startup.
- **Solution**: Check the Cloud Run service logs for crash information. A common issue is the application trying to access an environment variable that wasn't mounted as a secret in the `gcloud run deploy` command.