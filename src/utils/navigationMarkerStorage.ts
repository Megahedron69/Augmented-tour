/**
 * Navigation Marker Storage Utilities
 * localStorage management for dynamic room connections
 */

import type {
  NavigationMarker,
  NavigationMarkersStorage,
} from "../types/navigationMarkers";
import { DEFAULT_TOUR_ID, type TourId } from "../types/tours";
import { normalizeRoomLabel } from "./tourFormatting";

const LEGACY_STORAGE_KEY = "navigationMarkers";

const getStorageKey = (tourId: TourId): string => {
  return `${LEGACY_STORAGE_KEY}:${tourId}`;
};

/**
 * Load all navigation markers from localStorage
 */
export function loadNavigationMarkers(
  tourId: TourId = DEFAULT_TOUR_ID,
): NavigationMarkersStorage {
  try {
    const scoped = localStorage.getItem(getStorageKey(tourId));

    if (scoped) {
      return JSON.parse(scoped);
    }

    if (tourId === DEFAULT_TOUR_ID) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      return legacy ? JSON.parse(legacy) : {};
    }

    return {};
  } catch (error) {
    console.error("Error loading navigation markers:", error);
    return {};
  }
}

/**
 * Save navigation markers to localStorage
 */
export function saveNavigationMarkers(
  markers: NavigationMarkersStorage,
  tourId: TourId = DEFAULT_TOUR_ID,
): void {
  try {
    const serialized = JSON.stringify(markers);
    localStorage.setItem(getStorageKey(tourId), serialized);

    if (tourId === DEFAULT_TOUR_ID) {
      localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
    }
  } catch (error) {
    console.error("Error saving navigation markers:", error);
  }
}

/**
 * Get navigation markers for a specific room
 */
export function getMarkersForRoom(
  fromRoom: string,
  tourId: TourId = DEFAULT_TOUR_ID,
): NavigationMarker[] {
  const allMarkers = loadNavigationMarkers(tourId);
  return allMarkers[normalizeRoomLabel(fromRoom)] || [];
}

/**
 * Add a new navigation marker
 */
export function addNavigationMarker(
  marker: NavigationMarker,
  tourId: TourId = DEFAULT_TOUR_ID,
): void {
  const allMarkers = loadNavigationMarkers(tourId);
  const fromRoom = normalizeRoomLabel(marker.fromRoom);
  const toRoom = normalizeRoomLabel(marker.toRoom);

  if (!allMarkers[fromRoom]) {
    allMarkers[fromRoom] = [];
  }

  allMarkers[fromRoom].push({
    ...marker,
    fromRoom,
    toRoom,
  });
  saveNavigationMarkers(allMarkers, tourId);
}

/**
 * Delete a navigation marker by ID
 */
export function deleteNavigationMarker(
  id: string,
  tourId: TourId = DEFAULT_TOUR_ID,
): void {
  const allMarkers = loadNavigationMarkers(tourId);

  // Find and remove the marker from the appropriate room
  for (const room in allMarkers) {
    allMarkers[room] = allMarkers[room].filter((m) => m.id !== id);
    if (allMarkers[room].length === 0) {
      delete allMarkers[room];
    }
  }

  saveNavigationMarkers(allMarkers, tourId);
}

/**
 * Clear all navigation markers
 */
export function clearAllNavigationMarkers(
  tourId: TourId = DEFAULT_TOUR_ID,
): void {
  localStorage.removeItem(getStorageKey(tourId));

  if (tourId === DEFAULT_TOUR_ID) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

/**
 * Export navigation markers as code for roomMarkers.ts
 */
export function exportAsCode(tourId: TourId = DEFAULT_TOUR_ID): string {
  const allMarkers = loadNavigationMarkers(tourId);
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
