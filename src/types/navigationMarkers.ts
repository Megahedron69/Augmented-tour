/**
 * Navigation Marker Type Definitions
 * For dynamic room-to-room connections
 */

export interface NavigationMarker {
  id: string;
  fromRoom: string;
  toRoom: string;
  position: [number, number, number];
  createdAt: number;
}

export interface NavigationMarkersStorage {
  [fromRoom: string]: NavigationMarker[];
}
