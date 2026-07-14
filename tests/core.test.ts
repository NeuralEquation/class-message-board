import assert from "node:assert/strict";
import test from "node:test";
import { applyPalette, createDefaultRoom, effectiveColors, normalizeAssignments, splitMessage, validateRoom } from "../lib/core";

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

test("正しいバックアップのみ受け付ける", () => {
  assert.equal(validateRoom(createDefaultRoom()), true);
  assert.equal(validateRoom({ roomId: "bad" }), false);
  const invalid = createDefaultRoom();
  invalid.assignments[0].text = "3文字以上";
  assert.equal(validateRoom(invalid), false);
});
