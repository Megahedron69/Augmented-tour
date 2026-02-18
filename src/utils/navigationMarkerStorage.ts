/**
 * Navigation Marker Storage Utilities
 * localStorage management for dynamic room connections
 */

import type {
  NavigationMarker,
  NavigationMarkersStorage,
} from "../types/navigationMarkers";

const STORAGE_KEY = "navigationMarkers";

/**
 * Load all navigation markers from localStorage
 */
export function loadNavigationMarkers(): NavigationMarkersStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Error loading navigation markers:", error);
    return {};
  }
}

/**
 * Save navigation markers to localStorage
 */
export function saveNavigationMarkers(markers: NavigationMarkersStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  } catch (error) {
    console.error("Error saving navigation markers:", error);
  }
}

/**
 * Get navigation markers for a specific room
 */
export function getMarkersForRoom(fromRoom: string): NavigationMarker[] {
  const allMarkers = loadNavigationMarkers();
  return allMarkers[fromRoom] || [];
}

/**
 * Add a new navigation marker
 */
export function addNavigationMarker(marker: NavigationMarker): void {
  const allMarkers = loadNavigationMarkers();

  if (!allMarkers[marker.fromRoom]) {
    allMarkers[marker.fromRoom] = [];
  }

  allMarkers[marker.fromRoom].push(marker);
  saveNavigationMarkers(allMarkers);
}

/**
 * Delete a navigation marker by ID
 */
export function deleteNavigationMarker(id: string): void {
  const allMarkers = loadNavigationMarkers();

  // Find and remove the marker from the appropriate room
  for (const room in allMarkers) {
    allMarkers[room] = allMarkers[room].filter((m) => m.id !== id);
    if (allMarkers[room].length === 0) {
      delete allMarkers[room];
    }
  }

  saveNavigationMarkers(allMarkers);
}

/**
 * Clear all navigation markers
 */
export function clearAllNavigationMarkers(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export navigation markers as code for roomMarkers.ts
 */
export function exportAsCode(): string {
  const allMarkers = loadNavigationMarkers();
  let code = "// Auto-generated from dynamic navigation markers\n\n";

  for (const fromRoom in allMarkers) {
    const markers = allMarkers[fromRoom];
    markers.forEach((marker) => {
      code += `// ${fromRoom} -> ${marker.toRoom}\n`;
      code += `{\n`;
      code += `  from: "${marker.fromRoom}",\n`;
      code += `  to: "${marker.toRoom}",\n`;
      code += `  coords: [${marker.position.join(", ")}],\n`;
      code += `},\n\n`;
    });
  }

  return code;
}
