# 🥽 Mixed Reality House — Virtual Tour POC

A high-fidelity 360° virtual tour prototype built with **React**, **Three.js**, and **React Three Fiber**. This project showcases a modern Apple Vision Pro-inspired glassmorphism UI for spatial computing annotations in a browser-based environment.

---

## ✨ Key Features

- **🌐 360° Panorama Navigation**: Smooth transitions between interconnected 360° photo environments.
- **🧊 Spatial Glassmorphism UI**: High-blur, high-saturation overlays powered by `framer-motion` and `lucide-react`.
- **📍 Dynamic Annotations (XR Components)**:
  - **InfoBox**: Rich text spatial hints.
  - **Status**: Live-pulsing system/logic indicators.
  - **Steps**: Ordered contextual instructions.
  - **Alerts**: Critical system warnings with visual pulsing.
  - **Image Gallery**: Hoverable/expandable image overlays.
  - **API Driven**: Real-time components that fetch JSON data from URLs on room entry/intervals.
- **🏗️ Visual Editor**:
  - `SHIFT + CLICK` to place markers anywhere in 3D space.
  - Real-time manipulation of marker properties, scaling, and metadata.
  - Navigation Marker system to link rooms together.
- **💾 Persistence**: All customizations and placements are persisted via `localStorage`.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Runtime**: [Vite](https://vitejs.dev/)
- **3D Engine**: [@react-three/fiber](https://r3f.docs.pmnd.rs/) & [Three.js](https://threejs.org/)
- **Components**: [@react-three/drei](https://github.com/pmndrs/drei) (Html, OrbitControls, Environment)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State**: [Zustand](https://zustand-demo.pmnd.rs/) & React State

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone <repo-url>
cd mixedRealityHouse
npm install
```

### 2. Development

```bash
npm run dev
```

---

## 🖱️ Interaction Guide

| Action                     | Result                                 |
| :------------------------- | :------------------------------------- |
| **Drag Mouse / Touch**     | Pan around the 360° sphere.            |
| **Hover on Marker**        | Preview component title/glow.          |
| **Left Click Marker**      | Expand/Collapse detail card.           |
| **SHIFT + Left Click**     | Open Editor at targeted 3D coordinate. |
| **Navigation Pills**       | Click to move to the connected room.   |
| **Room Selector (Bottom)** | Quick jump to any room in the tour.    |

---

## 📂 Project Structure

- `src/components/PanoramaViewer.tsx`: Core R3F sphere rendering and interaction logic.
- `src/components/XRComponentRenderer.tsx`: Dynamic glassmorphic card generator for all 6 annotation types.
- `src/components/ComponentEditor.tsx`: Advanced form for configuring component data & API fetching.
- `src/components/TourNavigation.tsx`: Global navigation and room management portal.
- `src/types/roomComponents.ts`: Unified schema for spatial data and API configurations.

---

## 🛸 API Components

The system supports a powerful **API Render Type**. You can point a component at a URL (e.g., a Greenhouse sensor or Device Status JSON), and the 3D card will:

1. Fetch data on room entry.
2. Auto-refresh at user-defined intervals.
3. Show shimmer loading states & error recovery UI.
4. Render as any of the 5 base types using a dynamic JSON schema.

---

## 📸 Acknowledgements

The 360° panorama images used in this project are sourced from the **Zillow Indoor Dataset (ZIND)**.

- **Dataset**: [Zillow Indoor Dataset (ZIND)](https://github.com/zillow/zind)
- **License**: The data is used for research/prototyping purposes as per the dataset's licensing terms.

---

_Phase 1 Prototype - Spatial Tour System (Built for Gemini 3.5 & V-OS Simulation)_
