import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { createDefaultRoom, normalizeAssignments } from "../lib/core";

const PROJECT_ID = "demo-class-message-board";
const DATABASE_URL = `http://127.0.0.1:9000?ns=${PROJECT_ID}`;
const ADMIN_UID = "admin-test-uid";
const ROOM_ID = "demo8k2m";
let testEnv: RulesTestEnvironment;

function roomPayload() {
  const room = createDefaultRoom(ROOM_ID);
  return {
    ...room,
    assignments: normalizeAssignments(room.assignments),
    updatedAt: 1_720_000_000_000,
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase/database.rules.json", "utf8"),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(DATABASE_URL), `admins/${ADMIN_UID}`), true);
  });
});

after(async () => {
  await testEnv.cleanup();
});

test("管理者は管理画面と同じ完全なルームオブジェクトを保存できる", async () => {
  const adminDatabase = testEnv.authenticatedContext(ADMIN_UID).database(DATABASE_URL);
  await assertSucceeds(set(ref(adminDatabase, `rooms/${ROOM_ID}`), roomPayload()));
});

test("管理者UIDは管理者リストのtrueを読み取れる", async () => {
  const adminDatabase = testEnv.authenticatedContext(ADMIN_UID).database(DATABASE_URL);
  const snapshot = await assertSucceeds(get(ref(adminDatabase, `admins/${ADMIN_UID}`)));
  assert.equal(snapshot.val(), true);
});

test("未認証ユーザーはルームを書き込めない", async () => {
  const anonymousDatabase = testEnv.unauthenticatedContext().database(DATABASE_URL);
  await assertFails(set(ref(anonymousDatabase, `rooms/${ROOM_ID}`), roomPayload()));
});

test("管理者以外の認証済みユーザーもルームを書き込めない", async () => {
  const studentDatabase = testEnv.authenticatedContext("student-test-uid").database(DATABASE_URL);
  await assertFails(set(ref(studentDatabase, `rooms/${ROOM_ID}`), roomPayload()));
});

test("個別色がnullでも、Firebaseで省略された状態で保存できる", async () => {
  const adminDatabase = testEnv.authenticatedContext(ADMIN_UID).database(DATABASE_URL);
  const payload = roomPayload();
  payload.assignments[0].background = null;
  payload.assignments[0].textColor = null;
  await assertSucceeds(set(ref(adminDatabase, `rooms/${ROOM_ID}`), payload));
  assert.equal(payload.assignments[0].background, null);
});
