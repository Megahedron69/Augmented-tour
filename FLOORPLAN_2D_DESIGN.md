# Dynamic 2D Floor Plan - Design & Implementation Guide

## Overview

Create an interactive 2D map showing:

- ✅ All rooms in the virtual tour
- ✅ Navigation links between rooms
- ✅ Component count indicators
- ✅ Current room highlight
- ✅ Click to navigate

---

## Data Sources Available

### 1. Navigation Links (`roomMarkers.ts`)

```typescript
{
  "living room": {
    "dining room": [-41.98, -11.53, 24.46],
    "hallway": [-31.15, -7.27, -38.41]
  },
  "dining room": {
    "kitchen": [49.76, -4.04, -1.32],
    // ...
  }
}
```

**Use**: Graph connectivity, know which rooms connect

### 2. ZInD Data (`zind_data.json`)

```json
{
  "floor_plan_transformation": {
    "translation": [1.109, -1.036],
    "rotation": 179.72,
    "scale": 0.404
  },
  "layout_raw": {
    "vertices": [[1.48, -1.09], [1.47, 1.38], ...]
  }
}
```

**Use**: Actual room shapes and spatial positions

### 3. Component Storage (`localStorage`)

```typescript
{
  "living room": [/* array of components */],
  "kitchen": [/* array of components */]
}
```

**Use**: Show component count per room

### 4. Navigation Markers Storage

```typescript
{
  "living room": [/* custom navigation markers */]
}
```

**Use**: User-created navigation links

---

## Recommended Approach: **Multi-Level Implementation**

### Level 1: Graph-Based Layout (Quick Start) ⭐ **START HERE**

**Pros:**

- ✅ Fast to implement (1-2 days)
- ✅ Works with current data structure
- ✅ Auto-arranges rooms nicely
- ✅ Handles any number of rooms
- ✅ No coordinate calculations needed

**Cons:**

- ❌ Not spatially accurate
- ❌ Doesn't show real room shapes

**Tech Stack:**

- React Flow (easiest) or D3.js force graph
- SVG for rendering
- Auto-layout algorithm

```tsx
┌─────────────────────────────────────────┐
│  2D Floor Plan - Graph View             │
├─────────────────────────────────────────┤
│                                         │
│         ┌──────────┐                    │
│         │ Bedroom  │                    │
│         │    🏷️ 2   │                    │
│         └────┬─────┘                    │
│              │                          │
│         ┌────┴─────┐                    │
│         │ Hallway  │                    │
│    ┌────┤    🏷️ 0   ├────┐              │
│    │    └──────────┘    │              │
│┌───┴────┐          ┌────┴────┐         │
││Kitchen │          │Bathroom │         │
││  🏷️ 3   │          │   🏷️ 1  │         │
│└───┬────┘          └─────────┘         │
│    │                                   │
│┌───┴────────┐     ┌──────────┐        │
││Dining Room │─────│Living Room│◄─YOU  │
││    🏷️ 5     │     │    🏷️ 4   │        │
│└────────────┘     └──────────┘        │
│                                        │
│ Legend: 🏷️ = Components count          │
└────────────────────────────────────────┘
```

### Level 2: Spatial Layout from ZInD Data (Advanced)

**Pros:**

- ✅ Shows actual room positions
- ✅ Accurate spatial relationships
- ✅ Can show room shapes

**Cons:**

- ❌ Complex coordinate transformations
- ❌ Need to merge multiple partial rooms
- ❌ Takes more time to implement

**Process:**

1. Extract `floor_plan_transformation` from each panorama
2. Apply translation, rotation, scale to vertices
3. Render as SVG polygons
4. Handle overlapping rooms

### Level 3: Hybrid Approach (Best Long-term)

Combine both:

1. Use graph layout as fallback
2. If ZInD data available, use spatial coordinates
3. Smooth transition between modes

---

## Implementation Plan

## 🚀 PHASE 1: Graph-Based Floor Plan (Implement First)

### Step 1: Create Floor Plan Component

```tsx
// src/components/FloorPlan2D.tsx
import React, { useMemo } from "react";
import type { RoomGroup } from "../utils/zindDataParser";
import { ROOM_MARKERS } from "../constants/roomMarkers";
import { loadRoomComponents } from "../utils/componentStorage";
import { loadNavigationMarkers } from "../utils/navigationMarkerStorage";

interface FloorPlan2DProps {
  roomGroups: RoomGroup[];
  currentRoom: string;
  onRoomClick: (roomLabel: string) => void;
}

interface RoomNode {
  id: string;
  label: string;
  x: number;
  y: number;
  componentCount: number;
  markerCount: number;
  isCurrentRoom: boolean;
}

interface Connection {
  from: string;
  to: string;
}
```

### Step 2: Build Graph Data Structure

```typescript
const buildGraphData = (roomGroups: RoomGroup[], currentRoom: string) => {
  // 1. Create nodes from rooms
  const nodes: RoomNode[] = roomGroups.map((room) => {
    const components = loadRoomComponents()[room.label.toLowerCase()] || [];
    const markers = loadNavigationMarkers()[room.label.toLowerCase()] || [];

    return {
      id: room.label.toLowerCase(),
      label: room.label,
      x: 0, // Will be calculated
      y: 0,
      componentCount: components.length,
      markerCount: markers.length,
      isCurrentRoom: room.label.toLowerCase() === currentRoom.toLowerCase(),
    };
  });

  // 2. Create edges from navigation markers
  const connections: Connection[] = [];
  Object.entries(ROOM_MARKERS).forEach(([fromRoom, destinations]) => {
    Object.keys(destinations).forEach((toRoom) => {
      connections.push({
        from: fromRoom.toLowerCase(),
        to: toRoom.toLowerCase(),
      });
    });
  });

  // 3. Apply force-directed layout (simplified)
  const positioned = applyForceLayout(nodes, connections);

  return { nodes: positioned, connections };
};
```

### Step 3: Force Layout Algorithm (Simplified)

```typescript
// Simple force-directed layout
const applyForceLayout = (
  nodes: RoomNode[],
  connections: Connection[],
): RoomNode[] => {
  const width = 800;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;

  // Initialize with random positions
  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const radius = 200;
    node.x = centerX + radius * Math.cos(angle);
    node.y = centerY + radius * Math.sin(angle);
  });

  // Run simulation (simplified - use D3 or similar for production)
  for (let iteration = 0; iteration < 100; iteration++) {
    // Repulsion between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 150) {
          const force = (150 - dist) / dist;
          nodes[i].x -= dx * force * 0.1;
          nodes[i].y -= dy * force * 0.1;
          nodes[j].x += dx * force * 0.1;
          nodes[j].y += dy * force * 0.1;
        }
      }
    }

    // Attraction along connections
    connections.forEach((conn) => {
      const from = nodes.find((n) => n.id === conn.from);
      const to = nodes.find((n) => n.id === conn.to);

      if (from && to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = (dist - 120) / dist;

        from.x += dx * force * 0.05;
        from.y += dy * force * 0.05;
        to.x -= dx * force * 0.05;
        to.y -= dy * force * 0.05;
      }
    });
  }

  return nodes;
};
```

### Step 4: SVG Rendering

```tsx
export const FloorPlan2D: React.FC<FloorPlan2DProps> = ({
  roomGroups,
  currentRoom,
  onRoomClick,
}) => {
  const { nodes, connections } = useMemo(
    () => buildGraphData(roomGroups, currentRoom),
    [roomGroups, currentRoom],
  );

  return (
    <div className="floor-plan-2d">
      <svg width="800" height="600" viewBox="0 0 800 600">
        {/* Grid background */}
        <defs>
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#e0e0e0"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="800" height="600" fill="url(#grid)" />

        {/* Connection lines */}
        {connections.map((conn, i) => {
          const from = nodes.find((n) => n.id === conn.from);
          const to = nodes.find((n) => n.id === conn.to);
          if (!from || !to) return null;

          return (
            <line
              key={`conn-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#00d9ff"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.3"
            />
          );
        })}

        {/* Room nodes */}
        {nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => onRoomClick(node.label)}
            style={{ cursor: "pointer" }}
            className="room-node"
          >
            {/* Node circle */}
            <circle
              r="50"
              fill={node.isCurrentRoom ? "#00d9ff" : "#1a1a2e"}
              stroke={node.isCurrentRoom ? "#00ffee" : "#00d9ff"}
              strokeWidth={node.isCurrentRoom ? 3 : 2}
              className="room-circle"
            />

            {/* Room label */}
            <text
              y="-5"
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight={node.isCurrentRoom ? "bold" : "normal"}
            >
              {node.label}
            </text>

            {/* Component count badge */}
            {node.componentCount > 0 && (
              <g transform="translate(25, -25)">
                <circle r="12" fill="#ff6b6b" />
                <text textAnchor="middle" y="4" fill="white" fontSize="10">
                  {node.componentCount}
                </text>
              </g>
            )}

            {/* Navigation marker count */}
            {node.markerCount > 0 && (
              <text y="15" textAnchor="middle" fill="#00ffee" fontSize="11">
                🧭 {node.markerCount}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="floor-plan-legend">
        <div className="legend-item">
          <div className="legend-badge" style={{ background: "#ff6b6b" }}></div>
          <span>XR Components</span>
        </div>
        <div className="legend-item">
          <span>🧭</span>
          <span>Navigation Markers</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>Connected Rooms</span>
        </div>
      </div>
    </div>
  );
};
```

### Step 5: CSS Styling

```css
/* src/components/FloorPlan2D.css */
.floor-plan-2d {
  width: 100%;
  height: 100vh;
  background: #0f0f1e;
  position: relative;
  overflow: hidden;
}

.floor-plan-2d svg {
  width: 100%;
  height: 100%;
}

.room-node {
  transition: transform 0.2s ease;
}

.room-node:hover {
  transform: scale(1.1);
}

.room-node:hover .room-circle {
  filter: drop-shadow(0 0 10px rgba(0, 217, 255, 0.6));
}

.floor-plan-legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(26, 26, 46, 0.9);
  border: 1px solid #00d9ff;
  border-radius: 8px;
  padding: 16px;
  backdrop-filter: blur(10px);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: white;
  font-size: 13px;
}

.legend-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.legend-line {
  width: 30px;
  height: 2px;
  background: #00d9ff;
}

/* Minimap version */
.floor-plan-minimap {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 250px;
  height: 180px;
  background: rgba(15, 15, 30, 0.95);
  border: 2px solid #00d9ff;
  border-radius: 12px;
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.floor-plan-minimap svg {
  width: 100%;
  height: 100%;
}

.floor-plan-minimap .room-node text {
  font-size: 8px;
}

.floor-plan-minimap .room-circle {
  r: 20;
}
```

---

## 🔮 PHASE 2: Spatial Layout (Future Enhancement)

### Extract Real Coordinates from ZInD

```typescript
interface RoomLayout {
  roomLabel: string;
  vertices: [number, number][]; // 2D polygon
  doors: [number, number][];
  windows: [number, number][];
  transformation: {
    translation: [number, number];
    rotation: number;
    scale: number;
  };
}

const extractFloorPlan = (zindData: ZindData): RoomLayout[] => {
  const layouts: RoomLayout[] = [];

  Object.values(zindData.merger).forEach(floor => {
    Object.values(floor).forEach(completeRoom => {
      Object.values(completeRoom).forEach(partialRoom => {
        Object.values(partialRoom).forEach(pano => {
          if (pano.layout_raw && pano.floor_plan_transformation) {
            layouts.push({
              roomLabel: pano.label,
              vertices: pano.layout_raw.vertices,
              doors: pano.layout_raw.doors || [],
              windows: pano.layout_raw.windows || [],
              transformation: pano.floor_plan_transformation
            });
          }
        });
      });
    });
  });

  return layouts;
};

// Transform vertices to world coordinates
const transformVertices = (
  vertices: [number, number][],
  transform: { translation: [number, number], rotation: number, scale: number }
): [number, number][] => {
  const rad = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return vertices.map(([x, y]) => {
    // Scale
    let tx = x * transform.scale;
    let ty = y * transform.scale;

    // Rotate
    const rx = tx * cos - ty * sin;
    const ry = tx * sin + ty * cos;

    // Translate
    return [
      rx + transform.translation[0],
      ry + transform.translation[1]
    ];
  });
};

// Render room shapes
const renderRoomShapes = (layouts: RoomLayout[]) => {
  return layouts.map((layout, i) => {
    const transformedVertices = transformVertices(
      layout.vertices,
      layout.transformation
    );

    const pathData = transformedVertices
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x * 100} ${y * 100}`)
      .join(' ') + ' Z';

    return (
      <g key={i}>
        <path
          d={pathData}
          fill="rgba(26, 26, 46, 0.8)"
          stroke="#00d9ff"
          strokeWidth="2"
        />
        <text
          x={transformedVertices[0][0] * 100}
          y={transformedVertices[0][1] * 100}
          fill="white"
          fontSize="12"
        >
          {layout.roomLabel}
        </text>
      </g>
    );
  });
};
```

---

## 🎯 Integration with VirtualTour

### Add Floor Plan Toggle

```tsx
// In VirtualTour.tsx
const [showFloorPlan, setShowFloorPlan] = useState(false);

// Add button
<motion.button
  className="floor-plan-toggle"
  onClick={() => setShowFloorPlan(!showFloorPlan)}
  title="Toggle Floor Plan"
>
  <Map size={24} />
</motion.button>;

// Render as overlay or separate view
{
  showFloorPlan && (
    <FloorPlan2D
      roomGroups={roomGroups}
      currentRoom={currentPano.label}
      onRoomClick={handleRoomChange}
    />
  );
}
```

### Minimap Version (Picture-in-Picture)

```tsx
<div className="floor-plan-minimap">
  <FloorPlan2D
    roomGroups={roomGroups}
    currentRoom={currentPano.label}
    onRoomClick={handleRoomChange}
    compact={true}
  />
</div>
```

---

## Alternative Quick Solutions

### Option A: Use React Flow Library

```bash
npm install reactflow
```

```tsx
import ReactFlow from "reactflow";
import "reactflow/dist/style.css";

const nodes = roomGroups.map((room, i) => ({
  id: room.label,
  data: { label: room.label, count: componentCount },
  position: { x: i * 200, y: 100 },
  type: "custom",
}));

const edges = Object.entries(ROOM_MARKERS).flatMap(([from, dests]) =>
  Object.keys(dests).map((to) => ({
    id: `${from}-${to}`,
    source: from,
    target: to,
  })),
);

<ReactFlow nodes={nodes} edges={edges} />;
```

### Option B: Use D3.js Force Graph

```bash
npm install d3
```

```tsx
import * as d3 from "d3";

useEffect(() => {
  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2));

  simulation.on("tick", () => {
    // Update positions
  });
}, [nodes, links]);
```

---

## Recommended Implementation Order

### Week 1: Basic Graph View

1. ✅ Create FloorPlan2D component
2. ✅ Extract room connections from ROOM_MARKERS
3. ✅ Simple circular layout
4. ✅ Show component count badges
5. ✅ Click to navigate

### Week 2: Enhanced Layout

1. ✅ Implement force-directed layout
2. ✅ Add hover effects
3. ✅ Show connection lines
4. ✅ Add legend
5. ✅ Make responsive

### Week 3: Integration

1. ✅ Add to VirtualTour
2. ✅ Toggle view mode
3. ✅ Minimap version
4. ✅ Sync current room highlight
5. ✅ Smooth transitions

### Week 4: Advanced (Optional)

1. ✅ Extract ZInD floor plan data
2. ✅ Render accurate room shapes
3. ✅ Pan and zoom controls
4. ✅ Room details on hover
5. ✅ Export as image

---

## Your Approach Review ✅

**Your suggested flow is EXCELLENT:**

> "Use all the coordinates stored in local storage, hardcoded or directly the data in zind_data.json"

**Improvements:**

1. **Start Simple**: Graph-based layout first (faster to implement, works today)
2. **Layer Data**: Combine all sources:
   - ROOM_MARKERS → connections
   - componentStorage → component count
   - navigationMarkerStorage → custom markers
   - zind_data.json → spatial accuracy (phase 2)

3. **Progressive Enhancement**:

   ```
   Phase 1: Graph layout (works with any data)
   Phase 2: Add ZInD spatial coordinates (if available)
   Phase 3: User can toggle between views
   ```

4. **Make it Interactive**:
   - Click room → navigate
   - Hover → show details (components, connections)
   - Drag to reposition (if using React Flow)
   - Pan/zoom for large floor plans

Ready to implement? Start with Phase 1 - I can create the full component now if you'd like!
