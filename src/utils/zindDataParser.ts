/**
 * Simple POC parser for ZInD panorama data
 * Keeps only essential parsing, everything else will be hardcoded
 */

export interface PanoData {
  is_inside: boolean;
  is_primary: boolean;
  is_ceiling_flat: boolean;
  label: string;
  camera_height: number;
  ceiling_height: number;
  floor_number: number;
  image_path: string;
  checksum: string;
}

export interface ParsedPano {
  id: string;
  label: string;
  imagePath: string;
  floorNumber: number;
  panoId: string;
  cameraHeight: number;
  ceilingHeight: number;
  isPrimary: boolean;
  isInside: boolean;
}

export interface RoomGroup {
  label: string;
  panoramas: ParsedPano[];
  primaryPano?: ParsedPano;
}

export interface ZindData {
  merger: {
    [floorId: string]: {
      [completeRoomId: string]: {
        [partialRoomId: string]: {
          [panoId: string]: PanoData;
        };
      };
    };
  };
}

/**
 * Parse ZInD data and extract all panoramas
 */
export function parseZindData(data: ZindData): ParsedPano[] {
  const panos: ParsedPano[] = [];
  const merger = data.merger || {};

  for (const [floorId, floorData] of Object.entries(merger)) {
    for (const [completeRoomId, completeRoom] of Object.entries(floorData)) {
      for (const [partialRoomId, partialRoom] of Object.entries(completeRoom)) {
        for (const [panoId, panoData] of Object.entries(partialRoom)) {
          if (panoId.startsWith("pano_")) {
            panos.push({
              id: `${floorId}_${completeRoomId}_${partialRoomId}_${panoId}`,
              label: panoData.label || "Unknown Room",
              imagePath: `/360Assets/${panoData.image_path}`,
              floorNumber: panoData.floor_number || 1,
              panoId: panoId,
              cameraHeight: panoData.camera_height || 1.5,
              ceilingHeight: panoData.ceiling_height || 2.5,
              isPrimary: panoData.is_primary || false,
              isInside: panoData.is_inside || true,
            });
          }
        }
      }
    }
  }

  return panos;
}

/**
 * Group panoramas by room label
 */
export function groupPanosByRoom(panos: ParsedPano[]): RoomGroup[] {
  const roomMap = new Map<string, ParsedPano[]>();

  for (const pano of panos) {
    const label = pano.label.toLowerCase().trim();
    if (!roomMap.has(label)) {
      roomMap.set(label, []);
    }
    roomMap.get(label)!.push(pano);
  }

  const roomGroups: RoomGroup[] = [];
  for (const [label, panoramas] of roomMap.entries()) {
    const primaryPano = panoramas.find((p) => p.isPrimary) || panoramas[0];
    roomGroups.push({
      label,
      panoramas,
      primaryPano,
    });
  }

  return roomGroups.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Preload panorama images to prevent white flashes
 * Returns a promise that resolves when all images are loaded
 */
export async function preloadPanoramaImages(
  panos: ParsedPano[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const total = panos.length;
  let loaded = 0;

  const loadPromises = panos.map((pano) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (onProgress) {
          onProgress(loaded, total);
        }
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to preload image: ${pano.imagePath}`);
        loaded++;
        if (onProgress) {
          onProgress(loaded, total);
        }
        // Resolve anyway to not block other images
        resolve();
      };
      img.src = pano.imagePath;
    });
  });

  await Promise.all(loadPromises);
}

/**
 * Load ZInD data from JSON file
 */
export async function loadZindData(
  url: string = "/360Assets/zind_data.json",
): Promise<ZindData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ZInD data: ${response.statusText}`);
  }
  return response.json();
}
