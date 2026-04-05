import React, { useState, useEffect, useRef, useCallback } from "react";
import { GameEngine, GameEvent, GameEngineState } from "./game/GameEngine";
import { GameClient } from "./network/client";
import { GameState, ServerMessage, DEFAULT_WEAPON, Weapon } from "./types/game";
import { Lobby } from "./lobby/Lobby";
import { HUD } from "./game/HUD";

function getRoomId(): string {
  const hash = window.location.hash.slice(1);
  if (hash) return hash;
  const id = Math.random().toString(36).slice(2, 8);
  window.location.hash = id;
  return id;
}

export const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [engineState, setEngineState] = useState<GameEngineState | null>(null);
  const [phase, setPhase] = useState<"lobby" | "playing" | "ended">("lobby");
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const clientRef = useRef<GameClient | null>(null);

  // Initialize client
  useEffect(() => {
    const roomId = getRoomId();
    const client = new GameClient(roomId);
    clientRef.current = client;

    const unsub = client.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case "sync":
          setGameState(msg.state);
          if (msg.state.phase === "playing") {
            setPhase("playing");
          }
          break;
        case "state_update":
          setGameState(msg.state);
          if (msg.state.phase === "playing" && phase !== "playing") {
            setPhase("playing");
          }
          if (msg.state.phase === "ended") {
            setPhase("ended");
          }
          // Update engine if it exists
          if (engineRef.current) {
            engineRef.current.updateGameState(msg.state);
          }
          break;
        case "fire":
          if (engineRef.current) {
            engineRef.current.handleFireEvent(
              msg.weaponIndex,
              msg.origin,
              msg.direction,
              msg.power,
              msg.teamIndex
            );
          }
          break;
        case "game_over":
          setPhase("ended");
          break;
      }
    });

    return () => {
      unsub();
      client.close();
    };
  }, []);

  // Initialize game engine when phase changes to playing
  useEffect(() => {
    if (phase !== "playing" || !containerRef.current || !gameState || !clientRef.current) return;
    if (engineRef.current) return; // already initialized

    const handleEvent = (event: GameEvent) => {
      if (event.type === "state_changed") {
        setEngineState(event.state as GameEngineState);
        return;
      }
      // Send to server
      if (clientRef.current) {
        clientRef.current.send(event as any);
      }
    };

    const engine = new GameEngine(containerRef.current, handleEvent);
    engine.initGame(gameState, clientRef.current.playerId);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [phase, gameState]);

  const handleGameStart = useCallback(() => {
    // This is called when the lobby detects game has started
  }, []);

  const currentWeapons: Weapon[] = (() => {
    if (!gameState || !engineState) return [DEFAULT_WEAPON, DEFAULT_WEAPON, DEFAULT_WEAPON];
    const team = gameState.teams[engineState.currentTeamIndex];
    return team?.weapons || [DEFAULT_WEAPON, DEFAULT_WEAPON, DEFAULT_WEAPON];
  })();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {phase === "lobby" && clientRef.current && (
        <Lobby
          client={clientRef.current}
          gameState={gameState}
          onGameStart={handleGameStart}
        />
      )}

      {(phase === "playing" || phase === "ended") && (
        <>
          <div
            ref={containerRef}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
          />
          <HUD
            engineState={engineState}
            weapons={currentWeapons}
            onSwitchToAim={() => clientRef.current?.send({ type: "switch_to_aim" })}
            onFire={() => {
              if (engineRef.current && engineState) {
                const char = gameState?.teams[engineState.currentTeamIndex]?.characters[engineState.currentCharIndex];
                if (char) {
                  const aimAngle = engineState.aimAngle;
                  const aimElev = engineState.aimElevation;
                  clientRef.current?.send({
                    type: "fire",
                    weaponIndex: engineState.selectedWeaponIndex,
                    origin: [char.x, char.y + 0.8, char.z],
                    direction: [
                      Math.sin(aimAngle) * Math.cos(aimElev),
                      Math.sin(aimElev),
                      Math.cos(aimAngle) * Math.cos(aimElev),
                    ],
                    power: engineState.power,
                  });
                }
              }
            }}
            onWeaponSelect={(idx) => engineRef.current?.setSelectedWeapon(idx)}
            onPowerChange={(p) => engineRef.current?.setPower(p)}
          />

          {phase === "ended" && (
            <div style={endScreenStyles.overlay}>
              <div style={endScreenStyles.card}>
                <h1>Game Over!</h1>
                {gameState?.winnerTeamIndex != null && gameState.winnerTeamIndex >= 0 ? (
                  <p>
                    <span style={{ color: gameState.teams[gameState.winnerTeamIndex]?.color }}>
                      {gameState.teams[gameState.winnerTeamIndex]?.name}
                    </span>{" "}
                    wins!
                  </p>
                ) : (
                  <p>It's a draw!</p>
                )}
                <button
                  style={endScreenStyles.button}
                  onClick={() => window.location.reload()}
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const endScreenStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.7)",
    zIndex: 100,
  },
  card: {
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: "40px 60px",
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.2)",
  },
  button: {
    padding: "12px 32px",
    background: "#e74c3c",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: 20,
  },
};
