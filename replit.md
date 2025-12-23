# MedCode AI - Medical Coding Assistant

## Overview
MedCode AI is a mobile application that helps medical coders code patient records. The app uses the device camera to capture medical documents, de-identifies patient data for privacy, and uses AI to analyze the clinical information and suggest appropriate ICD-10 and CPT codes.

## Tech Stack
- **Frontend**: React Native with Expo SDK 54
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI GPT-4o Vision (via Replit AI Integrations)

## Project Structure
```
├── client/                 # Expo React Native app
│   ├── components/         # Reusable UI components
│   ├── constants/          # Theme and design tokens
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # API client and utilities
│   ├── navigation/         # React Navigation setup
│   └── screens/            # App screens
├── server/                 # Express.js backend
│   ├── replit_integrations/ # AI integration utilities
│   ├── db.ts               # Database connection
│   ├── routes.ts           # API endpoints
│   └── storage.ts          # Data access layer
├── shared/                 # Shared types and schemas
│   ├── models/             # Database models
│   └── schema.ts           # Drizzle schema definitions
└── assets/                 # Images and static assets
```

## Key Features
1. **Document Scanning**: Camera interface with document framing guides
2. **Privacy Protection**: De-identification display showing masked PHI fields
3. **AI Analysis**: Vision-based document analysis for medical coding
4. **Code Suggestions**: ICD-10 and CPT code recommendations with confidence scores
5. **Scan History**: Previous scans stored for reference

## Screens
- **ScanScreen**: Camera interface for capturing medical documents
- **ReviewScreen**: Preview captured image with de-identification overlay
- **ResultsScreen**: Display AI-suggested medical codes
- **HistoryScreen**: View previous scan results
- **SettingsScreen**: App preferences and configuration

## API Endpoints
- `POST /api/analyze`: Analyze a medical document image
- `GET /api/scans`: Get scan history
- `GET /api/scans/:id`: Get a specific scan result
- `DELETE /api/scans/:id`: Delete a scan

## Running the App
- **Development**: The app runs on port 8081 (Expo) and port 5000 (Express backend)
- **Testing on device**: Scan QR code from Replit URL bar to test in Expo Go

## Design Guidelines
The app follows iOS 26 liquid glass design principles with a professional healthcare color scheme. See `design_guidelines.md` for detailed specifications.

## Recent Changes
- Initial implementation of all screens and navigation
- Camera integration with expo-camera
- OpenAI Vision integration for document analysis
- PostgreSQL database for scan history storage
