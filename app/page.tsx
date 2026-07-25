"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Wind = "東" | "南" | "西" | "北";
type Status = "idle" | "countdown" | "running" | "paused" | "finished";
type Settings = {
  leftWind: Wind;
  rightWind: Wind;
  durationSec: number;
  memo: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

const winds: Wind[] = ["東", "南", "西", "北"];
const defaults: Settings = {
  leftWind: "西",
  rightWind: "西",
  durationSec: 180,
  memo: "",
  soundEnabled: true,
  vibrationEnabled: true,
};

function WindTile({ wind, side }: { wind: Wind; side: "left" | "right" }) {
  return (
    <div className={`wind-tile wind-${side}`} aria-label={`${side === "left" ? "左" : "右"}プレイヤー ${wind}`}>
      <span className="tile-mark">風</span>
      <strong>{wind}</strong>
      <span className="tile-footer">{side === "left" ? "PLAYER 1" : "PLAYER 2"}</span>
    </div>
  );
}

function formatTime(sec: number) {
  const safe = Math.max(0, sec);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [screen, setScreen] = useState<"setup" | "timer">("setup");
  const [status, setStatus] = useState<Status>("idle");
  const [remaining, setRemaining] = useState(defaults.durationSec);
  const [countdown, setCountdown] = useState<string>("");
  const [overlay, setOverlay] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "setup" | null>(null);
  const [lastMinuteShown, setLastMinuteShown] = useState(false);
  const [windsConcealed, setWindsConcealed] = useState(false);
  const [memoEditorOpen, setMemoEditorOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<Settings>(defaults);
  const endAt = useRef(0);
  const pausedAt = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("17steps-settings");
      if (saved) setSettings({ ...defaults, ...JSON.parse(saved) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("17steps-settings", JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const pulse = useCallback((frequency = 440, duration = 0.09) => {
    if (settings.vibrationEnabled && "vibrate" in navigator) navigator.vibrate(45);
    if (!settings.soundEnabled) return;
    try {
      audio.current ??= new AudioContext();
      const osc = audio.current.createOscillator();
      const gain = audio.current.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + duration);
      osc.connect(gain).connect(audio.current.destination);
      osc.start();
      osc.stop(audio.current.currentTime + duration);
    } catch {}
  }, [settings.soundEnabled, settings.vibrationEnabled]);

  const requestWakeLock = useCallback(async () => {
    try {
      const wakeNavigator = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      wakeLock.current = await wakeNavigator.wakeLock?.request("screen") ?? null;
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try { await wakeLock.current?.release(); } catch {}
    wakeLock.current = null;
  }, []);

  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible" && screen === "timer" && status !== "finished") requestWakeLock();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [requestWakeLock, screen, status]);

  useEffect(() => {
    if (status !== "running") return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 10 && next > 0) pulse(next <= 3 ? 720 : 540, 0.06);
      if (next === 0) {
        setStatus("finished");
        pulse(180, 0.7);
        if (settings.vibrationEnabled && "vibrate" in navigator) navigator.vibrate([180, 100, 180]);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [pulse, settings.vibrationEnabled, status]);

  const runCountdown = useCallback(async () => {
    setScreen("timer");
    setStatus("countdown");
    setRemaining(settings.durationSec);
    setLastMinuteShown(false);
    setOverlay(false);
    await requestWakeLock();
    for (const label of ["3", "2", "1", "START"]) {
      setCountdown(label);
      pulse(label === "START" ? 660 : 400, label === "START" ? 0.25 : 0.1);
      await new Promise((resolve) => setTimeout(resolve, label === "START" ? 500 : 1000));
    }
    setCountdown("");
    endAt.current = Date.now() + settings.durationSec * 1000;
    setStatus("running");
  }, [pulse, requestWakeLock, settings.durationSec]);

  const pause = () => {
    if (status === "running") {
      pausedAt.current = remaining;
      setStatus("paused");
    } else if (status === "paused") {
      endAt.current = Date.now() + pausedAt.current * 1000;
      setStatus("running");
      setOverlay(false);
    }
  };

  const resetTimer = () => {
    setConfirm(null);
    setRemaining(settings.durationSec);
    runCountdown();
  };

  const goSetup = () => {
    setConfirm(null);
    setOverlay(false);
    setScreen("setup");
    setStatus("idle");
    releaseWakeLock();
  };

  const randomizeDraft = () => {
    let left: Wind;
    let right: Wind;
    do {
      left = winds[Math.floor(Math.random() * winds.length)];
      right = winds[Math.floor(Math.random() * winds.length)];
    } while (left === right);
    setSettingsDraft((s) => ({ ...s, leftWind: left, rightWind: right }));
    setWindsConcealed(true);
  };

  const progress = settings.durationSec ? remaining / settings.durationSec : 0;
  const urgency = remaining <= 10 ? "critical" : remaining <= 30 ? "danger" : remaining <= 60 ? "warning" : "normal";

  if (memoEditorOpen) {
    return (
      <main className="memo-editor-screen">
        <header className="memo-editor-header">
          <div>
            <span>GAME SETTINGS</span>
            <h1>対局設定</h1>
          </div>
          <button aria-label="設定編集をキャンセル" onClick={() => setMemoEditorOpen(false)}>×</button>
        </header>
        <section className="settings-editor-body">
          <div className="editor-section">
            <div className="editor-section-title"><span>自風</span><button onClick={randomizeDraft}>重複なしで抽選</button></div>
            <div className="editor-winds">
              {(["left", "right"] as const).map((side) => (
                <div key={side}>
                  <label>{side === "left" ? "左プレイヤー" : "右プレイヤー"}</label>
                  <div>
                    {winds.map((wind) => (
                      <button key={wind} className={!windsConcealed && settingsDraft[side === "left" ? "leftWind" : "rightWind"] === wind ? "active" : ""} onClick={() => {
                        setWindsConcealed(false);
                        setSettingsDraft((s) => ({ ...s, [side === "left" ? "leftWind" : "rightWind"]: wind }));
                      }}>{wind}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {windsConcealed && <p className="draw-notice">抽選済み。自風はタイマー開始時に公開されます。</p>}
          </div>
          <div className="editor-section">
            <span className="editor-label">制限時間</span>
            <div className="editor-duration">
              <button onClick={() => setSettingsDraft((s) => ({ ...s, durationSec: Math.max(30, s.durationSec - 30) }))}>−30秒</button>
              <output>{formatTime(settingsDraft.durationSec)}</output>
              <button onClick={() => setSettingsDraft((s) => ({ ...s, durationSec: Math.min(600, s.durationSec + 30) }))}>＋30秒</button>
            </div>
          </div>
          <div className="editor-section editor-memo">
            <label htmlFor="memo-editor">ローカルルール・メモ</label>
            <textarea id="memo-editor" maxLength={200} value={memoDraft} placeholder={"例：ダブル役満なし\n流局時は親流れ"} onChange={(e) => setMemoDraft(e.target.value)} />
            <div className="memo-editor-count">{memoDraft.length} / 200</div>
          </div>
          <div className="editor-toggles">
            <button className={settingsDraft.soundEnabled ? "active" : ""} onClick={() => setSettingsDraft((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}>効果音 {settingsDraft.soundEnabled ? "ON" : "OFF"}</button>
            <button className={settingsDraft.vibrationEnabled ? "active" : ""} onClick={() => setSettingsDraft((s) => ({ ...s, vibrationEnabled: !s.vibrationEnabled }))}>振動 {settingsDraft.vibrationEnabled ? "ON" : "OFF"}</button>
          </div>
        </section>
        <footer className="memo-editor-actions">
          <button onClick={() => setMemoEditorOpen(false)}>キャンセル</button>
          <button onClick={() => {
            setSettings({ ...settingsDraft, memo: memoDraft });
            setMemoEditorOpen(false);
          }}>保存して戻る</button>
        </footer>
      </main>
    );
  }

  if (screen === "setup") {
    return (
      <main className="app-shell setup-shell">
        <header className="brand-row">
          <div><span className="eyebrow">TWO PLAYER MAHJONG</span><h1>十七歩</h1></div>
          <div className="setup-header-actions">
            <button className="setup-edit-button" onClick={() => {
              setSettingsDraft(settings);
              setMemoDraft(settings.memo);
              setMemoEditorOpen(true);
            }}>設定を編集</button>
            <div className="edition">卓上計時盤 <b>17</b></div>
          </div>
        </header>
        <section className="setup-grid">
          {(["left", "right"] as const).map((side) => (
            <div className="player-panel" key={side}>
              <p className="panel-label">{side === "left" ? "左プレイヤー" : "右プレイヤー"}</p>
              <div className={`wind-preview ${windsConcealed ? "concealed" : ""}`}>
                <span>{windsConcealed ? "?" : settings[side === "left" ? "leftWind" : "rightWind"]}</span>
                <small>{windsConcealed ? "開始まで非公開" : "自風"}</small>
              </div>
              <p className="wind-status">{windsConcealed ? "設定済み・開始時に公開" : "設定済み"}</p>
            </div>
          ))}
          <div className="center-settings">
            <label className="setting-label">制限時間</label>
            <output className="duration-summary">{formatTime(settings.durationSec)}</output>
            <div className="memo-summary">
              <span>ローカルルール・メモ</span>
              <p>{settings.memo || "メモなし"}</p>
            </div>
            <div className="status-summary" aria-label="効果音と振動の設定">
              <span>効果音 <b>{settings.soundEnabled ? "ON" : "OFF"}</b></span>
              <span>振動 <b>{settings.vibrationEnabled ? "ON" : "OFF"}</b></span>
            </div>
            <button className="start-button" onClick={runCountdown} aria-label="タイマーを開始">
              <small>設定を確定して</small>
              タイマーを開始
              <span>→</span>
            </button>
          </div>
        </section>
        <div className="portrait-guard">
          <div className="rotate-icon">↻</div>
          <h2>端末を横向きにしてください</h2>
          <p>十七歩は横向きの卓上表示に最適化されています</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell timer-shell ${urgency}`} onClick={() => status !== "countdown" && setOverlay(true)}>
      <div className="table-grain" />
      <WindTile wind={settings.leftWind} side="left" />
      <section className="timer-center">
        <div className="round-mark">17 STEPS <i /> THINKING TIME</div>
        {status === "finished" ? (
          <div className="finish-panel" aria-live="assertive" onClick={(e) => e.stopPropagation()}>
            <span className="finish-kicker">THINKING TIME ENDED</span>
            <div className="time-up">TIME UP</div>
            <div className="timer-value">00:00</div>
            <p className="finish-message">考慮時間終了</p>
            <small>和了・流局を確認してください</small>
            <div className="finish-actions">
              <button onClick={resetTimer}>もう一度</button>
              <button onClick={goSetup}>設定へ戻る</button>
            </div>
          </div>
        ) : (
          <>
            <div className="timer-value" aria-live="polite">{formatTime(remaining)}</div>
            {status === "paused" && <div className="paused">PAUSED</div>}
            {remaining <= 60 && remaining > 0 && !lastMinuteShown && <button className="last-minute" onAnimationEnd={() => setLastMinuteShown(true)}>LAST 60 SECONDS</button>}
            {remaining <= 30 && <div className="progress"><span style={{ width: `${progress * 100}%` }} /></div>}
          </>
        )}
        {settings.memo && <p className="timer-memo">{settings.memo}</p>}
        {status !== "finished" && <p className="tap-hint">画面中央をタップして操作</p>}
      </section>
      <WindTile wind={settings.rightWind} side="right" />

      {status === "countdown" && <div className="countdown-overlay"><span key={countdown}>{countdown}</span></div>}
      {status === "finished" && <div className="finish-flash" />}
      {overlay && status !== "countdown" && (
        <div className="control-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="overlay-card">
            <button className="close" aria-label="操作パネルを閉じる" onClick={() => setOverlay(false)}>×</button>
            <div className="mini-state"><b>{settings.leftWind}</b><span>{formatTime(remaining)}</span><b>{settings.rightWind}</b></div>
            <div className="control-buttons">
              <button onClick={pause} disabled={status === "finished"}>{status === "paused" ? "再開" : "一時停止"}</button>
              <button onClick={() => setConfirm("reset")}>最初から</button>
              <button onClick={() => setConfirm("setup")}>設定に戻る</button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="confirm-layer" onClick={(e) => e.stopPropagation()}>
          <div className="confirm-box">
            <h2>{confirm === "reset" ? "タイマーを最初からやり直しますか？" : "タイマーを終了して設定画面に戻りますか？"}</h2>
            <div><button onClick={() => setConfirm(null)}>キャンセル</button><button className="confirm-action" onClick={confirm === "reset" ? resetTimer : goSetup}>実行する</button></div>
          </div>
        </div>
      )}
      <div className="portrait-guard"><div className="rotate-icon">↻</div><h2>端末を横向きにしてください</h2><p>十七歩は横向きの卓上表示に最適化されています</p></div>
    </main>
  );
}
