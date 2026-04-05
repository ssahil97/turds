import React from "react";
import { GameEngineState } from "./GameEngine";
import { Weapon, DEFAULT_WEAPON } from "../types/game";

interface HUDProps {
  engineState: GameEngineState | null;
  weapons: Weapon[];
  onSwitchToAim: () => void;
  onFire: () => void;
  onWeaponSelect: (idx: number) => void;
  onPowerChange: (power: number) => void;
}

export const HUD: React.FC<HUDProps> = ({
  engineState,
  weapons,
  onSwitchToAim,
  onFire,
  onWeaponSelect,
  onPowerChange,
}) => {
  if (!engineState || engineState.phase !== "playing") return null;

  const { turnPhase, turnTimer, isMyTurn, currentTeamIndex, teams, selectedWeaponIndex, power } =
    engineState;

  const currentTeam = teams[currentTeamIndex];

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.turnInfo}>
          <span
            style={{
              ...styles.teamDot,
              background: currentTeam?.color || "#fff",
            }}
          />
          <span>{currentTeam?.name}'s turn</span>
          {isMyTurn && <span style={styles.yourTurn}>YOUR TURN</span>}
        </div>
        <div style={styles.timer}>
          <span style={{ color: turnTimer <= 5 ? "#ff4444" : "#fff" }}>
            {turnTimer}s
          </span>
        </div>
        <div style={styles.phaseLabel}>
          {turnPhase.toUpperCase()}
        </div>
      </div>

      {/* Team health bars */}
      <div style={styles.teamsPanel}>
        {teams.map((team, ti) => (
          <div key={ti} style={styles.teamRow}>
            <span style={{ color: team.color, fontWeight: 700, fontSize: 11 }}>
              {team.name}
            </span>
            <div style={styles.charHealthRow}>
              {team.characters.map((char, ci) => (
                <div
                  key={ci}
                  style={{
                    ...styles.miniHealth,
                    opacity: char.alive ? 1 : 0.3,
                  }}
                >
                  <div
                    style={{
                      ...styles.miniHealthFill,
                      width: `${char.health}%`,
                      background:
                        char.health > 50
                          ? "#44ff44"
                          : char.health > 25
                          ? "#ffaa00"
                          : "#ff3333",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom controls */}
      {isMyTurn && (
        <div style={styles.bottomBar}>
          {turnPhase === "move" && (
            <div style={styles.controlRow}>
              <div style={styles.hint}>WASD to move — Drag right side for camera</div>
              <button style={styles.actionButton} onClick={onSwitchToAim}>
                AIM →
              </button>
            </div>
          )}
          {turnPhase === "aim" && (
            <div style={styles.controlRow}>
              <div style={styles.weaponBar}>
                {weapons.map((w, i) => (
                  <button
                    key={i}
                    style={{
                      ...styles.weaponButton,
                      border:
                        i === selectedWeaponIndex
                          ? "2px solid #ffff00"
                          : "2px solid rgba(255,255,255,0.2)",
                    }}
                    onClick={() => onWeaponSelect(i)}
                  >
                    <span style={{ fontSize: 10 }}>{i + 1}</span>
                    <span style={{ fontSize: 10 }}>{w.name}</span>
                  </button>
                ))}
              </div>
              <div style={styles.powerRow}>
                <span style={{ fontSize: 11 }}>Power</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={power}
                  onChange={(e) => onPowerChange(Number(e.target.value))}
                  style={styles.slider}
                />
                <span style={{ fontSize: 11, minWidth: 30 }}>{power}%</span>
              </div>
              <button
                style={{ ...styles.actionButton, background: "#e74c3c" }}
                onClick={onFire}
              >
                FIRE!
              </button>
            </div>
          )}
          {turnPhase === "fire" && (
            <div style={styles.hint}>Watching projectile...</div>
          )}
        </div>
      )}

      {/* Spectating */}
      {!isMyTurn && (
        <div style={styles.bottomBar}>
          <div style={styles.hint}>
            Waiting for {currentTeam?.name}...
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#fff",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)",
    pointerEvents: "auto",
  },
  turnInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
  },
  teamDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    display: "inline-block",
  },
  yourTurn: {
    background: "#ffff00",
    color: "#000",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
  },
  timer: {
    fontSize: 28,
    fontWeight: 700,
  },
  phaseLabel: {
    fontSize: 12,
    opacity: 0.5,
    letterSpacing: 2,
  },
  teamsPanel: {
    position: "absolute",
    top: 56,
    right: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    pointerEvents: "auto",
  },
  teamRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  charHealthRow: {
    display: "flex",
    gap: 3,
  },
  miniHealth: {
    width: 40,
    height: 6,
    background: "rgba(255,255,255,0.15)",
    borderRadius: 3,
    overflow: "hidden",
  },
  miniHealthFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.3s",
  },
  bottomBar: {
    padding: "12px 16px",
    background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)",
    pointerEvents: "auto",
  },
  controlRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
  hint: {
    fontSize: 11,
    opacity: 0.5,
    textAlign: "center",
  },
  actionButton: {
    padding: "12px 32px",
    background: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  weaponBar: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
  },
  weaponButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "6px 12px",
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  powerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  slider: {
    width: 150,
    accentColor: "#e74c3c",
  },
};
