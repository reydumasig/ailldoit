
* Go to root folder

  run:
  >> npm install

* Google Cloud CLI

  Install gcloud cli
  - https://docs.cloud.google.com/sdk/docs/install#mac

* Open terminal 1

  run:
  >> npm run dev:server

* Open terminal 2

  run:
  >> npm run dev:client

- * When you update code, restart both services on terminal


* Error Workarounds:

  ✅ Initialized Vertex AI client (Service Account)
  ❌ Model imagen-4.0-ultra-generate-001 failed: GaxiosError: 
  {
    "error":"invalid_grant",
    "error_description":
    "reauth related error (invalid_rapt)"
  }

  * - Fix: 
  
      - Login to google cloud in browser (make sure you have "Vertex AI Administrator" credentials in IAM), 
      then run:
      
      >> gcloud auth application-default login

      - restart all services in terminal