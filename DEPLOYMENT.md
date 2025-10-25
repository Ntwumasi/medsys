# Deployment Guide - Updated for Workflow System

This guide will help you deploy the complete MedSys EMR application with the new workflow system to production.

## Architecture

- **Frontend (Client)**: Deploy to Vercel
- **Backend (Server)**: Deploy to Render (using render.yaml blueprint)
- **Database**: PostgreSQL on Render (auto-configured)

---

## ⚡ FASTEST DEPLOYMENT (Recommended for Demo)

### Step 1: Deploy to Render (Backend + Database)

```bash
# 1. Commit all changes
git add .
git commit -m "Ready for production deployment"
git push origin main
```

1. Go to https://render.com and sign in with GitHub
2. Click "New" → "Blueprint"
3. Connect your GitHub repo: `medsys`
4. Render will detect `render.yaml` and automatically create:
   - ✅ PostgreSQL database (medsys-db)
   - ✅ Backend API (medsys-api)
5. Click "Apply" and wait 5-10 minutes

### Step 2: Run Database Migrations

Once deployed, click on your backend service → "Shell":
```bash
npm run db:setup
npx ts-node src/database/migration_workflow.ts
npx ts-node src/database/create_test_users.ts
npx ts-node src/database/create_test_patients.ts
```

**Save your backend URL** (e.g., `https://medsys-api-xxxx.onrender.com`)

### Step 3: Deploy Frontend to Vercel

Update the API URL:
```bash
# Edit client/.env.production
VITE_API_URL=https://medsys-api-xxxx.onrender.com/api
```

Deploy:
```bash
# Commit the change
git add client/.env.production
git commit -m "Update production API URL"
git push origin main

# Deploy to Vercel
npx vercel --prod
```

Or use Vercel Dashboard:
1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Vercel auto-detects settings from `vercel.json`
4. Add Environment Variable: `VITE_API_URL` = `https://medsys-api-xxxx.onrender.com/api`
5. Deploy!

### Step 4: Update CORS

Go to Render → Your Service → Environment → Add Variable:
- **Key**: `FRONTEND_URL`
- **Value**: `https://your-app.vercel.app` (your Vercel URL)

Save and it will auto-redeploy.

### Step 5: Test! 🎉

Go to your Vercel URL and login:
```
receptionist@clinic.com / demo123
nurse@clinic.com / demo123
doctor@clinic.com / demo123
```

---

## Option 1: Deploy Frontend to Vercel + Backend to Railway (Alternative)

### Step 1: Push to GitHub

```bash
# Create a new repository on GitHub (https://github.com/new)
# Then run these commands:

cd /Users/nokio/GitRepos/medsys
git remote add origin https://github.com/YOUR_USERNAME/medsys.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy Backend to Railway

1. Go to [Railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `medsys` repository
5. Railway will detect the monorepo structure
6. Add a PostgreSQL database:
   - Click "New" → "Database" → "Add PostgreSQL"
7. Configure the server service:
   - Root Directory: `server`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
8. Add environment variables in Railway:
   ```
   NODE_ENV=production
   JWT_SECRET=your-super-secret-production-key-change-this
   PORT=5000
   ```
9. Railway will automatically provide database credentials
10. Run the database setup (in Railway's terminal or locally connected to Railway DB):
    ```bash
    npm run db:setup
    ```
11. Copy your Railway backend URL (e.g., `https://your-app.railway.app`)

### Step 3: Deploy Frontend to Vercel

1. Go to [Vercel](https://vercel.com)
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your `medsys` GitHub repository
5. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Add Environment Variable:
   - `VITE_API_URL` = `https://your-railway-app.railway.app/api`
7. Click "Deploy"

### Step 4: Create Admin User

After deployment, create an admin user:

```bash
curl -X POST https://your-railway-app.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!",
    "role": "admin",
    "first_name": "Admin",
    "last_name": "User",
    "phone": "1234567890"
  }'
```

## Option 2: Deploy Everything to Render

### Step 1: Push to GitHub (same as above)

### Step 2: Create PostgreSQL Database on Render

1. Go to [Render](https://render.com)
2. Click "New" → "PostgreSQL"
3. Name it `medsys-db`
4. Choose a region close to your users
5. Copy the connection details

### Step 3: Deploy Backend to Render

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: medsys-api
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add environment variables:
   ```
   NODE_ENV=production
   DATABASE_URL=[from your Render PostgreSQL]
   JWT_SECRET=your-super-secret-production-key
   PORT=5000
   ```
5. Deploy and wait for it to complete
6. Run database setup using Render Shell or locally

### Step 4: Deploy Frontend to Render or Vercel

Follow the Vercel steps above, or deploy to Render as a static site.

## Option 3: Quick Demo Deploy (Frontend Only on Vercel)

If you want to quickly demo the frontend without backend:

1. Push to GitHub
2. Deploy to Vercel (client folder)
3. The app will show UI but API calls will fail

You can mock the API later or point to a local backend for development.

## Post-Deployment Checklist

- [ ] Database is created and tables are set up
- [ ] Admin user is created
- [ ] Environment variables are configured
- [ ] CORS is configured for your frontend domain
- [ ] API URL is correctly set in frontend environment
- [ ] Test login functionality
- [ ] Test patient registration
- [ ] Test appointment creation
- [ ] Set up database backups
- [ ] Configure monitoring (Sentry, LogRocket, etc.)

## Updating After Deployment

### Update Frontend
```bash
git add .
git commit -m "Update frontend"
git push origin main
# Vercel will auto-deploy
```

### Update Backend
```bash
git add .
git commit -m "Update backend"
git push origin main
# Railway/Render will auto-deploy
```

## Important Security Notes

1. **Change JWT_SECRET**: Use a long, random string for production
2. **Use HTTPS**: Both services provide HTTPS by default
3. **Secure Database**: Don't expose database credentials
4. **Environment Variables**: Never commit .env files
5. **CORS Configuration**: Update server to only allow your frontend domain

## Troubleshooting

### Frontend can't connect to backend
- Check VITE_API_URL environment variable
- Verify CORS settings on backend
- Check backend logs for errors

### Database connection errors
- Verify DATABASE_URL or individual DB credentials
- Check if database service is running
- Verify network access/firewall rules

### Build failures
- Check Node.js version compatibility
- Verify all dependencies are in package.json
- Check build logs for specific errors
