import { PartySocket } from "partysocket";
import { ClientMessage, ServerMessage } from "../types/game";

const PARTY_HOST = import.meta.env.VITE_PARTY_HOST || window.location.host;

export type MessageHandler = (msg: ServerMessage) => void;

export class GameClient {
  private socket: PartySocket;
  private handlers: MessageHandler[] = [];
  playerId = "";

  constructor(roomId: string) {
    this.socket = new PartySocket({
      host: PARTY_HOST,
      party: "game-room",
      room: roomId,
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "sync") {
          this.playerId = msg.playerId;
        }
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch {
        // ignore parse errors
      }
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(msg: ClientMessage): void {
    this.socket.send(JSON.stringify(msg));
  }

  join(name: string): void {
    this.send({ type: "join", name });
  }

  close(): void {
    this.socket.close();
  }
}
