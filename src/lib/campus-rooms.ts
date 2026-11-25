export const campusLevels = ["Planta baja", "Piso 1", "Piso 2"];

export function firstClassroom(_building?: number) {
  return 1;
}

export function classroomCode(building: number, floor: number, room: number) {
  return `${building}${floor}${String(room).padStart(2, "0")}`;
}

export const buildingRoomGroups = [1, 2, 3, 4].map((building) => {
  const first = firstClassroom(building);
  return {
    label: `Edificio ${building}`,
    rooms: campusLevels.flatMap((level, floor) =>
      Array.from({ length: 14 - first }, (_, index) => {
        const code = classroomCode(building, floor, first + index);
        return { code, label: `${code} · Edificio ${building} · ${level}` };
      }),
    ),
  };
});

export function isValidRoomCode(code: string) {
  if (/^G[01]0[0-9]$/.test(code)) return true;
  return /^[1-4][0-2](0[1-9]|1[0-3])$/.test(code) && Number(code.slice(2)) >= firstClassroom(Number(code[0]));
}
