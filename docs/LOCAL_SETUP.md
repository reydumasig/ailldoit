# 🧭 Local Development Setup

## 1️⃣ Install Dependencies
From the project root, run:
```bash
npm install
```

---

## 2️⃣ Install Google Cloud CLI

If you don’t have the **Google Cloud SDK** installed, follow the instructions here:  
🔗 [Install the gcloud CLI](https://cloud.google.com/sdk/docs/install#mac)

---

## 3️⃣ Start the Development Servers

### 🖥️ Terminal 1 – Backend
Run:
```bash
npm run dev:server
```

### 💻 Terminal 2 – Frontend
Run:
```bash
npm run dev:client
```

## 4 Intialize Vertex AI

1. Log in to Google Cloud via browser and make sure your account has **“Vertex AI Administrator”** permissions in IAM.
2. Then run the following command:
   ```bash
   gcloud auth application-default login
   ```
3. Restart both the **server** and **client** terminals.


> 💡 **Tip:**  
> Whenever you modify the code, restart both services to ensure changes take effect.

---

## ⚙️ Error Troubleshooting

### ❌ Common Error
```
Model imagen-4.0-ultra-generate-001 failed: GaxiosError: {
  "error": "invalid_grant",
  "error_description": "reauth related error (invalid_rapt)"
}
```

### ✅ Cause
Your local Google Cloud credentials have expired or are not properly authorized for **Vertex AI**.

### 🔧 Fix

1. Log in to Google Cloud via browser and make sure your account has **“Vertex AI Administrator”** permissions in IAM.
2. Then run the following command:
   ```bash
   gcloud auth application-default login
   ```
3. Restart both the **server** and **client** terminals.

---
