# Chronify Project - Setup & Troubleshooting Guide

## 🔍 Issues Found & Fixes Applied

### ✅ Issues Fixed
1. **Fixed: Corrupted .env file** - Removed garbage text at the end ("pull ")
2. **Created: .env.example** - Complete template for environment variables

### ⚠️ Issues to Address

#### 1. Security Concerns
- **JWT_SECRET is too weak** ("supersecret")
  - Should be 32+ random characters
  - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  
- **Exposed Credentials**
  - MongoDB and API keys are in git history (as noted in previous fixes)
  - Need to rotate credentials immediately in production

#### 2. Missing Environment Configuration
- **Frontend .env missing**
  - If backend is not on `http://localhost:5000`, create `frontend/.env.local`:
    ```
    NEXT_PUBLIC_API_BASE_URL=http://your-backend-url:5000/api/v1
    ```

#### 3. Why Goals/Tasks May Not Be Showing

**Most Likely Causes:**

a) **No data in database** (Most Common)
   - User hasn't created any goals/tasks yet
   - Solution: Create a goal or task through the UI
   
b) **Backend not running**
   - Check if `http://localhost:5000/health` returns `{ "status": "ok" }`
   - To start: `cd backend && node server.js` (or use nodemon)

c) **Database connection issue**
   - MongoDB credentials might be invalid/rotated
   - Check backend console for connection errors
   - Test connection string in MongoDB Atlas

d) **Authentication issue**
   - User token might be invalid or expired
   - Clear browser localStorage and re-login
   - Check browser DevTools > Application > Local Storage

---

## 🚀 Setup Instructions

### Backend Setup
```bash
cd backend

# Verify .env file has valid configuration
cat .env

# Install dependencies
npm install

# Start server (development with auto-reload)
npx nodemon server.js

# Or start with node
node server.js

# Test API health
curl http://localhost:5000/health
```

### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Frontend will run on http://localhost:3000
```

### Database Verification
```bash
# Check if MongoDB connection is working:
# 1. Backend logs should show "✅ MongoDB connected"
# 2. Try creating a goal through the UI
# 3. Check MongoDB Atlas Console for new data
```

---

## 🧪 Testing Goals/Tasks Endpoints

### Create a Goal (via API)
```bash
curl -X POST http://localhost:5000/api/v1/goals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Goal",
    "description": "A test goal",
    "deadline": "2026-04-01T00:00:00Z",
    "dailyAvailableHours": 2,
    "tags": ["test"]
  }'
```

### List All Goals (via API)
```bash
curl http://localhost:5000/api/v1/goals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create a Task (via API)
```bash
curl -X POST http://localhost:5000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Task",
    "description": "A test task",
    "startTime": "2026-03-19T09:00:00Z",
    "endTime": "2026-03-19T10:00:00Z",
    "source": "manual"
  }'
```

### List All Tasks (via API)
```bash
curl "http://localhost:5000/api/v1/tasks" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ✅ Verification Checklist

- [ ] Backend running (check `http://localhost:5000/health`)
- [ ] Frontend running (check `http://localhost:3000`)
- [ ] MongoDB connection successful (check backend logs)
- [ ] User logged in (check localStorage for token)
- [ ] At least one goal exists (create via UI or API)
- [ ] At least one task exists for today (create via UI or API)
- [ ] Dashboard shows goals and tasks

---

## 🐛 Troubleshooting

### Backend Won't Start
```
Error: MONGO_URI is not defined
→ Solution: Add MONGO_URI to .env file
```

```
Error: JWT secret is not configured
→ Solution: Add JWT_SECRET to .env file
```

### Goals/Tasks Not Showing
1. Check browser console for errors (F12 > Console)
2. Check if Backend API is responding:
   ```bash
   curl http://localhost:5000/api/v1/goals \
     -H "Authorization: Bearer $(YOUR_TOKEN)"
   ```
3. Check MongoDB Atlas for data
4. Clear localStorage and re-login:
   ```javascript
   localStorage.clear()
   location.reload()
   ```

### CORS Errors
- Backend already has `cors()` enabled in server.js
- If still getting CORS errors, make sure frontend URL matches allowed origins

---

## 📊 Current Configuration

**Backend:**
- Port: 5000
- Database: MongoDB Atlas
- Authentication: JWT (7 days expiration)

**Frontend:**
- Port: 3000
- Language: TypeScript + React
- Build Tool: Next.js

---

## 🔐 Security Best Practices

1. **Never commit .env files to git**
   - .gitignore already configured
   - Use .env.example as template

2. **Rotate exposed credentials immediately:**
   - Change MongoDB password
   - Regenerate OpenAI API key
   - Set new JWT_SECRET

3. **Use environment variables for all secrets:**
   - All sensitive data in .env
   - Never hardcode in source code

---

## 📞 Next Steps

1. Ensure both backend and frontend are running
2. Create at least one goal through the UI
3. Create at least one task for today
4. Verify they appear on the dashboard
5. If still not working, check backend logs for errors

