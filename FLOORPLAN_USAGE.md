# 2D Floor Plan Feature - Quick Guide

## 🎉 Successfully Implemented!

The interactive 2D floor plan has been fully integrated into your virtual tour application.

## Features Included

### ✅ Graph-Based Layout

- **Auto-positioning** of rooms using force-directed algorithm
- **Smart connections** based on your navigation markers
- **Component badges** showing XR component count per room
- **Navigation marker badges** showing custom markers

### ✅ Interactive Controls

- **Click rooms** to navigate instantly
- **Zoom & Pan** with React Flow controls
- **Minimap** for overview navigation
- **Hover effects** for better UX

### ✅ Visual Indicators

- **Current room highlighting** with glowing border
- **"You are here"** indicator
- **Connection lines** between linked rooms
- **Beautiful glassmorphic design** matching your app theme

## How to Use

### Opening the Floor Plan

1. **Click the Map button** (🗺️) in the top-right corner
2. The floor plan will open as a full-screen overlay
3. Click anywhere outside or press the Map button again to close

### Navigation

- **Click any room node** to instantly navigate to that room
- **Zoom**: Use mouse wheel or the + / - controls
- **Pan**: Click and drag the background
- **Reset view**: Click the fit view button (⊡) in the controls

### Understanding the Display

**Room Nodes:**

- Circle with room name
- Red badge (📦) = Number of XR components in that room
- Cyan badge (🧭) = Number of navigation markers
- Glowing border = Your current room
- Connected by animated blue lines

**Legend (bottom-left):**

- XR Components (red)
- Nav Markers (cyan)
- Connections (blue line)
- Current Room (glowing circle)

## Technical Details

### Files Created

```
src/components/
├── FloorPlan2D.tsx      # Main floor plan component
├── FloorPlan2D.css      # Styling
└── RoomNode.tsx         # Custom room node component
```

### Dependencies Added

- `reactflow` - Professional graph visualization library

### Data Sources Used

1. **Room Connections**: `src/constants/roomMarkers.ts`
2. **XR Components**: `localStorage` via `componentStorage`
3. **Navigation Markers**: `localStorage` via `navigationMarkerStorage`
4. **Room Data**: Parsed from `zind_data.json`

### Layout Algorithm

The component uses a **simplified force-directed layout**:

- Nodes repel each other (prevents overlap)
- Connected nodes attract (keeps links short)
- 50 iterations for stable positioning
- Bounded within viewport

## Customization Options

### Adjust Room Node Appearance

Edit `src/components/FloorPlan2D.css`:

```css
.room-circle {
  width: 100px; /* Change node size */
  height: 100px;
  border: 2px solid; /* Border thickness */
}
```

### Change Layout Spacing

Edit `src/components/FloorPlan2D.tsx`:

```typescript
// Line ~88-90: Adjust repulsion distance
if (dist < 300) {
  // Change 300 to increase/decrease spacing
  const repulsion = 5000 / distSq; // Adjust force strength
}

// Line ~115: Adjust attraction distance
const attraction = (dist - 150) * 0.05; // Change 150 for link length
```

### Toggle Animations

In `FloorPlan2D.tsx`, line ~192:

```typescript
animated: true,  // Set to false to disable animations
```

## Future Enhancements (Optional)

### Phase 2: Add Real Floor Plan Shapes

See `FLOORPLAN_2D_DESIGN.md` for implementation details on:

- Extracting room polygons from ZInD data
- Rendering actual room shapes
- Spatial accuracy with transformations

### Easy Additions

1. **Search/Filter Rooms**

   ```tsx
   const [searchTerm, setSearchTerm] = useState("");
   const filteredRooms = roomGroups.filter((r) =>
     r.label.toLowerCase().includes(searchTerm.toLowerCase()),
   );
   ```

2. **Room Details Tooltip**

   ```tsx
   <Tooltip content={`${componentCount} components, ${markerCount} markers`}>
     <RoomNode ... />
   </Tooltip>
   ```

3. **Export as Image**

   ```tsx
   import { toPng } from "react-flow-renderer";

   const downloadImage = () => {
     toPng(document.querySelector(".floor-plan-2d"));
   };
   ```

4. **Different Layouts**
   - Circular layout
   - Hierarchical layout
   - Grid layout
   - Custom manual positioning

## Troubleshooting

### Rooms not showing?

- Check that `roomGroups` has data
- Verify `ROOM_MARKERS` contains connections
- Open browser console for errors

### Layout looks weird?

- Try adjusting force parameters in `calculateRoomPositions`
- Increase iteration count (line ~76)
- Adjust repulsion/attraction values

### Performance issues with many rooms?

- Reduce iteration count
- Disable animations
- Use `compact` mode

## Performance Notes

- **Fast**: Renders 10-20 rooms smoothly
- **Scalable**: Force layout runs once on data change
- **Optimized**: React Flow handles virtualization

## Browser Support

- ✅ Chrome, Edge, Brave (recommended)
- ✅ Firefox
- ✅ Safari (may need `-webkit-` prefixes)

## Keyboard Shortcuts (Future)

Consider adding:

- `M` - Toggle floor plan
- `F` - Fit view
- `Esc` - Close floor plan

## Summary

Your 2D floor plan is **ready to use**!

Click the **Map button (🗺️)** in the top-right corner to see it in action. The layout automatically adapts to your room structure and shows all your custom components and navigation markers.

Enjoy exploring your virtual tour from a bird's-eye view! 🚀
