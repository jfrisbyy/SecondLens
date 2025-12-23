# Medical Coding Assistant - Design Guidelines

## Architecture Decisions

### Authentication
**No authentication required.** This is a single-user utility tool focused on assisting medical coders in their workflow. Data is processed per-session without cloud sync requirements.

Include a **Settings screen** with:
- App preferences: theme toggle (light/professional mode), haptic feedback on/off
- Coding preferences: preferred code format display, confidence threshold slider
- Camera settings: auto-focus mode, flash default
- About section: app version, privacy notice, terms of use (placeholder)

### Navigation Structure
**Stack Navigation** with floating action button for core action.

The app follows a linear workflow optimized for quick document scanning:
1. **Home/Scan Screen** (root) - Camera interface
2. **Review Screen** - Image preview with de-identification overlay
3. **Results Screen** - Medical code suggestions
4. **History Screen** - Accessed via header button
5. **Settings Screen** - Accessed via header button

**No tab navigation** - the workflow is sequential and task-focused. Users start a new scan from the Home screen each time.

## Screen Specifications

### 1. Home/Scan Screen
**Purpose:** Capture medical documents with optimized camera interface

**Layout:**
- Header: Transparent with logo/title centered
  - Left button: None
  - Right button: Settings icon (gear)
- Main content: Full-screen camera view
  - Floating elements:
    - Document frame overlay (guides user to position document)
    - Bottom action bar with: Gallery button (left), Capture button (center, large), Flash toggle (right)
    - Top info banner: "Position document within frame" with subtle background
  - Safe area insets:
    - Top: insets.top + Spacing.xl
    - Bottom: insets.bottom + Spacing.xl

**Components:**
- expo-camera component (full screen)
- SVG corner guides for document framing
- Large circular capture button (72px diameter)
- Icon buttons for gallery access and flash

### 2. Review Screen
**Purpose:** Preview captured image, display de-identification overlay, confirm or retake

**Layout:**
- Header: Default navigation with "Review Document" title
  - Left button: Back arrow
  - Right button: None
- Main content: Scrollable
  - Image preview (full width, aspect ratio preserved)
  - De-identification info card showing masked fields (e.g., "3 patient identifiers masked")
  - Action buttons at bottom
  - Safe area insets:
    - Top: Spacing.xl
    - Bottom: insets.bottom + Spacing.xl

**Components:**
- Image component with pinch-to-zoom capability
- Info card with list of de-identified fields (names, DOB, MRN shown with redaction markers)
- Two buttons below image:
  - Secondary "Retake" (outline style)
  - Primary "Analyze Document" (solid fill)

### 3. Results Screen
**Purpose:** Display AI-suggested medical codes with confidence scores

**Layout:**
- Header: Default navigation with "Code Suggestions" title
  - Left button: Back arrow
  - Right button: Share icon
- Main content: Scrollable list
  - Success banner: "Analysis complete - 5 codes suggested"
  - Code cards (list of suggestions)
  - "Start New Scan" button at bottom
  - Safe area insets:
    - Top: Spacing.xl
    - Bottom: insets.bottom + Spacing.xl

**Components:**
- Card components for each code suggestion containing:
  - Code number (large, bold, e.g., "ICD-10: J44.1")
  - Code description (2 lines max)
  - Confidence badge (High/Medium/Low with color coding)
  - Expand icon to view full details
- List with subtle dividers between cards
- Floating "New Scan" button with drop shadow

### 4. History Screen (Modal)
**Purpose:** View previous scans and code suggestions

**Layout:**
- Header: Modal header with "Scan History" title
  - Left button: Close (X)
  - Right button: None
- Main content: List view
  - Each item shows: thumbnail, date/time, number of codes suggested
  - Tap to view full results
  - Safe area insets:
    - Top: Spacing.xl
    - Bottom: insets.bottom + Spacing.xl

**Components:**
- List items with left-aligned thumbnail, right-aligned metadata
- Empty state: "No scans yet" with illustration

### 5. Settings Screen
**Purpose:** Configure app preferences and view information

**Layout:**
- Header: Default navigation with "Settings" title
  - Left button: Back arrow
  - Right button: None
- Main content: Scrollable form/list
  - Grouped settings sections
  - Safe area insets:
    - Top: Spacing.xl
    - Bottom: insets.bottom + Spacing.xl

**Components:**
- Section headers with labels
- Toggle switches for boolean settings
- Slider for confidence threshold
- List items for navigation to sub-screens (About, Privacy)

## Design System

### Color Palette
**Primary Colors:**
- Primary Blue: #2563EB (trustworthy, professional healthcare color)
- Primary Dark: #1E40AF
- Primary Light: #DBEAFE

**Confidence Level Colors:**
- High Confidence: #10B981 (green)
- Medium Confidence: #F59E0B (amber)
- Low Confidence: #EF4444 (red)

**Neutral Palette:**
- Text Primary: #111827
- Text Secondary: #6B7280
- Background: #FFFFFF
- Surface: #F9FAFB
- Border: #E5E7EB

**Semantic Colors:**
- Success: #10B981
- Warning: #F59E0B
- Error: #EF4444
- Info: #3B82F6

### Typography
**Font Family:** System default (SF Pro for iOS, Roboto for Android)

**Type Scale:**
- Heading 1: 28px, bold, letter-spacing -0.5px (screen titles)
- Heading 2: 22px, semibold (section headers)
- Heading 3: 18px, semibold (card titles, code numbers)
- Body Large: 16px, regular, line-height 24px (primary content)
- Body: 14px, regular, line-height 20px (descriptions)
- Caption: 12px, medium, letter-spacing 0.3px (metadata, labels)

**Medical Code Display:**
- Code numbers: Monospace font at 20px, bold
- Code descriptions: Body Large, regular weight

### Spacing System
- xs: 4px
- sm: 8px
- md: 12px
- lg: 16px
- xl: 24px
- 2xl: 32px
- 3xl: 48px

### Visual Design

**Icons:**
- Use Feather icons from @expo/vector-icons for all UI actions
- Camera: camera icon
- Settings: settings icon
- Flash: zap icon
- Gallery: image icon
- Share: share-2 icon
- History: clock icon
- Expand: chevron-down icon

**Interaction Feedback:**
- All buttons show opacity 0.7 when pressed
- Primary buttons: solid background with subtle scale animation (0.98) on press
- Secondary buttons: border + text with opacity feedback on press
- Cards: subtle elevation on press (scale to 0.99)
- Toggle switches: smooth slide animation with haptic feedback

**Floating Action Button (Capture):**
- Size: 72px diameter
- Background: Primary Blue with white border (4px)
- Icon: camera in white
- Drop shadow specifications:
  - shadowOffset: {width: 0, height: 2}
  - shadowOpacity: 0.10
  - shadowRadius: 2

**"New Scan" Floating Button:**
- Background: Primary Blue
- Text: White, semibold
- Padding: 16px horizontal, 12px vertical
- Border radius: 24px (pill shape)
- Drop shadow specifications:
  - shadowOffset: {width: 0, height: 2}
  - shadowOpacity: 0.10
  - shadowRadius: 2

**Cards & Surfaces:**
- Border radius: 12px
- Border: 1px solid Border color
- Background: White
- Padding: lg (16px)
- NO drop shadows on cards - use borders for definition

**Document Frame Overlay:**
- 4 corner brackets (SVG) in Primary Blue
- Semi-transparent background outside frame area (black at 0.3 opacity)
- Frame aspect ratio: 3:4 (optimized for documents)

### Accessibility Requirements

**Critical for Healthcare Apps:**
- Minimum touch target: 44x44px for all interactive elements
- Text contrast ratio: Minimum 4.5:1 for body text, 3:1 for large text
- Support for iOS Dynamic Type (font scaling)
- VoiceOver labels for all actionable elements
- Camera permission handling with clear explanation: "Access camera to scan medical documents"
- Loading states with clear messaging during AI analysis
- Error states with actionable guidance (e.g., "Document unclear - please retake with better lighting")

**Code Display Accessibility:**
- Code numbers must be screen-reader friendly (read digit by digit)
- Confidence levels communicated via text, not just color
- Tap targets on code cards minimum 60px height

### Assets Required

**Critical Assets:**
1. **Document Frame Corners** (4 SVG brackets in Primary Blue)
2. **Empty State Illustration** for History screen (simple line art showing clipboard with checkmark)
3. **Loading Animation** for analysis phase (medical cross pulsing or subtle spinner)
4. **App Icon** featuring a stylized medical document with code symbols

**DO NOT include:**
- Generic medical imagery (stethoscopes, heartbeats, etc.)
- Stock photos
- Emojis
- Decorative illustrations on main workflow screens

The design prioritizes **clarity, speed, and trust** - essential for healthcare professionals working under time pressure. Every element serves the core workflow of scan → analyze → code.