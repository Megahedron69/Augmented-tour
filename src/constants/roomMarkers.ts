/**
 * Hardcoded room navigation markers
 * Maps current room → destination room → 3D coordinates on panorama sphere
 */

import { DEFAULT_TOUR_ID, type TourId } from "../types/tours";

export type RoomMarkerMap = Record<
  string,
  Record<string, [number, number, number]>
>;

const HOME_ROOM_MARKERS: RoomMarkerMap = {
  "living room": {
    "dining room": [-42.26, -6.95, -25.67],
    hallway: [-28.33, -8.51, 40.24],
  },
  "dining room": {
    "living room": [29.02, -4.78, -40.36],
    kitchen: [49.72, -4.6, -1.33],
    "bonus room": [-35.85, -8.01, -33.83],
  },
  kitchen: {
    "dining room": [49.6, -6.14, -0.08],
    hallway: [0.49, -11.87, 48.54],
  },
  hallway: {
    "living room": [-49.57, -6.13, -0.7],
    kitchen: [-45.87, -8.21, 17.99],
    bedroom: [-8.31, -16.38, -46.46],
    bathroom: [1.74, -15.21, 47.53],
    closet: [48.04, -3.25, -13.24],
    stairs: [49.76, -4.61, -0.33],
  },
  bedroom: {
    hallway: [-34.6, -35.8, 4.21],
  },
  bathroom: {
    hallway: [-19.29, -7.3, 45.53],
    garage: [-26.15, -3.7, -42.37],
  },
  closet: {
    hallway: [-49.12, -5.6, -6.97],
  },
  stairs: {
    hallway: [-19.21, -1.38, -46.12],
    "upper lobby": [42.7, 24.74, -7.8],
  },
  "upper lobby": {
    "bathroom floor 2": [-4.37, 4.41, -49.58],
    "bedroom floor 2": [36.02, -1.26, 34.58],
    "storage closet floor 2": [11.7, -1.05, 48.52],
    stairs: [39.01, -31.19, -1.08],
  },
  "bedroom floor 2": {
    "upper lobby": [-0.12, 4.28, 49.8],
  },
  "storage closet floor 2": {
    "upper lobby": [36.24, -7.81, 33.45],
  },
  "bonus room": {
    "dining room": [0.2, -7.78, -49.37],
    laundry: [-39.44, -9.08, -29.24],
  },
  laundry: {
    "bonus room": [-17.69, -19.12, -42.68],
  },
  garage: {
    bathroom: [-49.03, -2.22, 9.42],
  },
};

const OFFICE_ROOM_MARKERS: RoomMarkerMap = {
  reception: {
    "entry hall": [-12.86, 9.3, 47.35],
  },
  "entry hall": {
    reception: [-19.09, -2.41, -46.15],
    staircase: [39.89, -4.51, 29.69],
  },
  staircase: {
    "entry hall": [3.76, -0.26, 49.81],
    basement: [43.83, -23.98, 0.8],
    cafereria: [44.71, 16.74, 14.71],
  },
  basement: {
    staircase: [-44.67, 21.8, -5.09],
    office: [33.6, -7.98, -36.07],
    "maintainance room": [49.42, -1.08, 7.01],
    "server room": [3.53, -6.01, 49.45],
  },
  office: {
    basement: [44.07, -23.56, 0.59],
  },
  "maintainance room": {
    basement: [46.44, -8.82, -16.08],
  },
  "server room": {
    basement: [45.02, -21.6, 1.4],
  },
  cafereria: {
    staircase: [37.7, -32.78, -0.6],
    "meeting room a": [49.95, 1.6, -0.32],
    "meeting room b": [-49.19, -7.62, -4.41],
  },
  "meeting room a": {
    cafereria: [-23.03, -4.6, 44.11],
  },
  "meeting room b": {
    cafereria: [17, -8.86, 46.1],
  },
};

export const ROOM_MARKERS = HOME_ROOM_MARKERS;

export const TOUR_ROOM_MARKERS: Record<TourId, RoomMarkerMap> = {
  home: HOME_ROOM_MARKERS,
  office: OFFICE_ROOM_MARKERS,
};

export const getTourRoomMarkers = (
  tourId: TourId = DEFAULT_TOUR_ID,
): RoomMarkerMap => {
  return TOUR_ROOM_MARKERS[tourId] ?? TOUR_ROOM_MARKERS[DEFAULT_TOUR_ID];
};

/**
 * Get room groups from ROOM_MARKERS to determine available navigation
 */
export const getRoomDestinations = (
  currentRoom: string,
  tourId: TourId = DEFAULT_TOUR_ID,
): Array<{ room: string; coords: [number, number, number] }> => {
  const roomLabel = currentRoom.toLowerCase().trim();
  const destinations = getTourRoomMarkers(tourId)[roomLabel];

  if (!destinations) {
    return [];
  }

  return Object.entries(destinations).map(([room, coords]) => ({
    room,
    coords,
  }));
};
