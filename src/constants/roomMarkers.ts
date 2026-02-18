/**
 * Hardcoded room navigation markers
 * Maps current room → destination room → 3D coordinates on panorama sphere
 */

export const ROOM_MARKERS: Record<
  string,
  Record<string, [number, number, number]>
> = {
  "living room": {
    "dining room": [-41.98, -11.53, 24.46],
    hallway: [-31.15, -7.27, -38.41],
  },
  "dining room": {
    kitchen: [49.76, -4.04, -1.32],
    "bonus room": [-37.91, -5.38, 32.09],
    "living room": [30.71, -7.81, 38.62],
  },
  hallway: {
    bathroom: [2.52, 2.76, -49.79],
    kitchen: [-46.51, -3.08, -17.92],
    bedroom: [-5.65, -9.73, 48.68],
    closet: [45.55, -3.19, -20.24],
  },
  bathroom: {
    hallway: [-27.41, 1.17, -41.76],
  },
  kitchen: {
    "dining room": [49.64, -5.45, -1.11],
    hallway: [1.1, 1.86, -49.9],
  },
  "bonus room": {
    "dining room": [-0.81, -9.17, 49.1],
    laundry: [-41.8, 0.34, 27.39],
  },
  laundry: {
    "bonus room": [-14.65, -9.44, 46.84],
    garage: [18.11, -3.9, -46.38],
    bathroom: [-43.17, -8.91, -23.53],
  },
  closet: {
    hallway: [-49.58, -5.6, 1.85],
  },
};

/**
 * Get room groups from ROOM_MARKERS to determine available navigation
 */
export const getRoomDestinations = (
  currentRoom: string,
): Array<{ room: string; coords: [number, number, number] }> => {
  const roomLabel = currentRoom.toLowerCase().trim();
  const destinations = ROOM_MARKERS[roomLabel];

  if (!destinations) {
    return [];
  }

  return Object.entries(destinations).map(([room, coords]) => ({
    room,
    coords,
  }));
};
