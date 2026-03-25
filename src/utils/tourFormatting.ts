export const normalizeRoomLabel = (value: string): string => {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

export const formatRoomLabel = (value: string): string => {
  return normalizeRoomLabel(value)
    .split(" ")
    .filter(Boolean)
    .map((segment) => {
      if (segment.length === 1) {
        return segment.toUpperCase();
      }

      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
};

export const formatFloorLabel = (floorNumber: number): string => {
  if (floorNumber === 0) {
    return "Ground Floor";
  }

  if (floorNumber === -1) {
    return "Basement";
  }

  if (floorNumber < -1) {
    return `Basement ${Math.abs(floorNumber)}`;
  }

  return `Floor ${floorNumber}`;
};
