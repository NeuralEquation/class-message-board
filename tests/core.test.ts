import assert from "node:assert/strict";
import test from "node:test";
import { applyPalette, createDefaultRoom, DEFAULT_BACKGROUND, DEFAULT_TEXT_COLOR, effectiveColors, normalizeAssignments, normalizeRoomFromDatabase, RAINBOW_PALETTE, roomContentSignature, splitMessage, validateRoom } from "../lib/core";

test("メッセージを1〜2文字の担当へ分割する", () => {
  assert.deepEqual(splitMessage("ありがとう").map((item) => item.text), ["あり", "がと", "う"]);
  assert.deepEqual(splitMessage("A B", 1).map((item) => item.text), ["A", "B"]);
});

test("個別色を全体色より優先する", () => {
  const room = createDefaultRoom();
  const item = { ...room.assignments[0], background: "#FFFFFF", textColor: null };
  assert.deepEqual(effectiveColors(room, item), { background: "#FFFFFF", textColor: room.global.textColor });
});

test("並び順を連番へ正規化する", () => {
  const room = createDefaultRoom();
  assert.deepEqual(normalizeAssignments(room.assignments.slice(0, 3).reverse()).map((item) => item.order), [1, 2, 3]);
});

test("配色パターンを繰り返す", () => {
  const room = createDefaultRoom();
  const colored = applyPalette(room.assignments.slice(0, 4), "alternate");
  assert.equal(colored[0].background, colored[2].background);
  assert.equal(colored[1].background, colored[3].background);
  assert.notEqual(colored[0].background, colored[1].background);
});

test("全員同色は個別色を解除して全体色を使う", () => {
  const room = createDefaultRoom();
  const same = applyPalette(room.assignments, "same");
  assert.equal(same.every((item) => item.background === null && item.textColor === null), true);
});

test("虹色プリセットを7色で繰り返す", () => {
  const room = createDefaultRoom();
  const rainbow = applyPalette([...room.assignments, ...room.assignments], "rainbow");
  assert.deepEqual(rainbow[0].background, RAINBOW_PALETTE[0].background);
  assert.deepEqual(rainbow[7].background, RAINBOW_PALETTE[0].background);
  assert.equal(rainbow.every((item) => item.background && item.textColor), true);
});

test("初期配色へ戻す", () => {
  const room = createDefaultRoom();
  const restored = applyPalette(applyPalette(room.assignments, "rainbow"), "initial");
  assert.equal(restored[0].background, DEFAULT_BACKGROUND);
  assert.equal(restored[1].background, "#FFF1B8");
  assert.equal(restored.every((item) => item.textColor === null), true);
  assert.equal(room.global.background, DEFAULT_BACKGROUND);
  assert.equal(room.global.textColor, DEFAULT_TEXT_COLOR);
});

test("Realtime Databaseで省略されたnull色を復元する", () => {
  const room = createDefaultRoom();
  const stored = JSON.parse(JSON.stringify(room));
  delete stored.assignments[0].textColor;
  delete stored.assignments[1].background;
  const normalized = normalizeRoomFromDatabase(stored, room.roomId);
  assert.ok(normalized);
  assert.equal(normalized.assignments[0].textColor, null);
  assert.equal(normalized.assignments[1].background, null);
  assert.equal(normalizeRoomFromDatabase(stored, "different-room"), null);
});

test("公開状態の比較ではupdatedAtだけの差を無視する", () => {
  const room = createDefaultRoom();
  assert.equal(roomContentSignature(room), roomContentSignature({ ...room, updatedAt: room.updatedAt + 1 }));
});

test("正しいバックアップのみ受け付ける", () => {
  assert.equal(validateRoom(createDefaultRoom()), true);
  assert.equal(validateRoom({ roomId: "bad" }), false);
  const invalid = createDefaultRoom();
  invalid.assignments[0].text = "3文字以上";
  assert.equal(validateRoom(invalid), false);
});
