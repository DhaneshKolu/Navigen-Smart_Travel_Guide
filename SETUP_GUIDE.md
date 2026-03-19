# Smart Travel Guide - Setup & Deployment Guide

## Quick Start

### Total Setup Time: ~10-15 minutes

## Prerequisites

- **Node.js** 14+ and npm
- **Python** 3.8+
- **Docker** (optional, for containerized setup)
- **Git**

## Backend Setup

### Option 1: Direct Python Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the backend server
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend will be available at: `http://127.0.0.1:8000`

### Option 2: Docker Setup

```bash
cd backend

# Build the Docker image
docker build -t smart-travel-backend .

# Run the container
docker run -p 8000:8000 smart-travel-backend
```

### Backend Verification

Visit `http://127.0.0.1:8000/health` to verify the backend is running.

---

## Frontend Setup

### Installation

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

The frontend will open automatically at: `http://localhost:3000`

### Production Build

```bash
# Create optimized production build
npm run build

# Output will be in the 'build' folder
# Serve with any static server:
npx serve -s build
```

---

## Full Docker Compose Setup (Recommended)

For easiest deployment with both frontend and backend:

```bash
# From project root
docker-compose up --build

# This will:
# - Build backend Docker image
# - Start PostgreSQL database (if configured)
# - Start backend on port 8000
# - Start frontend on port 3000
```

Access the application at: `http://localhost:3000`

---

## Configuration

### Backend Configuration

Edit `backend/app/core/settings.py` to configure:
- Database URL
- CORS origins
- API base URL
- API keys (Geoapify, weather, routing)

Key settings:
```python
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]
API_HOST = "127.0.0.1"
API_PORT = 8000
```

### Required Environment Variables

Create `backend/.env` (or set environment variables in your deployment platform):

```env
SECRET_KEY=replace-with-strong-secret
DATABASE_URL=postgresql://user:password@localhost:5432/smart_travel
OPENWEATHER_API_KEY=your_openweather_key
ORS_API_KEY=your_openrouteservice_key
GEOAPIFY_API_KEY=your_geoapify_key
```

Optional Geoapify tuning:

```env
GEOAPIFY_TIMEOUT_SECONDS=10
GEOAPIFY_DEFAULT_RADIUS_METERS=5000
```

### Frontend Configuration

The frontend API URL is configured in `src/App.js`:
```javascript
const API = "http://127.0.0.1:8000";
```

For production, update this to your deployed backend URL.

---

## Application Workflow

### 1. Start Servers

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate  # or: source venv/bin/activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

### 2. Access Application

Open `http://localhost:3000` in your browser

### 3. User Flow

1. **Register** → Create account with email/password
2. **Login** → Access dashboard
3. **Create Trip** → Input destination, days, preferences
4. **Generate Plan** → AI agents process and create itinerary
5. **View Results** → See daily plans, recommendations, and agent decisions

---

## Testing the Application

### Manual Testing Checklist

- [ ] Registration with valid email
- [ ] Login/Logout functionality
- [ ] Create multiple trips
- [ ] View trips on dashboard
- [ ] Generate plan with different pace levels
- [ ] View generated itinerary details
- [ ] Regenerate plan with different settings

### Backend API Testing

Using curl or Postman:

```bash
# Health check
curl http://127.0.0.1:8000/health

# Register user
curl -X POST http://127.0.0.1:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://127.0.0.1:8000/auth/login \
  -d "username=test@example.com&password=password123"

# Create itinerary
curl -X POST http://127.0.0.1:8000/itineraries/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"user_id":1,"destination":"Paris","days":3}'

# Generate plan
curl -X POST http://127.0.0.1:8000/travel/1/generate_plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"pace":"moderate","user_lat":null,"user_lon":null,"radius_km":5.0}'

# Live places (Geoapify-backed; caches to DB)
curl -X POST http://127.0.0.1:8000/travel/places/search \
  -H "Content-Type: application/json" \
  -d '{"city":"Paris","categories":["restaurant","cafe","hotel"],"limit":40,"refresh":true}'

# Live hotels (Geoapify primary, OSM/Google fallback)
curl -X POST http://127.0.0.1:8000/travel/hotels/search \
  -H "Content-Type: application/json" \
  -d '{"city":"Paris","budget_per_night":120,"limit":10}'
```

---

## Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Windows
netstat -ano | findstr :8000

# macOS/Linux
lsof -i :8000

# Kill process and restart
```

**Database connection errors:**
- Ensure database is running (if using PostgreSQL)
- Check database URL in `settings.py`
- Verify database credentials

**Module import errors:**
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Frontend Issues

**npm install fails:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

**CORS errors:**
- Check backend CORS settings
- Ensure frontend URL is in `CORS_ORIGINS`
- Restart backend server

**API 404 errors:**
- Verify backend is running
- Check API URL in `App.js`
- Check network tab in browser DevTools

### Performance Issues

**Plan generation taking too long:**
- Plan generation can take 1-5 minutes
- Check backend logs for agent execution status
- Verify system has sufficient resources

**Frontend slow loading:**
- Clear browser cache
- Check browser console for errors
- Optimize images and assets
- Use production build for deployment

---

## Deployment to Production

### Using Vercel (Frontend)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Update API URL in App.js to production backend
```

### Using Heroku (Backend)

```bash
# Install Heroku CLI
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set CORS_ORIGINS="https://your-vercel-app.vercel.app"

# Deploy
git push heroku main
```

### Using AWS EC2 or DigitalOcean

1. **Setup server** with Node.js and Python
2. **Clone repository**
3. **Install dependencies**
4. **Configure environment variables**
5. **Run with PM2 or Supervisor** for process management
6. **Setup Nginx** as reverse proxy
7. **Enable HTTPS** with Let's Encrypt

---

## Environment Variables

### Backend (.env file)

```
DATABASE_URL=postgresql://user:password@localhost/smarttravel
CORS_ORIGINS=["http://localhost:3000"]
API_HOST=127.0.0.1
API_PORT=8000
ENVIRONMENT=development
```

### Frontend (.env file)

```
REACT_APP_API_URL=http://127.0.0.1:8000
REACT_APP_ENV=development
```

---

## Performance Optimization

### Frontend Optimization

- Code splitting with React Router
- Lazy loading of components
- Image optimization
- CSS minification
- Production build for deployment

### Backend Optimization

- Database indexing
- Caching with Redis (optional)
- Async operations with asyncio
- Database connection pooling

---

## Monitoring & Logging

### Backend Logs

Monitor real-time logs:
```bash
# With Uvicorn
python -m uvicorn app.main:app --reload --log-level debug

# Check specific logs
tail -f logs/app.log
```

### Frontend Debugging

- Use browser DevTools
- Check Network tab for API calls
- Monitor Console for errors
- Use React DevTools extension

---

## Maintenance

### Regular Updates

```bash
# Update backend dependencies
pip install --upgrade -r requirements.txt

# Update frontend dependencies
npm update
```

### Backup Database

```bash
# PostgreSQL backup
pg_dump database_name > backup.sql

# Restore
psql database_name < backup.sql
```

### Health Checks

Set up monitoring for:
- API endpoint availability
- Database connectivity
- Frontend asset loading
- Error rate monitoring

---

## Support & Documentation

- **Frontend Guide**: See `frontend/FRONTEND_GUIDE.md`
- **API Documentation**: Available at `http://localhost:8000/docs` (Swagger UI)
- **Backend Code**: See backend README and code comments

---

## Next Steps

1. ✅ Complete setup
2. ✅ Test all workflows
3. ✅ Configure production URLs
4. ✅ Deploy to production
5. ✅ Monitor application performance
6. ✅ Gather user feedback
7. ✅ Plan feature enhancements

---

**Happy deploying! 🚀**
