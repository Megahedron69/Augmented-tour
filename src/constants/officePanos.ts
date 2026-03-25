import type { ParsedPano } from "../utils/zindDataParser";
import { normalizeRoomLabel } from "../utils/tourFormatting";

const createOfficePano = (
  assetName: string,
  floorNumber: number,
  cameraHeight = 1.1,
  ceilingHeight = 2.8,
): ParsedPano => ({
  id: `office_${assetName}`,
  label: normalizeRoomLabel(assetName),
  imagePath: `/360Assets/ioclPanos/${assetName}.png`,
  floorNumber,
  panoId: `office_${assetName}`,
  cameraHeight,
  ceilingHeight,
  isPrimary: true,
  isInside: true,
});

export const OFFICE_PANOS: ParsedPano[] = [
  createOfficePano("reception", 0),
  createOfficePano("entryHall", 0),
  createOfficePano("staircase", -1),
  createOfficePano("staircase", 0),
  createOfficePano("staircase", 1),
  createOfficePano("cafereria", 1),
  createOfficePano("office", -1),
  createOfficePano("meetingRoomA", 1),
  createOfficePano("meetingRoomB", 1),
  createOfficePano("basement", -1),
  createOfficePano("maintainanceRoom", -1),
  createOfficePano("serverRoom", -1),
];
