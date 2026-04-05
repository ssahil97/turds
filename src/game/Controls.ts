import { TurnPhase } from "../types/game";

export interface InputState {
  moveX: number;
  moveZ: number;
  cameraRotX: number;
  cameraRotY: number;
  aimDeltaX: number;
  aimDeltaY: number;
  fire: boolean;
  switchToAim: boolean;
  weaponSelect: number; // -1 = none, 0-2 = weapon
}

export class Controls {
  private keys: Set<string> = new Set();
  private joystickActive = false;
  private joystickCenter = { x: 0, y: 0 };
  private joystickCurrent = { x: 0, y: 0 };
  private cameraDragActive = false;
  private cameraDragStart = { x: 0, y: 0 };
  private cameraDragDelta = { x: 0, y: 0 };
  private aimDragActive = false;
  private aimDragStart = { x: 0, y: 0 };
  private aimDragDelta = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;
  private cameraDragPointerId: number | null = null;
  private pendingFire = false;
  private pendingSwitchToAim = false;
  private pendingWeaponSelect = -1;
  turnPhase: TurnPhase = "move";

  constructor(private canvas: HTMLCanvasElement) {
    this.setupKeyboard();
    this.setupPointer();
  }

  private setupKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === " " && this.turnPhase === "aim") {
        this.pendingFire = true;
      }
      if (e.key === "Tab" || e.key === "e") {
        if (this.turnPhase === "move") {
          e.preventDefault();
          this.pendingSwitchToAim = true;
        }
      }
      if (e.key >= "1" && e.key <= "3") {
        this.pendingWeaponSelect = parseInt(e.key) - 1;
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  private setupPointer(): void {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onPointerDown(e: PointerEvent): void {
    const relX = e.clientX / window.innerWidth;

    if (this.turnPhase === "move") {
      if (relX < 0.4) {
        this.joystickActive = true;
        this.joystickPointerId = e.pointerId;
        this.joystickCenter = { x: e.clientX, y: e.clientY };
        this.joystickCurrent = { x: e.clientX, y: e.clientY };
        this.canvas.setPointerCapture(e.pointerId);
      } else {
        this.cameraDragActive = true;
        this.cameraDragPointerId = e.pointerId;
        this.cameraDragStart = { x: e.clientX, y: e.clientY };
        this.cameraDragDelta = { x: 0, y: 0 };
        this.canvas.setPointerCapture(e.pointerId);
      }
    } else if (this.turnPhase === "aim") {
      this.aimDragActive = true;
      this.aimDragStart = { x: e.clientX, y: e.clientY };
      this.aimDragDelta = { x: 0, y: 0 };
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.joystickActive && e.pointerId === this.joystickPointerId) {
      this.joystickCurrent = { x: e.clientX, y: e.clientY };
    }
    if (this.cameraDragActive && e.pointerId === this.cameraDragPointerId) {
      this.cameraDragDelta = {
        x: e.clientX - this.cameraDragStart.x,
        y: e.clientY - this.cameraDragStart.y,
      };
    }
    if (this.aimDragActive) {
      this.aimDragDelta = {
        x: e.clientX - this.aimDragStart.x,
        y: e.clientY - this.aimDragStart.y,
      };
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.joystickPointerId) {
      this.joystickActive = false;
      this.joystickPointerId = null;
      this.joystickCurrent = { ...this.joystickCenter };
    }
    if (e.pointerId === this.cameraDragPointerId) {
      this.cameraDragActive = false;
      this.cameraDragPointerId = null;
      this.cameraDragDelta = { x: 0, y: 0 };
    }
    if (this.aimDragActive) {
      this.aimDragActive = false;
      this.aimDragDelta = { x: 0, y: 0 };
    }
  }

  getInput(): InputState {
    const input: InputState = {
      moveX: 0,
      moveZ: 0,
      cameraRotX: 0,
      cameraRotY: 0,
      aimDeltaX: 0,
      aimDeltaY: 0,
      fire: false,
      switchToAim: false,
      weaponSelect: -1,
    };

    // Keyboard movement
    if (this.keys.has("w") || this.keys.has("arrowup")) input.moveZ -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) input.moveZ += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) input.moveX -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) input.moveX += 1;

    // Keyboard camera
    if (this.keys.has("q")) input.cameraRotX -= 1;
    if (this.keys.has("e") && this.turnPhase !== "move") input.cameraRotX += 1;

    // Joystick
    if (this.joystickActive) {
      const dx = this.joystickCurrent.x - this.joystickCenter.x;
      const dy = this.joystickCurrent.y - this.joystickCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const deadzone = 15;
      if (dist > deadzone) {
        const mag = Math.min(1, (dist - deadzone) / 60);
        input.moveX = (dx / dist) * mag;
        input.moveZ = (dy / dist) * mag;
      }
    }

    // Camera drag
    if (this.cameraDragActive) {
      input.cameraRotX = this.cameraDragDelta.x * 0.003;
      input.cameraRotY = this.cameraDragDelta.y * 0.003;
      this.cameraDragDelta = { x: 0, y: 0 };
      this.cameraDragStart = { x: this.cameraDragStart.x + this.cameraDragDelta.x, y: this.cameraDragStart.y + this.cameraDragDelta.y };
    }

    // Aim drag
    if (this.aimDragActive) {
      input.aimDeltaX = this.aimDragDelta.x * 0.003;
      input.aimDeltaY = this.aimDragDelta.y * 0.003;
      this.aimDragDelta = { x: 0, y: 0 };
    }

    // Pending actions
    if (this.pendingFire) {
      input.fire = true;
      this.pendingFire = false;
    }
    if (this.pendingSwitchToAim) {
      input.switchToAim = true;
      this.pendingSwitchToAim = false;
    }
    if (this.pendingWeaponSelect >= 0) {
      input.weaponSelect = this.pendingWeaponSelect;
      this.pendingWeaponSelect = -1;
    }

    return input;
  }

  dispose(): void {
    // Listeners are on window/canvas, will be GC'd with the canvas
  }
}
