# Smart Travel Guide Frontend - User Guide

## Overview

The Smart Travel Guide frontend is a React-based web application that enables users to generate personalized travel itineraries using AI agents. The application follows the complete workflow from user registration to itinerary generation.

## Workflow

### 1. **User Registration**
- Navigate to `/register`
- Enter email and password
- Confirm password
- Click "Register"
- System validates and creates account
- User is automatically logged in after registration

### 2. **User Login**
- Navigate to `/login`
- Enter email and password
- Click "Login"
- Token is stored in localStorage

### 3. **Dashboard**
- View all your trips
- See trip details (destination, number of days)
- Create a new trip
- Click "Generate Plan" on existing trips

### 4. **Create Trip**
- Click "Create New Trip" from dashboard
- Fill in trip details:
  - **Destination** (required): Where you want to go
  - **Number of Days** (required): 1-30 days
  - **Travel Pace**: Relaxed, Moderate, or Fast
  - **Budget Level**: Budget, Moderate, or Luxury
- Click "Create Trip & Generate Plan"
- System creates the itinerary and redirects to plan generation

### 5. **Generate Itinerary**
- Select your preferred travel pace:
  - 🚶 **Relaxed**: More free time, fewer activities per day
  - 🚴 **Moderate**: Balanced activities and free time (recommended)
  - 🏃 **Fast**: Packed schedule with many activities
- Click "Generate Itinerary"
- System processes through AI agents:
  - 🌦️ Weather Agent - Checks climate and forecasts
  - 🍽️ Cuisine Agent - Finds local restaurants
  - 🏨 Hotel Agent - Recommends accommodations
  - 🗺️ Route Agent - Plans optimal routes
  - 📅 Day Planner - Creates daily schedules
  - ⭐ Evaluator - Ensures quality recommendations

### 6. **View Generated Plan**
- **Daily Itinerary**: Day-by-day breakdown of activities
- **Weather Forecast**: Expected weather conditions
- **AI Agent Decisions**: See which agents made which recommendations with confidence scores
- **Routes & Navigation**: Optimal routes between locations

## Features

### User Authentication
- Email-based registration and login
- Secure token-based authentication
- Automatic logout on token expiration
- Session persistence using localStorage

### Trip Management
- Create unlimited trips
- View all your past trips
- Generate new itineraries for existing trips
- Regenerate plans with different pace settings

### Responsive Design
- Works on desktop, tablet, and mobile devices
- Beautiful gradient backgrounds
- Intuitive navigation
- Smooth animations and transitions

## Technical Features

### Frontend Stack
- **React 19.2.4** - UI Framework
- **React Router v6** - Navigation
- **Axios** - HTTP Client
- **CSS3** - Styling with gradients and animations

### Security
- Tokens stored in localStorage
- Authorization header automatically attached to API requests
- Protected routes redirecting to login when needed

### UI/UX
- Loading states with spinner animations
- Error messages with helpful feedback
- Success confirmations
- Responsive grid layouts for trip cards and daily plans

## Getting Started

### Prerequisites
- Node.js 14+ and npm
- Backend API running at `http://127.0.0.1:8000`

### Installation

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000`

## API Endpoints Used

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user

### Itineraries
- `GET /itineraries` - Get all itineraries
- `GET /itineraries/:id` - Get specific itinerary
- `POST /itineraries/` - Create new itinerary

### Plans
- `POST /travel/:itinerary_id/generate_plan` - Generate travel plan

## File Structure

```
frontend/src/
├── App.js                 # Main application routing
├── App.css               # Global styles
├── index.js              # Entry point
├── index.css             # Global styles
├── pages/
│   ├── Register.js       # Registration page
│   ├── Login.js          # Login page
│   ├── Dashboard.js      # User dashboard
│   ├── TravelForm.js     # Trip creation form
│   ├── PlanDisplay.js    # Plan display page
├── styles/
│   ├── Auth.css          # Auth pages styling
│   ├── Dashboard.css     # Dashboard styling
│   ├── TravelForm.css    # Form styling
│   ├── PlanDisplay.css   # Plan display styling
```

## Troubleshooting

### Backend Connection Issues
- Ensure backend is running on `http://127.0.0.1:8000`
- Check CORS settings in backend
- Verify network connectivity

### Login Issues
- Check if user exists in database
- Verify password is correct
- Clear localStorage and try again

### Plan Generation Timeout
- Plan generation can take several minutes (1-5 min)
- Wait for the generation to complete
- Check browser console for errors

### Styling Issues
- Clear browser cache
- Hard refresh (Ctrl+F5 or Cmd+Shift+R)
- Check if CSS files are properly imported

## Future Enhancements

- User profile page
- Trip editing and deletion
- Plan rating and feedback
- Export itinerary as PDF
- Map visualization of routes
- Social sharing of plans
- Real-time notifications
- Multi-language support

## Support

For issues or questions, check:
1. Browser console for errors
2. Backend API logs
3. Network tab in developer tools
4. This guide for common issues

---

**Enjoy planning your next adventure with AI-powered recommendations! 🌍✈️**
