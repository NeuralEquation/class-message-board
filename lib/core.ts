export type Assignment = {
  id: string;
  text: string;
  order: number;
  background: string | null;
  textColor: string | null;
  enabled: boolean;
};

export type RoomSettings = {
  roomId: string;
  displayName: string;
  message: string;
  enabled: boolean;
  updatedAt: number;
  global: {
    background: string;
    textColor: string;
    orientation: "free" | "portrait" | "landscape";
    safeWidth: number;
    safeHeight: number;
    lockEnabled: boolean;
  };
  assignments: Assignment[];
};

export const PALETTE = ["#DDF3FA", "#FFF1B8", "#F9DCE5", "#DDF2D8", "#E7E1F7"];

export function makeRoomId(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => (bytes[index] = Math.floor(Math.random() * 256)));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function splitMessage(message: string, size = 2): Assignment[] {
  const chars = Array.from(message.replace(/\s+/g, "").trim());
  const result: Assignment[] = [];
  for (let index = 0; index < chars.length; index += size) {
    result.push({
      id: `a-${Date.now()}-${index}`,
      text: chars.slice(index, index + size).join(""),
      order: result.length + 1,
      background: result.length % 2 === 0 ? PALETTE[0] : PALETTE[1],
      textColor: null,
      enabled: true,
    });
  }
  return result;
}

export function normalizeAssignments(assignments: Assignment[]): Assignment[] {
  return assignments
    .filter((item) => item.enabled !== false)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

export function effectiveColors(room: RoomSettings, assignment: Assignment) {
  return {
    background: assignment.background || room.global.background,
    textColor: assignment.textColor || room.global.textColor,
  };
}

export function applyPalette(assignments: Assignment[], mode: "same" | "alternate" | "multi" | "standard") {
  return assignments.map((item, index) => ({
    ...item,
    background:
      mode === "standard" ? "#FFFFFF" :
      mode === "same" ? PALETTE[0] :
      mode === "alternate" ? PALETTE[index % 2] :
      PALETTE[index % PALETTE.length],
    textColor: mode === "standard" ? "#111827" : null,
  }));
}

export function validateRoom(value: unknown): value is RoomSettings {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<RoomSettings>;
  if (!room.roomId || !room.global || !Array.isArray(room.assignments)) return false;
  if (!/^[-a-z0-9]{6,32}$/i.test(room.roomId)) return false;
  if (!/^#[0-9A-F]{6}$/i.test(room.global.background || "")) return false;
  if (!/^#[0-9A-F]{6}$/i.test(room.global.textColor || "")) return false;
  return room.assignments.length <= 80 && room.assignments.every((item) =>
    typeof item.id === "string" &&
    typeof item.text === "string" &&
    Array.from(item.text).length >= 1 &&
    Array.from(item.text).length <= 2 &&
    Number.isInteger(item.order) &&
    item.order > 0 &&
    (item.background === null || /^#[0-9A-F]{6}$/i.test(item.background)) &&
    (item.textColor === null || /^#[0-9A-F]{6}$/i.test(item.textColor))
  );
}

export function createDefaultRoom(roomId = "demo8k2m"): RoomSettings {
  const message = "先生三年間ありがとうございました";
  return {
    roomId,
    displayName: "卒業記念メッセージ",
    message,
    enabled: true,
    updatedAt: Date.now(),
    global: {
      background: "#DDF3FA",
      textColor: "#111827",
      orientation: "free",
      safeWidth: 80,
      safeHeight: 75,
      lockEnabled: true,
    },
    assignments: splitMessage(message),
  };
}

export function formatNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}
