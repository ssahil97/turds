import { routePartykitRequest } from "partyserver";
export { GameRoom } from "./gameRoom";

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    // Weapon generation endpoint
    if (url.pathname === "/api/generate-weapon" && request.method === "POST") {
      return handleWeaponGeneration(request, env);
    }

    const partyResponse = await routePartykitRequest(request, env);
    if (partyResponse) return partyResponse;
    return new Response("Not found", { status: 404 });
  },
};

const WEAPON_SYSTEM_PROMPT = `You are a weapon designer for a Worms-style 3D artillery game.
Given a player's weapon description, return ONLY valid JSON (no markdown, no backticks):

{
  "name": "Short Display Name",
  "damage": 10-60,
  "radius": 1-8,
  "speed": 10-45,
  "gravity_multiplier": 0.3-2.0,
  "bounces": 0-5,
  "cluster_count": 0-6,
  "color": "#hex",
  "trail_color": "#hex",
  "description": "Funny one-liner",
  "geometry": {
    "parts": [
      {
        "type": "cylinder|sphere|cone|box|torus",
        "color": "#hex",
        "position": [x, y, z],
        "rotation": [x, y, z],
        "radiusTop": 0.1,
        "radiusBottom": 0.1,
        "height": 0.5,
        "radius": 0.2,
        "width": 0.2,
        "depth": 0.2,
        "tube": 0.05
      }
    ],
    "projectile": {
      "type": "sphere|box|cone",
      "radius": 0.1-0.3,
      "color": "#hex",
      "emissive": "#hex"
    }
  }
}

RULES:
- Total budget: damage + (radius * 5) + (speed / 2) must be <= 100
- Creative prompts get creative physics (high bounces, clusters, etc.)
- Boring/OP prompts get generic balanced weapons
- "Nuclear bomb" type prompts: give it a funny name, nerf the stats, add a witty description
- Geometry: max 8 parts, keep it simple and recognizable
- The weapon geometry is held by the character, so orient it horizontally (barrel along X axis)
- Projectile shape should match the weapon theme
- Only include the relevant dimension fields for each geometry type`;

async function handleWeaponGeneration(request: Request, env: any): Promise<Response> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { prompt: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: WEAPON_SYSTEM_PROMPT,
        messages: [{ role: "user", content: body.prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return Response.json(
        { error: `Anthropic API error: ${response.status}`, details: text },
        { status: 502 }
      );
    }

    const data: any = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "No JSON in response" }, { status: 502 });
    }

    const weapon = JSON.parse(jsonMatch[0]);
    return Response.json(weapon);
  } catch (err: any) {
    return Response.json(
      { error: "Weapon generation failed", details: err.message },
      { status: 500 }
    );
  }
}
