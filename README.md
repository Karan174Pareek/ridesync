# RideSync 🏍️

**RideSync** is an advanced real-time squad synchronization and telemetry dashboard for motorcyclists. Designed to keep riders connected, it overlays live location tracking, path routing, and emergency indicators onto a tactical digital map grid.

---

## Key Features

### 📍 Live Tactical Map Grid
- Responsive map rendering powered by **Leaflet** and CartoDB base maps.
- Renders yourself and squad companion markers in real-time.

### 🧭 Telemetry Dashboard
- Live tracking of **Velocity** (KM/H), **Heading** (compass direction), and **Altitude** (elevation).
- Real-time battery status and signal indicators.

### 🗺️ Dynamic Routing
- Searches for targets and destinations using **OSRM (Open Source Routing Machine)**.
- Renders routing paths with visual path-glow overlays instantly.

### 🤖 Tactical Simulation Hub
- Floating command widget on the map (accessible via the CPU button).
- **Patrol Simulator**: Animates rider markers along the active route.
- **Formation Sync**: Simulates up to 3 companion riders (`VALKYRIE`, `GHOST_RIDER`, `INTERCEPTOR`) trailing in staggered formation.
- **Emergency Drills**: A button to simulate a teammate SOS distress signal, triggering the Mayday warning overlay.

### 🚨 Mayday / SOS Beacons
- Deploys emergency location coordinates to all connected squad riders with a visual full-screen override.
- Allows team members to instantly "intervene" and fly to the distress location.

---

## Tech Stack
- **Frontend**: Next.js, React, Framer Motion, Tailwind CSS, Lucide Icons, Leaflet
- **Backend**: Node.js, Express, Socket.io
- **Database / Auth**: Firebase (Auth, Firestore)

---

## Running Locally

### Prerequisites
- **Node.js** (v18+)

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up environment variables by copying `.env.example` to `.env.local` and filling in variables:
   ```bash
   cp .env.example .env.local
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the dashboard at [http://localhost:3000](http://localhost:3000).
