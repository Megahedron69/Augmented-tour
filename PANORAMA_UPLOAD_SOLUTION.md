# Panorama Upload Solution - Design & Implementation Plan

## Current System Analysis

### What is `zind_data.json`?

`zind_data.json` is a **structured metadata file** from the ZInD (Zillow Indoor Dataset) that contains:

1. **Room metadata** for each panorama:
   - `label`: Room name (e.g., "living room", "dining room")
   - `image_path`: Path to the panorama image
   - `floor_number`: Which floor the room is on
   - `camera_height`: Height at which the 360° photo was taken
   - `ceiling_height`: Room ceiling height
   - `is_primary`: Whether this is the main view for a room
   - `is_inside`: Inside vs outside view

2. **Layout information**:
   - Room vertices (floor plan coordinates)
   - Door positions
   - Window positions
   - Openings

3. **Floor plan transformation data**:
   - Translation coordinates
   - Rotation angle
   - Scale factor

### How It's Currently Used

```typescript
// 1. Load the JSON file
const data = await loadZindData(); // Fetches /360Assets/zind_data.json

// 2. Parse it to extract panoramas
const panos = parseZindData(data); // Extracts all panorama metadata

// 3. Group by room
const rooms = groupPanosByRoom(panos); // Groups multiple panos per room

// 4. Display panoramas
// Each room can have multiple panoramas linked together
```

### How "Stitching" Works (Living Room → Dining Room)

**There is NO image stitching!** Instead:

1. **Hardcoded Navigation Markers** in `src/constants/roomMarkers.ts`:

   ```typescript
   "living room": {
     "dining room": [-41.98, -11.53, 24.46], // 3D coordinates on sphere
   }
   ```

2. **When you click the marker**:
   - It loads a completely different panorama image
   - The transition creates an illusion of movement
   - Each room is a separate 360° photo

3. **The coordinates `[-41.98, -11.53, 24.46]`** define:
   - Where on the living room sphere to place the "door" marker
   - These were **manually determined** by clicking in edit mode

---

## Scalable Solution: User-Friendly Panorama Upload System

### Architecture Overview

```
┌─────────────────┐
│  Upload UI      │
│  - Drag & Drop  │
│  - Room Info    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Processing Service             │
│  1. Upload images to cloud      │
│  2. Auto-detect room type (AI)  │
│  3. Generate thumbnails         │
│  4. Extract EXIF metadata       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Interactive Editor             │
│  1. View uploaded panoramas     │
│  2. Edit room labels            │
│  3. Set primary panorama        │
│  4. Place navigation markers    │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Auto-generate zind_data.json   │
│  Save to database/storage       │
└─────────────────────────────────┘
```

### Phase 1: Simple Upload System (No Backend)

#### 1.1 Create Upload Component

```typescript
// src/components/PanoramaUploader.tsx
interface UploadedPanorama {
  id: string;
  file: File;
  preview: string; // blob URL
  roomLabel: string;
  isPrimary: boolean;
  floorNumber: number;
  cameraHeight: number;
  ceilingHeight: number;
}
```

#### 1.2 Store in LocalStorage

```typescript
// src/utils/panoramaStorage.ts
export interface SimplifiedZindData {
  version: string;
  created: number;
  panoramas: {
    id: string;
    label: string;
    imagePath: string; // blob URL or cloud URL
    floorNumber: number;
    isPrimary: boolean;
    cameraHeight: number;
    ceilingHeight: number;
  }[];
  navigationLinks: {
    fromRoom: string;
    toRoom: string;
    position: [number, number, number];
  }[];
}
```

#### 1.3 UI/UX Flow

```
1. Upload Screen
   ┌──────────────────────────┐
   │  Drag & Drop Zone        │
   │  "Drop 360° Images Here" │
   │                          │
   │  [Browse Files]          │
   └──────────────────────────┘

2. Room Configuration (per image)
   ┌──────────────────────────────┐
   │ 🖼️ [Panorama Thumbnail]      │
   │                              │
   │ Room Name: [Living Room ▼]  │
   │ Floor: [1 ▼]                 │
   │ Primary View: [✓]            │
   │ Camera Height: [1.5m]        │
   │ Ceiling Height: [2.5m]       │
   │                              │
   │ [Remove] [View in 360°]      │
   └──────────────────────────────┘

3. Navigation Marker Setup
   ┌──────────────────────────────┐
   │ Current: Living Room         │
   │                              │
   │ [+ Add Navigation Link]      │
   │                              │
   │ Links:                       │
   │ • To: Dining Room            │
   │   📍 Click to set position   │
   │                              │
   │ • To: Hallway                │
   │   ✓ Position set             │
   └──────────────────────────────┘
```

### Phase 2: Cloud-Based Solution

#### 2.1 Backend Stack Options

**Option A: Firebase (Easiest)**

- Storage: Firebase Storage (panorama images)
- Database: Firestore (metadata)
- Auth: Firebase Auth (user management)
- Hosting: Firebase Hosting

**Option B: AWS**

- Storage: S3 (panorama images)
- Database: DynamoDB or RDS
- API: Lambda + API Gateway
- CDN: CloudFront

**Option C: Supabase (Open Source)**

- Storage: Supabase Storage
- Database: PostgreSQL
- Auth: Built-in
- Realtime: Built-in subscriptions

#### 2.2 Database Schema

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP
);

-- Projects table (one per house/property)
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Panoramas table
CREATE TABLE panoramas (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  room_label VARCHAR(100),
  image_url TEXT, -- S3/Storage URL
  thumbnail_url TEXT,
  floor_number INTEGER,
  is_primary BOOLEAN,
  camera_height FLOAT,
  ceiling_height FLOAT,
  metadata JSONB, -- Additional EXIF/custom data
  created_at TIMESTAMP
);

-- Navigation links table
CREATE TABLE navigation_links (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  from_room VARCHAR(100),
  to_room VARCHAR(100),
  position_x FLOAT,
  position_y FLOAT,
  position_z FLOAT,
  created_at TIMESTAMP
);

-- Components table (XR annotations)
CREATE TABLE room_components (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  room_label VARCHAR(100),
  component_type VARCHAR(50),
  position_x FLOAT,
  position_y FLOAT,
  position_z FLOAT,
  data JSONB,
  created_at TIMESTAMP
);
```

#### 2.3 API Endpoints

```
POST   /api/projects                    - Create new project
GET    /api/projects/:id               - Get project details
PUT    /api/projects/:id               - Update project

POST   /api/projects/:id/panoramas     - Upload panorama
GET    /api/projects/:id/panoramas     - List all panoramas
PUT    /api/panoramas/:id              - Update panorama metadata
DELETE /api/panoramas/:id              - Delete panorama

POST   /api/projects/:id/navigation    - Create navigation link
PUT    /api/navigation/:id             - Update link position
DELETE /api/navigation/:id             - Delete navigation link

GET    /api/projects/:id/export        - Export as zind_data.json
POST   /api/projects/:id/import        - Import zind_data.json
```

### Phase 3: Advanced Features

#### 3.1 AI-Powered Room Detection

```typescript
// Use TensorFlow.js or Cloud Vision API
async function detectRoomType(imageBlob: Blob): Promise<string> {
  // Option 1: Use pre-trained model
  const predictions = await model.classify(imageBlob);

  // Returns: "living room", "bedroom", "kitchen", etc.
  return predictions[0].className;
}
```

#### 3.2 Auto-Generate Navigation Links

```typescript
// Analyze panorama overlap using computer vision
async function suggestNavigationLinks(
  pano1: Panorama,
  pano2: Panorama,
): Promise<{
  similarity: number;
  suggestedPosition?: [number, number, number];
}> {
  // Compare image features
  // Detect common features (doors, doorways)
  // Suggest marker placement
}
```

#### 3.3 Collaborative Editing

- Real-time updates using WebSockets
- Multiple users can edit the same project
- Version history and rollback

#### 3.4 Mobile App

- Capture 360° photos directly in-app
- Auto-upload to cloud
- Guided room labeling

---

## Implementation Roadmap

### Week 1-2: Basic Upload UI

- [ ] Create PanoramaUploader component
- [ ] File drag-and-drop functionality
- [ ] Display uploaded panoramas
- [ ] Basic room metadata form

### Week 3-4: LocalStorage Integration

- [ ] Simplified zind_data.json generator
- [ ] Save/load from localStorage
- [ ] Edit existing panoramas
- [ ] Delete panoramas

### Week 5-6: Navigation Marker Editor

- [ ] Click-to-place markers in 360° view
- [ ] Visual line connecting rooms
- [ ] Save marker positions
- [ ] Test navigation flow

### Week 7-8: Cloud Backend (Firebase)

- [ ] Set up Firebase project
- [ ] Image upload to Firebase Storage
- [ ] Save metadata to Firestore
- [ ] User authentication

### Week 9-10: Polish & Features

- [ ] Thumbnail generation
- [ ] Export/import zind_data.json
- [ ] Shareable project links
- [ ] Mobile responsive design

### Week 11-12: Advanced Features

- [ ] AI room detection (optional)
- [ ] Bulk upload
- [ ] Project templates
- [ ] Analytics dashboard

---

## Quick Start Example (LocalStorage Version)

```typescript
// 1. User uploads files
const files = await uploadPanoramas();

// 2. Process each file
const panoramas = files.map((file) => ({
  id: crypto.randomUUID(),
  label: detectRoomName(file.name), // "living_room.jpg" → "Living Room"
  imagePath: URL.createObjectURL(file),
  floorNumber: 1,
  isPrimary: true,
  cameraHeight: 1.5,
  ceilingHeight: 2.5,
}));

// 3. Save to localStorage
const zindData = {
  version: "1.0",
  created: Date.now(),
  panoramas,
  navigationLinks: [],
};
localStorage.setItem("userPanoramas", JSON.stringify(zindData));

// 4. Load in VirtualTour
const loadUserData = () => {
  const data = localStorage.getItem("userPanoramas");
  return data ? JSON.parse(data) : null;
};
```

---

## Summary

### Current System

- ✅ Uses pre-built `zind_data.json` from ZInD dataset
- ✅ Hardcoded navigation markers
- ❌ No upload functionality
- ❌ Not user-friendly for custom panoramas

### Recommended Solution

1. **Start simple**: LocalStorage + drag-and-drop
2. **Scale up**: Firebase backend for cloud storage
3. **Add intelligence**: AI room detection, auto-linking
4. **Enhance UX**: Real-time collaboration, mobile app

Would you like me to start implementing any specific phase?
