import React, { useState, useCallback } from "react";
import { Weapon, DEFAULT_WEAPON, GameState } from "../types/game";
import { GameClient } from "../network/client";
import { WeaponPreview } from "./WeaponPreview";

interface LobbyProps {
  client: GameClient;
  gameState: GameState | null;
  onGameStart: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ client, gameState, onGameStart }) => {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [weaponPrompts, setWeaponPrompts] = useState(["", "", ""]);
  const [weapons, setWeapons] = useState<(Weapon | null)[]>([null, null, null]);
  const [generating, setGenerating] = useState<boolean[]>([false, false, false]);

  const handleJoin = useCallback(() => {
    if (!name.trim()) return;
    client.join(name.trim());
    setJoined(true);
  }, [client, name]);

  const generateWeapon = useCallback(
    async (index: number) => {
      const prompt = weaponPrompts[index];
      if (!prompt.trim()) return;

      setGenerating((g) => {
        const next = [...g];
        next[index] = true;
        return next;
      });

      try {
        const res = await fetch("/api/generate-weapon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim() }),
        });

        if (!res.ok) throw new Error("Generation failed");

        const weapon: Weapon = await res.json();
        setWeapons((w) => {
          const next = [...w];
          next[index] = weapon;
          return next;
        });
      } catch (err) {
        console.error("Weapon generation failed:", err);
        // Fallback to default weapon with custom name
        setWeapons((w) => {
          const next = [...w];
          next[index] = { ...DEFAULT_WEAPON, name: prompt.trim().slice(0, 20) };
          return next;
        });
      } finally {
        setGenerating((g) => {
          const next = [...g];
          next[index] = false;
          return next;
        });
      }
    },
    [weaponPrompts]
  );

  const handleReady = useCallback(() => {
    const finalWeapons = weapons.map((w) => w || DEFAULT_WEAPON);
    client.send({ type: "weapons_ready", weapons: finalWeapons });
  }, [client, weapons]);

  const handleStart = useCallback(() => {
    client.send({ type: "start_game" });
  }, [client]);

  const teamCount = gameState?.teams.length ?? 0;
  const myTeam = gameState?.teams.find(t => t.playerId === client.playerId);
  const isHost = gameState?.teams[0]?.playerId === client.playerId;
  const everyoneReady = gameState?.teams.every(t => t.ready) && teamCount >= 2;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>WORMS3D</h1>
      <p style={styles.subtitle}>Turn-based artillery mayhem</p>

      {!joined ? (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Join Game</h2>
          <input
            style={styles.input}
            placeholder="Your name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            maxLength={20}
          />
          <button style={styles.button} onClick={handleJoin}>
            Join
          </button>
          <p style={styles.hint}>
            {teamCount}/2 players in lobby
          </p>
        </div>
      ) : (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Weapon Lab</h2>
          <p style={styles.hint}>Describe 3 weapons. AI generates stats + visuals.</p>

          {weaponPrompts.map((prompt, i) => (
            <div key={i} style={styles.weaponRow}>
              <div style={styles.weaponInputRow}>
                <span style={styles.weaponNum}>{i + 1}</span>
                <input
                  style={styles.input}
                  placeholder={
                    ["e.g., Banana bomb that splits into pieces",
                     "e.g., Holy hand grenade of Antioch",
                     "e.g., Laser-guided cat launcher"][i]
                  }
                  value={prompt}
                  onChange={(e) => {
                    const next = [...weaponPrompts];
                    next[i] = e.target.value;
                    setWeaponPrompts(next);
                  }}
                />
                <button
                  style={{
                    ...styles.genButton,
                    opacity: generating[i] ? 0.5 : 1,
                  }}
                  onClick={() => generateWeapon(i)}
                  disabled={generating[i]}
                >
                  {generating[i] ? "..." : "Generate"}
                </button>
              </div>
              {weapons[i] && (
                <div style={styles.weaponPreview}>
                  <WeaponPreview weapon={weapons[i]!} />
                  <div style={styles.weaponStats}>
                    <strong>{weapons[i]!.name}</strong>
                    <span>{weapons[i]!.description}</span>
                    <span>DMG: {weapons[i]!.damage} | Radius: {weapons[i]!.radius} | Speed: {weapons[i]!.speed}</span>
                    {weapons[i]!.bounces > 0 && <span>Bounces: {weapons[i]!.bounces}</span>}
                    {weapons[i]!.cluster_count > 0 && <span>Clusters: {weapons[i]!.cluster_count}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div style={styles.buttonRow}>
            <button 
              style={{
                ...styles.button,
                opacity: myTeam?.ready ? 0.6 : 1,
                background: myTeam?.ready ? "#2ecc71" : "#e74c3c"
              }} 
              onClick={handleReady}
              disabled={myTeam?.ready}
            >
              {myTeam?.ready ? "Ready!" : "Ready Up"}
            </button>
            {isHost && (
              <button 
                style={{ 
                  ...styles.button, 
                  background: everyoneReady ? "#2ecc71" : "rgba(255,255,255,0.1)",
                  opacity: everyoneReady ? 1 : 0.5,
                  cursor: everyoneReady ? "pointer" : "not-allowed"
                }} 
                onClick={handleStart}
                disabled={!everyoneReady}
              >
                {teamCount < 2 ? "Waiting for players..." : everyoneReady ? "Start Game!" : "Waiting for ready..."}
              </button>
            )}
          </div>

          <p style={styles.hint}>
            {teamCount}/2 players —{" "}
            {gameState?.teams.map((t) => (
              <span key={t.playerId} style={{ color: t.color, fontWeight: t.ready ? "bold" : "normal" }}>
                {t.name}{t.ready ? " (Ready)" : ""} {t === gameState?.teams[gameState.teams.length-1] ? "" : " vs "}
              </span>
            ))}
          </p>
        </div>
      )}

      <p style={styles.roomId}>
        Room: {window.location.hash.slice(1) || "default"} — Share this URL to invite!
      </p>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 20,
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  },
  title: {
    fontSize: 48,
    fontWeight: 700,
    margin: 0,
    letterSpacing: 6,
    textShadow: "0 0 20px rgba(255,255,255,0.3)",
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 30,
    letterSpacing: 2,
  },
  card: {
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: 30,
    maxWidth: 600,
    width: "100%",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  cardTitle: {
    fontSize: 20,
    margin: "0 0 16px 0",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    padding: "10px 24px",
    background: "#e74c3c",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: 12,
  },
  hint: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 12,
  },
  weaponRow: {
    marginBottom: 16,
  },
  weaponInputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  weaponNum: {
    fontSize: 18,
    fontWeight: 700,
    opacity: 0.4,
    minWidth: 24,
  },
  genButton: {
    padding: "10px 16px",
    background: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  weaponPreview: {
    display: "flex",
    gap: 12,
    marginTop: 8,
    padding: 10,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    alignItems: "center",
  },
  weaponStats: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 11,
    opacity: 0.8,
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  roomId: {
    fontSize: 11,
    opacity: 0.3,
    marginTop: 20,
  },
};
