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

  const randomize = () => {
    let left: Wind;
    let right: Wind;
    do {
      left = winds[Math.floor(Math.random() * winds.length)];
      right = winds[Math.floor(Math.random() * winds.length)];
    } while (left === right);
    setSettings((s) => ({ ...s, leftWind: left, rightWind: right }));
  };

  const progress = settings.durationSec ? remaining / settings.durationSec : 0;
  const urgency = remaining <= 10 ? "critical" : remaining <= 30 ? "danger" : remaining <= 60 ? "warning" : "normal";

  if (screen === "setup") {
    return (
      <main className="app-shell setup-shell">
        <header className="brand-row">
          <div><span className="eyebrow">TWO PLAYER MAHJONG</span><h1>十七歩</h1></div>
          <div className="edition">卓上計時盤 <b>17</b></div>
        </header>
        <section className="setup-grid">
          {(["left", "right"] as const).map((side) => (
            <div className="player-panel" key={side}>
              <p className="panel-label">{side === "left" ? "左プレイヤー" : "右プレイヤー"}</p>
              <div className="wind-preview"><span>{settings[side === "left" ? "leftWind" : "rightWind"]}</span><small>自風</small></div>
              <div className="wind-buttons" role="group" aria-label={`${side === "left" ? "左" : "右"}の自風`}>
                {winds.map((wind) => (
                  <button key={wind} className={settings[side === "left" ? "leftWind" : "rightWind"] === wind ? "active" : ""} onClick={() => setSettings((s) => ({ ...s, [side === "left" ? "leftWind" : "rightWind"]: wind }))}>{wind}</button>
                ))}
              </div>
            </div>
          ))}
          <button className="random-button" onClick={randomize}><span>⟳</span> 重複なしでランダム抽選</button>
          <div className="center-settings">
            <label className="setting-label">制限時間</label>
            <div className="duration-control">
              <button aria-label="30秒減らす" onClick={() => setSettings((s) => ({ ...s, durationSec: Math.max(30, s.durationSec - 30) }))}>−30</button>
              <output>{formatTime(settings.durationSec)}</output>
              <button aria-label="30秒増やす" onClick={() => setSettings((s) => ({ ...s, durationSec: Math.min(600, s.durationSec + 30) }))}>+30</button>
            </div>
            <label className="memo-label">ローカルルール・メモ
              <input maxLength={200} value={settings.memo} placeholder="例：ダブル役満なし / 流局時…" onChange={(e) => setSettings((s) => ({ ...s, memo: e.target.value }))} />
            </label>
            <div className="toggles">
              <button className={settings.soundEnabled ? "on" : ""} onClick={() => setSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}>効果音 <span>{settings.soundEnabled ? "ON" : "OFF"}</span></button>
              <button className={settings.vibrationEnabled ? "on" : ""} onClick={() => setSettings((s) => ({ ...s, vibrationEnabled: !s.vibrationEnabled }))}>振動 <span>{settings.vibrationEnabled ? "ON" : "OFF"}</span></button>
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
        {status === "finished" && <div className="time-up">TIME UP</div>}
        <div className="timer-value" aria-live="polite">{formatTime(remaining)}</div>
        {status === "paused" && <div className="paused">PAUSED</div>}
        {remaining <= 60 && remaining > 0 && !lastMinuteShown && <button className="last-minute" onAnimationEnd={() => setLastMinuteShown(true)}>LAST 60 SECONDS</button>}
        {remaining <= 30 && <div className="progress"><span style={{ width: `${progress * 100}%` }} /></div>}
        {settings.memo && <p className="timer-memo">{settings.memo}</p>}
        <p className="tap-hint">画面中央をタップして操作</p>
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
