"use client";

import { FormEvent, PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as QRCode from "qrcode";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { get, onValue, ref, set } from "firebase/database";
import {
  applyPalette,
  Assignment,
  createDefaultRoom,
  DEFAULT_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  effectiveColors,
  formatNumber,
  normalizeAssignments,
  normalizeRoomFromDatabase,
  roomContentSignature,
  RoomSettings,
  splitMessage,
  validateRoom,
} from "@/lib/core";
import { firebaseConfigured, firebaseServices } from "@/lib/firebase";

const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const CACHE_PREFIX = "classMessageBoard.room.";
const PICK_PREFIX = "classMessageBoard.pick.";

function readCachedRoom(roomId: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_PREFIX + roomId) || "null");
    return validateRoom(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cacheRoom(room: RoomSettings) {
  localStorage.setItem(CACHE_PREFIX + room.roomId, JSON.stringify(room));
}

function orientationLabel(value: RoomSettings["global"]["orientation"]) {
  return value === "portrait" ? "縦向き推奨" : value === "landscape" ? "横向き推奨" : "縦・横どちらでも可";
}

export default function MessageBoardApp() {
  const [role, setRole] = useState<"participant" | "admin">("participant");
  const [roomId, setRoomId] = useState("demo8k2m");
  const [room, setRoom] = useState<RoomSettings>(() => createDefaultRoom());
  const [publishedRoom, setPublishedRoom] = useState<RoomSettings>(() => createDefaultRoom());
  const [connection, setConnection] = useState<"connecting" | "online" | "offline" | "demo">("connecting");
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimerRef = useRef<number | null>(null);
  const dirty = roomContentSignature(room) !== roomContentSignature(publishedRoom);
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const showNotice = useCallback((message: string, duration = 2200) => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextRoom = params.get("room")?.replace(/[^-a-z0-9]/gi, "").slice(0, 32) || "demo8k2m";
    // URL and cached browser state are external inputs that are only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoomId(nextRoom);
    setRole(params.get("admin") === "1" ? "admin" : "participant");
    const cached = readCachedRoom(nextRoom);
    const initialRoom = cached || createDefaultRoom(nextRoom);
    setRoom(initialRoom);
    setPublishedRoom(initialRoom);
  }, []);

  useEffect(() => {
    const services = firebaseServices();
    if (!services) {
      // This branch reflects the external Firebase configuration, not derived React state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnection("demo");
      const onStorage = (event: StorageEvent) => {
        if (event.key !== CACHE_PREFIX + roomId || !event.newValue) return;
        try {
          const next = JSON.parse(event.newValue);
          if (validateRoom(next)) {
            setPublishedRoom(next);
            if (!dirtyRef.current) setRoom(next);
          }
        } catch { /* Keep the last valid display. */ }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    const stopAuth = onAuthStateChanged(services.auth, setUser);
    const stopRoom = onValue(
      ref(services.db, `rooms/${roomId}`),
      (snapshot) => {
        const next = normalizeRoomFromDatabase(snapshot.val(), roomId);
        if (next) {
          setPublishedRoom(next);
          if (!dirtyRef.current) setRoom(next);
          cacheRoom(next);
          if (!dirtyRef.current) showNotice("設定が更新されました", 1800);
        }
        setConnection("online");
      },
      () => setConnection("offline"),
    );
    const connectedRef = ref(services.db, ".info/connected");
    const stopConnection = onValue(connectedRef, (snapshot) => setConnection(snapshot.val() ? "online" : "offline"));
    return () => { stopAuth(); stopRoom(); stopConnection(); };
  }, [roomId, showNotice]);

  async function saveRoom(next: RoomSettings) {
    const normalized = { ...next, roomId, assignments: normalizeAssignments(next.assignments), updatedAt: Date.now() };
    const services = firebaseServices();
    if (services) {
      if (!user) throw new Error("管理者としてログインしてください。");
      const roomRef = ref(services.db, `rooms/${roomId}`);
      await set(roomRef, normalized);
      const saved = normalizeRoomFromDatabase((await get(roomRef)).val(), roomId);
      if (!saved) throw new Error("Firebaseへ保存しましたが、公開データの再取得に失敗しました。");
      setPublishedRoom(saved);
      setRoom(saved);
      cacheRoom(saved);
      showNotice("Firebaseへ保存しました");
      return;
    }
    setPublishedRoom(normalized);
    setRoom(normalized);
    cacheRoom(normalized);
    showNotice("この端末のデモデータへ保存しました");
  }

  function updateDraft(next: RoomSettings) {
    dirtyRef.current = roomContentSignature(next) !== roomContentSignature(publishedRoom);
    setRoom(next);
  }

  function switchRole(next: "participant" | "admin") {
    const url = new URL(window.location.href);
    if (next === "admin") url.searchParams.set("admin", "1");
    else url.searchParams.delete("admin");
    window.history.replaceState({}, "", url);
    setRole(next);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={`${APP_BASE_PATH}/?room=${roomId}`} aria-label="クラスメッセージボード ホーム">
          <span className="brand-mark" aria-hidden="true"></span>
          <span><strong>クラスメッセージボード</strong><small>Class Message Board</small></span>
        </a>
        <nav className="role-switch" aria-label="画面切替">
          <button className={role === "participant" ? "active" : ""} onClick={() => switchRole("participant")}>参加者</button>
          <button className={role === "admin" ? "active" : ""} onClick={() => switchRole("admin")}>代表者</button>
        </nav>
      </header>

      {role === "participant" ? (
        <ParticipantView room={publishedRoom} roomId={roomId} connection={connection} notice={notice} />
      ) : (
        <AdminView room={room} setRoom={updateDraft} saveRoom={saveRoom} roomId={roomId} user={user} connection={connection} notice={notice} dirty={dirty} />
      )}
    </main>
  );
}

function ParticipantView({ room, roomId, connection, notice }: {
  room: RoomSettings;
  roomId: string;
  connection: "connecting" | "online" | "offline" | "demo";
  notice: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [candidate, setCandidate] = useState<number | null>(null);
  const [shooting, setShooting] = useState(false);
  const [showExit, setShowExit] = useState(false);

  useEffect(() => {
    const value = Number(localStorage.getItem(PICK_PREFIX + roomId));
    // Restore the participant's device-local selection after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isInteger(value) && value >= 0 && value < room.assignments.length) setPicked(value);
  }, [roomId, room.assignments.length]);

  const assignment = picked === null ? null : room.assignments[picked];
  if (shooting && assignment) {
    return <ShootingDisplay room={room} assignment={assignment} showExit={showExit} setShowExit={setShowExit} onExit={() => { setShooting(false); setShowExit(false); }} />;
  }

  function confirmPick() {
    if (candidate === null) return;
    setPicked(candidate);
    localStorage.setItem(PICK_PREFIX + roomId, String(candidate));
    setCandidate(null);
  }

  if (!room.enabled) return <EmptyState title="このルームは現在利用できません" body="代表者にルームの状態を確認してください。" />;

  return (
    <section className="participant-page page-width">
      {picked === null ? (
        <>
          <div className="intro-block">
            <p className="eyebrow">ルーム {roomId}</p>
            <h1>担当番号を選んでください</h1>
            <p>自分に割り当てられた番号を押してください。選択後に文字を確認できます。</p>
          </div>
          <div className="number-grid" aria-label="担当番号一覧">
            {room.assignments.map((item, index) => <button key={item.id} onClick={() => setCandidate(index)}>{formatNumber(index)}</button>)}
          </div>
          <StatusCard connection={connection} />
        </>
      ) : assignment ? (
        <>
          <div className="intro-block compact">
            <p className="eyebrow">撮影前の確認</p>
            <h1>あなたの担当</h1>
          </div>
          <div className="assignment-card">
            <div className="assignment-meta"><span>担当番号</span><strong>{formatNumber(picked)}</strong></div>
            <MiniPreview room={room} item={assignment} large />
            <div className="neighbor-row">
              <div><span>前の担当</span><strong>{picked > 0 ? room.assignments[picked - 1].text : "—"}</strong></div>
              <div><span>次の担当</span><strong>{picked < room.assignments.length - 1 ? room.assignments[picked + 1].text : "—"}</strong></div>
            </div>
          </div>
          <div className="guidance-card">
            <strong>{orientationLabel(room.global.orientation)}</strong>
            <p>iPadは縦・横どちらでも使用できます。<b>撮影するカメラは横向き</b>にしてください。</p>
          </div>
          {connection === "offline" && <p className="offline-note">オフラインです。最後に受信した設定を表示しています。</p>}
          {notice && <p className="toast-inline" role="status">{notice}</p>}
          <button className="primary-action" onClick={() => {
            setShooting(true);
            document.documentElement.requestFullscreen?.().catch(() => undefined);
          }}>撮影表示にする</button>
          <button className="text-action" onClick={() => { if (confirm("担当番号を変更しますか？")) setPicked(null); }}>担当番号を変更</button>
        </>
      ) : <EmptyState title="設定を読み込めませんでした" body="通信状態を確認するか、代表者に設定を確認してください。" />}

      {candidate !== null && room.assignments[candidate] && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pick-title">
            <p className="eyebrow">担当番号 {formatNumber(candidate)}</p>
            <h2 id="pick-title">この担当でよいですか？</h2>
            <MiniPreview room={room} item={room.assignments[candidate]} large />
            <div className="modal-actions"><button onClick={() => setCandidate(null)}>戻る</button><button className="primary" onClick={confirmPick}>この担当で決定</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function ShootingDisplay({ room, assignment, showExit, setShowExit, onExit }: {
  room: RoomSettings;
  assignment: Assignment;
  showExit: boolean;
  setShowExit: (value: boolean) => void;
  onExit: () => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const colors = effectiveColors(room, assignment);

  useLayoutEffect(() => {
    const fit = () => {
      const element = textRef.current;
      if (!element) return;
      const maxWidth = window.innerWidth * room.global.safeWidth / 100;
      const maxHeight = (window.visualViewport?.height || window.innerHeight) * room.global.safeHeight / 100;
      let size = Math.min(maxHeight * 0.92, maxWidth / Math.max(0.64, Array.from(assignment.text).length * 0.72));
      element.style.fontSize = `${Math.floor(size)}px`;
      for (let i = 0; i < 10 && (element.scrollWidth > maxWidth || element.scrollHeight > maxHeight); i += 1) {
        size *= 0.9;
        element.style.fontSize = `${Math.floor(size)}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.visualViewport?.addEventListener("resize", fit);
    const observer = new ResizeObserver(fit);
    if (textRef.current) observer.observe(textRef.current.parentElement!);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      observer.disconnect();
    };
  }, [assignment.text, room.global.safeHeight, room.global.safeWidth]);

  useEffect(() => {
    const stopMenu = (event: Event) => event.preventDefault();
    document.addEventListener("contextmenu", stopMenu);
    return () => document.removeEventListener("contextmenu", stopMenu);
  }, []);

  function beginHold(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    timerRef.current = window.setTimeout(() => setShowExit(true), 2300);
  }
  function cancelHold() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  return (
    <section className="shooting-display" style={{ background: colors.background, color: colors.textColor }} aria-label={`撮影表示 ${assignment.text}`}>
      <div ref={textRef} className="shooting-text">{assignment.text}</div>
      {room.global.lockEnabled ? (
        <button className="hold-exit" aria-label="撮影表示を終了（長押し）" onPointerDown={beginHold} onPointerUp={cancelHold} onPointerCancel={cancelHold}>長押し</button>
      ) : <button className="hold-exit visible" onClick={() => setShowExit(true)}>終了</button>}
      {showExit && <div className="modal-backdrop"><div className="modal exit-modal" role="dialog" aria-modal="true"><h2>撮影表示を終了しますか？</h2><p>通常の担当確認画面に戻ります。</p><div className="modal-actions"><button onClick={() => setShowExit(false)}>キャンセル</button><button className="danger" onClick={() => { document.exitFullscreen?.().catch(() => undefined); onExit(); }}>終了する</button></div></div></div>}
    </section>
  );
}

function AdminView({ room, setRoom, saveRoom, roomId, user, connection, notice, dirty }: {
  room: RoomSettings;
  setRoom: (room: RoomSettings) => void;
  saveRoom: (room: RoomSettings) => Promise<void>;
  roomId: string;
  user: User | null;
  connection: string;
  notice: string;
  dirty: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [newText, setNewText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const participantUrl = useMemo(() => typeof window === "undefined" ? `/?room=${roomId}` : `${window.location.origin}${window.location.pathname}?room=${roomId}`, [roomId]);
  const overrideCount = room.assignments.filter((item) => item.background !== null || item.textColor !== null).length;

  useEffect(() => {
    QRCode.toDataURL(participantUrl, { width: 320, margin: 2, color: { dark: "#162033", light: "#FFFFFF" } }).then(setQr);
  }, [participantUrl]);

  async function login(event: FormEvent) {
    event.preventDefault();
    const services = firebaseServices();
    if (!services) return;
    setBusy(true); setAuthError("");
    try { await signInWithEmailAndPassword(services.auth, email, password); }
    catch { setAuthError("ログインできませんでした。メールアドレスとパスワードを確認してください。"); }
    finally { setBusy(false); }
  }

  if (firebaseConfigured && !user) {
    return <section className="login-page page-width"><div className="login-card"><p className="eyebrow">代表者専用</p><h1>管理画面へログイン</h1><p>Firebaseで作成した代表者アカウントを使用します。</p><form onSubmit={login}><label>メールアドレス<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label><label>パスワード<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>{authError && <p className="form-error">{authError}</p>}<button className="primary-action" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button></form></div></section>;
  }

  function changeAssignment(index: number, patch: Partial<Assignment>) {
    setRoom({ ...room, assignments: room.assignments.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  function move(index: number, delta: number) {
    const next = [...room.assignments];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRoom({ ...room, assignments: normalizeAssignments(next) });
  }
  async function commit() {
    setBusy(true); setAuthError("");
    try { await saveRoom(room); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(room, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `class-message-board-${room.roomId}.json`; link.click();
    URL.revokeObjectURL(link.href);
  }
  async function restore(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!validateRoom(parsed)) throw new Error();
      if (confirm("現在の編集内容を、読み込んだバックアップで置き換えますか？")) setRoom({ ...parsed, roomId });
    } catch { setAuthError("このJSONは有効なクラスメッセージボード設定ではありません。"); }
  }

  return (
    <section className="admin-page page-width wide">
      <div className="admin-heading">
        <div><p className="eyebrow">代表者用管理画面</p><h1>{room.displayName}</h1><p className="subtle">ルーム {roomId} ・ {connection === "online" ? "Firebase接続中" : firebaseConfigured ? "再接続中" : "デモモード"}</p></div>
        <div className="heading-actions"><button onClick={downloadBackup}>JSON保存</button><button onClick={() => fileRef.current?.click()}>JSON復元</button>{user && <button onClick={() => { const services = firebaseServices(); if (services) signOut(services.auth); }}>ログアウト</button>}<input ref={fileRef} hidden type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} /></div>
      </div>
      {!firebaseConfigured && <div className="demo-banner"><strong>デモモードで動作中</strong><span>Firebase設定を追加すると、ログインと別端末へのリアルタイム同期が有効になります。</span></div>}
      {notice && <p className="toast-inline" role="status">{notice}</p>}
      {authError && <p className="form-error">{authError}</p>}

      <div className="admin-layout">
        <div className="admin-main">
          <section className="panel">
            <div className="panel-heading"><div><span className="step-badge">1</span><h2>メッセージを作る</h2></div><span>{room.assignments.length}担当</span></div>
            <label className="field-label">完成メッセージ<textarea value={room.message} rows={3} maxLength={160} onChange={(e) => setRoom({ ...room, message: e.target.value })} /></label>
            <div className="inline-actions"><button className="secondary" onClick={() => setRoom({ ...room, assignments: splitMessage(room.message, 2) })}>2文字ずつ自動分割</button><button onClick={() => setRoom({ ...room, assignments: splitMessage(room.message, 1) })}>1文字ずつ自動分割</button></div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><span className="step-badge">2</span><h2>担当を調整する</h2></div><span>文字と個別色を編集</span></div>
            <div className="assignment-list">
              {room.assignments.map((item, index) => (
                <div className="assignment-row" key={item.id}>
                  <span className="row-number">{formatNumber(index)}</span>
                  <input className="text-input" aria-label={`${formatNumber(index)}の表示文字`} value={item.text} maxLength={2} onChange={(e) => changeAssignment(index, { text: Array.from(e.target.value).slice(0, 2).join("") })} />
                  <label className="color-input"><span>背景</span><input type="color" value={item.background || room.global.background} onChange={(e) => changeAssignment(index, { background: e.target.value.toUpperCase() })} /></label>
                  <label className="color-input"><span>文字</span><input type="color" value={item.textColor || room.global.textColor} onChange={(e) => changeAssignment(index, { textColor: e.target.value.toUpperCase() })} /></label>
                  <button className={`small-button ${item.background !== null || item.textColor !== null ? "override-active" : ""}`} disabled={item.background === null && item.textColor === null} title="個別色を解除して全体色を使う" onClick={() => changeAssignment(index, { background: null, textColor: null })}>{item.background !== null || item.textColor !== null ? "個別色中" : "全体色"}</button>
                  <div className="row-buttons"><button aria-label="上へ" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button aria-label="下へ" disabled={index === room.assignments.length - 1} onClick={() => move(index, 1)}>↓</button><button className="delete" aria-label="削除" onClick={() => setRoom({ ...room, assignments: normalizeAssignments(room.assignments.filter((_, i) => i !== index)) })}>削除</button></div>
                </div>
              ))}
            </div>
            <div className="add-row"><input value={newText} maxLength={2} placeholder="1〜2文字" onChange={(e) => setNewText(Array.from(e.target.value).slice(0, 2).join(""))} /><button onClick={() => { if (!newText) return; setRoom({ ...room, assignments: normalizeAssignments([...room.assignments, { id: `a-${Date.now()}`, text: newText, order: room.assignments.length + 1, background: null, textColor: null, enabled: true }]) }); setNewText(""); }}>担当を追加</button></div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><span className="step-badge">3</span><h2>全体設定</h2></div><span>全員の基本表示</span></div>
            <div className="settings-grid">
              <label>全体背景色<input type="color" value={room.global.background} onChange={(e) => setRoom({ ...room, global: { ...room.global, background: e.target.value.toUpperCase() } })} /></label>
              <label>全体文字色<input type="color" value={room.global.textColor} onChange={(e) => setRoom({ ...room, global: { ...room.global, textColor: e.target.value.toUpperCase() } })} /></label>
              <label>iPadの推奨向き<select value={room.global.orientation} onChange={(e) => setRoom({ ...room, global: { ...room.global, orientation: e.target.value as RoomSettings["global"]["orientation"] } })}><option value="free">自由</option><option value="portrait">縦向き推奨</option><option value="landscape">横向き推奨</option></select></label>
              <label className="check-field"><input type="checkbox" checked={room.global.lockEnabled} onChange={(e) => setRoom({ ...room, global: { ...room.global, lockEnabled: e.target.checked } })} />撮影表示の簡易ロック</label>
            </div>
            {overrideCount > 0 && <p className="override-summary">{overrideCount}担当の個別色が全体色を上書きしています。「全員同色」で個別色をまとめて解除できます。</p>}
            <div className="palette-actions"><span>配色パターン</span><button onClick={() => setRoom({ ...room, assignments: applyPalette(room.assignments, "same") })}>全員同色</button><button onClick={() => setRoom({ ...room, assignments: applyPalette(room.assignments, "alternate") })}>2色交互</button><button onClick={() => setRoom({ ...room, assignments: applyPalette(room.assignments, "multi") })}>5色繰り返し</button><button className="rainbow-preset" onClick={() => setRoom({ ...room, assignments: applyPalette(room.assignments, "rainbow") })}>虹色</button><button onClick={() => setRoom({ ...room, assignments: applyPalette(room.assignments, "standard"), global: { ...room.global, background: "#FFFFFF", textColor: "#111827" } })}>緊急：白＋黒</button><button className="reset-preset" onClick={() => setRoom({ ...room, assignments: applyPalette(room.assignments, "initial"), global: { ...room.global, background: DEFAULT_BACKGROUND, textColor: DEFAULT_TEXT_COLOR } })}>初期配色に戻す</button></div>
          </section>
        </div>

        <aside className="admin-aside">
          <section className="panel sticky-panel"><h2>完成プレビュー</h2><div className="preview-strip">{room.assignments.map((item, index) => <div key={item.id}><MiniPreview room={room} item={item} /><span>{formatNumber(index)}</span></div>)}</div><div className="safe-note">点線内が撮影時の安全領域です</div><MiniPreview room={room} item={room.assignments[0] || { id: "empty", text: "文", order: 1, background: null, textColor: null, enabled: true }} safe /></section>
          <section className="panel share-panel"><h2>参加者へ共有</h2>{qr && <img src={qr} alt="参加者用URLのQRコード" />}<label>参加者用URL<input readOnly value={participantUrl} /></label><button onClick={() => navigator.clipboard.writeText(participantUrl)}>URLをコピー</button><a className="button-link" href={qr} download={`room-${roomId}-qr.png`}>QR画像を保存</a></section>
        </aside>
      </div>
      <div className={`save-bar ${dirty ? "dirty" : "published"}`}><div><strong>{dirty ? "変更はまだ公開されていません" : "すべての変更を公開済み"}</strong><span>{dirty ? (firebaseConfigured ? "保存すると参加者の画面へすぐ反映されます。" : "保存するとこの端末のデモ表示へ反映されます。") : "参加者画面は最新の設定を表示しています。"}</span></div><button className="primary-action" disabled={busy || !dirty || room.assignments.some((item) => !item.text)} onClick={commit}>{busy ? "保存中…" : dirty ? "変更を保存・反映" : "公開済み"}</button></div>
    </section>
  );
}

function MiniPreview({ room, item, large = false, safe = false }: { room: RoomSettings; item: Assignment; large?: boolean; safe?: boolean }) {
  const colors = effectiveColors(room, item);
  return <div className={`mini-preview ${large ? "large" : ""} ${safe ? "safe" : ""}`} style={{ background: colors.background, color: colors.textColor }}><span>{item.text}</span></div>;
}

function StatusCard({ connection }: { connection: string }) {
  return <div className="status-card"><span className={`status-dot ${connection}`}></span><div><strong>{connection === "online" ? "接続中" : connection === "offline" ? "オフライン" : connection === "demo" ? "デモ表示" : "接続しています"}</strong><p>{connection === "offline" ? "最後に受信した設定を表示しています。" : "代表者の変更は自動的に反映されます。"}</p></div></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state page-width"><div className="empty-symbol">!</div><h1>{title}</h1><p>{body}</p></section>;
}
